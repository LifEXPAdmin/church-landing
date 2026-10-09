import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import type { createNativeRuntime } from "../src/session/runtime.ts";
import type { ReactionPreferencesSnapshot } from "../src/interactions/reaction-preferences-controller.ts";

type Runtime = ReturnType<typeof createNativeRuntime>;
type Element = { type: unknown; props: Record<string, unknown> };
type Effect = () => void | (() => void);
type Button = { label: string; disabled?: boolean; selected?: boolean; onPress(): void };
const code = ts.transpileModule(readFileSync(new URL("../src/ui/NativeReactionPreferences.tsx", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 }
}).outputText;
function snapshot(overrides: Partial<ReactionPreferencesSnapshot> = {}): ReactionPreferencesSnapshot {
  return Object.freeze({ phase: "ready", open: true, hasPending: false, hideCounts: false, recoveryRequired: false,
    canChoose: true, canRetry: false, canRefresh: true, canClose: true, problem: null, retryAfterSeconds: null, ...overrides });
}
function deferred() {
  let resolve: () => void = () => {};
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}
function subject(initial = snapshot()) {
  let state = initial, foreground = true, pending = Promise.resolve(), activity = 0;
  const calls: Array<{ command: string; state: ReactionPreferencesSnapshot; choice?: boolean }> = [];
  const command = (name: string) => (expected: ReactionPreferencesSnapshot, choice?: boolean) => {
    calls.push({ command: name, state: expected, ...(choice === undefined ? {} : { choice }) }); return pending;
  };
  const runtime = {
    reactionPreferences: { getSnapshot: () => state, subscribe: () => () => {} },
    session: { getSnapshot: () => ({ foreground }) },
    recordForegroundActivity() { activity++; return Promise.resolve(); },
    openReactionPreferences: command("open"), closeReactionPreferences: command("close"),
    setReactionPreferences: command("choose"), retryReactionPreferences: command("retry"), refreshReactionPreferences: command("refresh")
  } as unknown as Runtime;
  return { runtime, calls, activity: () => activity, set: (next: ReactionPreferencesSnapshot) => { state = next; },
    foreground: (next: boolean) => { foreground = next; }, hold: (promise: Promise<void>) => { pending = promise; } };
}

/** Executes the actual component with hook slots and explicit commit/cleanup.
 * Descriptors do not model React scheduling, native layout or screen readers. */
function panel(initialRuntime: Runtime, platform = "ios") {
  const slots: unknown[] = [], pending: Array<{ index: number; effect: Effect }> = [], announcements: string[] = [];
  const cleanups = new Map<number, () => void>();
  let cursor = 0, runtime = initialRuntime, tree: Element | null;
  function effect(callback: Effect, dependencies: unknown[]) {
    const index = cursor++, previous = slots[index] as unknown[] | undefined;
    if (!previous || dependencies.length !== previous.length || dependencies.some((value, i) => !Object.is(value, previous[i])))
      pending.push({ index, effect: callback });
    slots[index] = dependencies;
  }
  const jsx = (type: unknown, props: Element["props"]): Element => ({ type, props });
  const modules: Record<string, unknown> = {
    react: {
      useRef(initial: unknown) { const index = cursor++; if (!(index in slots)) slots[index] = { current: initial }; return slots[index]; },
      useEffect: effect, useLayoutEffect: effect,
      useSyncExternalStore(_subscribe: unknown, getSnapshot: () => unknown) { return getSnapshot(); }
    },
    "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "Fragment" },
    "react-native": { Platform: { OS: platform }, AccessibilityInfo: {
      announceForAccessibility(message: string) { announcements.push(message); }
    } },
    "./primitives": { Button: "Button", Text: "Text" }
  };
  const output: { NativeReactionPreferences?: (props: { runtime: Runtime }) => Element | null } = {};
  runInNewContext(code, { exports: output, require(name: string) {
    assert.ok(Object.hasOwn(modules, name), "Unexpected preference UI dependency: " + name); return modules[name];
  } }, { timeout: 1000 });
  assert.equal(typeof output.NativeReactionPreferences, "function");
  function flush() {
    for (const { index, effect: callback } of pending.splice(0)) {
      cleanups.get(index)?.(); cleanups.delete(index);
      const cleanup = callback(); if (cleanup) cleanups.set(index, cleanup);
    }
  }
  function render(nextRuntime = runtime, commit = true) {
    runtime = nextRuntime; cursor = 0; tree = output.NativeReactionPreferences!({ runtime }); if (commit) flush();
  }
  function elements(value: unknown): Element[] {
    if (Array.isArray(value)) return Array.from(value).flatMap(elements);
    if (!value || typeof value !== "object") return [];
    const element = value as Element; return [element, ...elements(element.props?.children)];
  }
  const buttons = () => elements(tree).filter(element => element.type === "Button").map(element => element.props as unknown as Button);
  function button(label: string) { const found = buttons().find(value => value.label === label); assert.ok(found, "Missing button: " + label); return found; }
  render();
  return { announcements, render, flush, buttons, button, text: () => JSON.stringify(tree),
    unmount() { for (const cleanup of cleanups.values()) cleanup(); cleanups.clear(); pending.length = 0; },
    press(label: string) { const selected = button(label); assert.notEqual(selected.disabled, true); selected.onPress(); }
  };
}
const settle = () => new Promise<void>(resolve => setImmediate(resolve));

test("closed and concealed preferences dispatch nothing until an explicit current mounted action", async t => {
  const closed = snapshot({ phase: "closed", open: false, hideCounts: null, canChoose: false, canClose: false });
  const s = subject(closed), ui = panel(s.runtime); t.after(ui.unmount);
  assert.deepEqual(ui.buttons().map(button => button.label), ["Reaction count settings"]);
  assert.equal(s.calls.length, 0); assert.equal(s.activity(), 0);
  const held = deferred(); s.hold(held.promise);
  const press = ui.button("Reaction count settings").onPress;
  press(); press();
  assert.equal(s.calls.length, 1); assert.equal(s.calls[0].command, "open"); assert.equal(s.calls[0].state, closed);
  assert.equal(s.activity(), 1);
  held.resolve(); await settle();
  s.set(snapshot({ phase: "concealed", open: false, hideCounts: null, canChoose: false, canClose: false }));
  press(); ui.render(); assert.equal(s.calls.length, 1); assert.equal(ui.text(), "null");
});

test("current choice and recovery copy expose only available explicit actions", async t => {
  const s = subject(), ui = panel(s.runtime); t.after(ui.unmount);
  assert.match(ui.text(), /own personal posts and comments/); assert.match(ui.text(), /Church totals, comment totals and who can see your content stay the same/);
  assert.equal(ui.button("Hide my reaction totals").disabled, false);
  assert.equal(ui.button("Show my reaction totals").disabled, true);
  assert.equal(ui.button("Show my reaction totals").selected, true);
  ui.press("Hide my reaction totals"); await settle();
  assert.equal(s.calls[0].command, "choose"); assert.equal(s.calls[0].choice, true);
  const recovery = snapshot({ hideCounts: true, recoveryRequired: true }); s.set(recovery); ui.render();
  assert.match(ui.text(), /Totals are hidden while your setting needs recovery/);
  assert.equal(ui.button("Hide my reaction totals").disabled, false, "Same-hidden repair remains an explicit choice");
  assert.equal(ui.button("Show my reaction totals").disabled, false);
  ui.press("Hide my reaction totals"); await settle();
  assert.equal(s.calls[1].state, recovery); assert.equal(s.calls[1].choice, true);
  s.set(snapshot({ hideCounts: true })); ui.render();
  assert.equal(ui.button("Hide my reaction totals").disabled, true);
  ui.press("Show my reaction totals"); await settle(); assert.equal(s.calls[2].choice, false);
});

test("pending and paused views distinguish checking current state from replaying the exact choice", async t => {
  const uncertain = snapshot({ phase: "unconfirmed", hasPending: true, canChoose: false, canRetry: true,
    canClose: false, problem: "unconfirmed" });
  const s = subject(uncertain), ui = panel(s.runtime); t.after(ui.unmount);
  assert.equal(s.calls.length, 0); assert.match(ui.text(), /Checking the current setting does not retry the save/);
  assert.equal(ui.button("Back to posts").disabled, true); assert.equal(ui.button("Hide my reaction totals").disabled, true);
  ui.press("Retry same count choice"); await settle();
  ui.press("Check current count setting"); await settle();
  assert.deepEqual(s.calls.map(call => call.command), ["retry", "refresh"]);
  assert.equal(s.calls.every(call => call.state === uncertain), true);
  const paused = snapshot({ phase: "unconfirmed", hideCounts: null, hasPending: true, canChoose: false,
    canRetry: false, canClose: false, problem: "rate-limited", retryAfterSeconds: 30 });
  s.set(paused); ui.render();
  assert.equal(ui.buttons().some(button => button.label === "Retry same count choice"), false);
  assert.equal(ui.buttons().some(button => button.label === "Hide my reaction totals"), false);
  assert.match(ui.text(), /The server requested a pause of/); assert.match(ui.text(), /30/);
  s.set(snapshot({ phase: "closed", open: false, hideCounts: null, hasPending: true, canChoose: false, canClose: false })); ui.render();
  assert.match(ui.text(), /Review it before returning to posts/);
  ui.press("Review pending count choice"); await settle(); assert.equal(s.calls.at(-1)?.command, "open");
});

test("stale, unmounted and replaced-runtime callbacks cannot act; an old completion cannot unlock a new flight", async t => {
  const s = subject(), ui = panel(s.runtime); t.after(ui.unmount);
  const oldChoice = ui.button("Hide my reaction totals").onPress;
  s.set(snapshot()); oldChoice(); assert.equal(s.calls.length, 0);
  ui.render(); const beforeUnmount = ui.button("Hide my reaction totals").onPress;
  ui.unmount(); beforeUnmount(); assert.equal(s.calls.length, 0);
  const remounted = panel(s.runtime); t.after(remounted.unmount);
  beforeUnmount(); assert.equal(s.calls.length, 0);
  const first = deferred(); s.hold(first.promise); remounted.press("Hide my reaction totals");
  const priorRuntime = remounted.button("Hide my reaction totals").onPress;
  const next = subject(), second = deferred(); next.hold(second.promise); remounted.render(next.runtime);
  priorRuntime(); assert.equal(s.calls.length, 1);
  const fresh = remounted.button("Hide my reaction totals").onPress; fresh();
  first.resolve(); await settle(); fresh(); assert.equal(next.calls.length, 1);
  second.resolve(); await settle();
  remounted.press("Back to posts"); await settle(); assert.equal(next.calls.at(-1)?.command, "close");
});

test("status messages announce only their current foreground iOS snapshot", t => {
  const messages = [
    ["unavailable", /could not be checked/], ["feature-unavailable", /currently unavailable/],
    ["refresh-required", /before choosing again/], ["recovery-required", /attention on the website/],
    ["update-required", /Update the app/], ["rate-limited", /Please wait/], ["unconfirmed", /Retry the same choice/]
  ] as const;
  const s = subject(), ui = panel(s.runtime); t.after(ui.unmount);
  for (const [problem, expected] of messages) {
    s.set(snapshot({ phase: "error", hideCounts: null, canChoose: false, problem })); ui.render();
    assert.match(ui.text(), expected); assert.match(ui.announcements.at(-1)!, expected);
  }
  const count = ui.announcements.length;
  s.foreground(false); s.set(snapshot({ phase: "saving", canChoose: false })); ui.render();
  assert.equal(ui.announcements.length, count);
  s.foreground(true); s.set(snapshot({ phase: "loading", hideCounts: null, canChoose: false })); ui.render(s.runtime, false);
  s.set(snapshot()); ui.flush(); assert.equal(ui.announcements.length, count, "Late status effects cannot announce a superseded state");
  const android = panel(subject(snapshot({ phase: "loading", hideCounts: null, canChoose: false })).runtime, "android");
  t.after(android.unmount); assert.equal(android.announcements.length, 0);
  assert.match(android.text(), /accessibilityLiveRegion/); assert.match(android.text(), /Checking your count setting/);
});
