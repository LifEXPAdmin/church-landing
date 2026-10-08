import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { createNativeFixture } from "../src/spike/native-fixture.ts";
import * as scrollPolicy from "../src/ui/feed-scroll-position.ts";
import type { ReadingSnapshot } from "../src/reading/read-controller.ts";

type Runtime = ReturnType<typeof createNativeFixture>["runtime"];
type Element = { type: unknown; props: Record<string, unknown>; key?: unknown; path?: string };
type Component = (props: Record<string, unknown>) => unknown;
type Effect = () => void | (() => void);
type Instance = { slots: unknown[]; cleanups: Map<number, () => void>; pending: Map<number, Effect> };
type ScreenProps = {
  scrollKey?: string;
  scrollRef?: (handle: { scrollTo(value: unknown): void } | null) => void | (() => void);
  onLayout?: (event: unknown) => void;
  onContentSizeChange?: (width: number, height: number) => void;
  onScroll?: (event: unknown) => void;
  onScrollBeginDrag?: (event: unknown) => void;
};
const compile = (name: string) => ts.transpileModule(readFileSync(new URL("../src/ui/" + name + ".tsx", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 }
}).outputText;
const journeyCode = compile("NativeJourney"), choicesCode = compile("NativeFeedChoices");

/** This executes authored function components and their emitted callbacks with
 * explicit renders/effect cleanup and native-ref attachment. It is not React,
 * Fabric, native layout, touch, accessibility or privacy-cover acceptance. */
function componentHarness(runtime: Runtime) {
  const instances = new Map<string, Instance>(), names = new Map<unknown, number>();
  let current: Instance | null = null, cursor = 0, dirty = false, tree: unknown;
  const hook = () => { assert.ok(current); return { instance: current, index: cursor++ }; };
  const same = (a: unknown[] | undefined, b: unknown[] | undefined) =>
    !!a && !!b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
  const effect = (work: Effect, dependencies?: unknown[]) => {
    const { instance, index } = hook();
    if (!same(instance.slots[index] as unknown[] | undefined, dependencies)) instance.pending.set(index, work);
    instance.slots[index] = dependencies;
  };
  const react = {
    useState(initial: unknown) {
      const { instance, index } = hook();
      if (!(index in instance.slots)) instance.slots[index] = typeof initial === "function" ? initial() : initial;
      return [instance.slots[index], (next: unknown) => {
        const value = typeof next === "function" ? next(instance.slots[index]) : next;
        if (!Object.is(value, instance.slots[index])) { instance.slots[index] = value; dirty = true; }
      }];
    },
    useRef(initial: unknown) {
      const { instance, index } = hook();
      if (!(index in instance.slots)) instance.slots[index] = { current: initial };
      return instance.slots[index];
    },
    useMemo(work: () => unknown, dependencies: unknown[]) {
      const { instance, index } = hook();
      const prior = instance.slots[index] as { dependencies: unknown[]; value: unknown } | undefined;
      if (!prior || !same(prior.dependencies, dependencies)) instance.slots[index] = { dependencies, value: work() };
      return (instance.slots[index] as { value: unknown }).value;
    },
    useCallback(work: unknown, dependencies: unknown[]) { return react.useMemo(() => work, dependencies); },
    useEffect: effect, useLayoutEffect: effect,
    useSyncExternalStore(_subscribe: unknown, getSnapshot: () => unknown) { return getSnapshot(); }
  };
  const jsx = (type: unknown, props: Element["props"], key?: unknown): Element => ({ type, props, key });
  const modules: Record<string, unknown> = {
    "react": react, "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "Fragment" },
    "react-native": { Platform: { OS: "ios" }, View: "View", ActivityIndicator: "ActivityIndicator",
      AccessibilityInfo: { announceForAccessibility() {} }, AppState: { isAvailable: false } },
    "../platform/session-visibility": { observeSessionVisibility: () => () => {} },
    "../platform/native-visibility": { readNativeWindowFocus: () => true },
    "../platform/native-privacy.native": { createNativePrivacySource: () => ({}) },
    "../platform/native-privacy.ts": { presentationMatches: () => true },
    "./primitives": { Screen: "Screen", Button: "Button", Card: "Card", Text: "Text" },
    "./NativePost": { NativePost: "NativePost" }, "./PasswordSignIn": { PasswordSignIn: "PasswordSignIn" },
    "./NativePrivacyPresentation": { NativePrivacyPresentation: "NativePrivacyPresentation" },
    "./theme": { useTheme: () => ({ theme: { space: { content: 12, inline: 8 }, color: { action: "blue" } } }) },
    "./feed-scroll-position": scrollPolicy
  };
  function evaluate(code: string) {
    const exports: Record<string, Component> = {};
    runInNewContext(code, { exports, require(name: string) {
      assert.ok(Object.hasOwn(modules, name), "Unexpected Journey test dependency: " + name);
      return modules[name];
    } }, { timeout: 1000 });
    return exports;
  }
  modules["./NativeFeedChoices"] = evaluate(choicesCode);
  const { NativeJourney } = evaluate(journeyCode);
  assert.equal(typeof NativeJourney, "function");
  function cleanup(instance: Instance) { for (const work of instance.cleanups.values()) work(); instance.cleanups.clear(); }
  function flushEffects() {
    for (const instance of instances.values()) for (const [index, work] of instance.pending) {
      instance.cleanups.get(index)?.(); instance.cleanups.delete(index);
      const dispose = work(); if (dispose) instance.cleanups.set(index, dispose);
      instance.pending.delete(index);
    }
  }
  function render(deferEffects = false) {
    let active = new Set<string>();
    const expand = (value: unknown, path: string): unknown => {
      if (Array.isArray(value)) return Array.from(value).map((child, index) => expand(child, path + "/" + index));
      if (!value || typeof value !== "object") return value;
      const element = value as Element;
      const nodePath = path + ":" + String(element.key ?? "");
      if (typeof element.type === "function") {
        if (!names.has(element.type)) names.set(element.type, names.size + 1);
        const id = nodePath + ":" + names.get(element.type);
        active.add(id);
        let instance = instances.get(id);
        if (!instance) { instance = { slots: [], cleanups: new Map(), pending: new Map() }; instances.set(id, instance); }
        const previous = current, previousCursor = cursor;
        current = instance; cursor = 0;
        let result: unknown;
        try { result = (element.type as Component)(element.props); } finally { current = previous; cursor = previousCursor; }
        return expand(result, id);
      }
      return { ...element, path: nodePath, props: { ...element.props, children: expand(element.props?.children, nodePath + "/children") } };
    };
    let passes = 0;
    do {
      assert.ok(++passes <= 10, "Journey render did not settle.");
      dirty = false; active = new Set();
      tree = expand(jsx(NativeJourney, { runtime, signInMode: { kind: "password" } }), "root");
    } while (dirty);
    for (const [id, instance] of instances) if (!active.has(id)) { cleanup(instance); instances.delete(id); }
    if (!deferEffects) flushEffects();
    return screen();
  }
  function elements(value: unknown): Element[] {
    if (Array.isArray(value)) return Array.from(value).flatMap(elements);
    if (!value || typeof value !== "object") return [];
    const element = value as Element;
    return [element, ...elements(element.props?.children)];
  }
  function screen() {
    const found = elements(tree).find(element => element.type === "Screen");
    assert.ok(found, "Journey must emit Screen.");
    return { id: found.path!, props: found.props as unknown as ScreenProps };
  }
  return { render, screen, flushEffects,
    replaceRuntime(next: Runtime) { runtime = next; return render(true); },
    press(label: string) {
      const found = elements(tree).find(element => element.type === "Button" && element.props.label === label);
      assert.ok(found, "Missing authored button: " + label);
      (found.props.onPress as () => void)();
    },
    unmount() { for (const instance of instances.values()) cleanup(instance); instances.clear(); }
  };
}

async function subject(t: { after(cleanup: () => void): void }) {
  const fixture = createNativeFixture({ latencyMs: 0 }); t.after(fixture.runtime.dispose);
  await fixture.runtime.setForeground(true); await fixture.signIn();
  const seed = fixture.runtime.reading.getSnapshot(); assert.equal(seed.kind, "feed");
  if (seed.kind !== "feed") throw Error("Expected fictional feed seed.");
  const state = { session: fixture.runtime.session.getSnapshot(), navigation: fixture.runtime.navigation.getSnapshot(),
    reading: seed as ReadingSnapshot };
  const commands: string[] = [];
  let onCommand: ((name: string) => void) | null = null, onSessionRead: (() => void) | null = null,
    onReadingRead: (() => void) | null = null;
  const dispatch = (name: string) => { commands.push(name); onCommand?.(name); return Promise.resolve(); };
  const runtime = { ...fixture.runtime,
    session: { ...fixture.runtime.session, getSnapshot() {
      const value = state.session, work = onSessionRead; onSessionRead = null; work?.(); return value;
    } },
    navigation: { ...fixture.runtime.navigation, getSnapshot: () => state.navigation },
    reading: { ...fixture.runtime.reading, getSnapshot() {
      const value = state.reading, work = onReadingRead; onReadingRead = null; work?.(); return value;
    } },
    recordForegroundActivity: () => dispatch("activity"), startFeed: () => dispatch("startFeed"),
    nextPage: () => dispatch("nextPage"), refresh: () => dispatch("refresh"), retry: () => dispatch("retry"),
    backToFeed: () => dispatch("backToFeed")
  } as Runtime;
  let view = componentHarness(runtime); t.after(() => view.unmount());
  function freshFeed() {
    state.reading = { kind: "feed", feed: structuredClone(seed.feed) };
    state.navigation = { ...state.navigation, destination: { kind: "screen", screen: "home" } };
    return view.render();
  }
  function mount(screen = view.render()) {
    const calls: Array<{ x: number; y: number; animated: boolean }> = [];
    const props = screen.props;
    assert.equal(typeof props.scrollRef, "function", "Ready feed must expose its native scroll ref.");
    const cleanup = props.scrollRef!({ scrollTo(value) { calls.push(structuredClone(value) as typeof calls[number]); } });
    return { id: screen.id, props, calls,
      detach() { if (typeof cleanup === "function") cleanup(); else props.scrollRef!(null); },
      layout(height = 500) { props.onLayout?.({ nativeEvent: { layout: { height, width: 320, x: 0, y: 0 } } }); },
      content(height = 2000) { props.onContentSizeChange?.(320, height); },
      scroll(y: number) { props.onScroll?.({ nativeEvent: { contentOffset: { x: 0, y } } }); },
      drag() { props.onScrollBeginDrag?.({ nativeEvent: { contentOffset: { x: 0, y: 0 } } }); }
    };
  }
  function remember(y = 800) {
    const m = mount(); m.layout(); m.content(); m.scroll(y); return m;
  }
  return { state, commands, get view() { return view; }, mount, remember, freshFeed,
    remountJourney() { view.unmount(); view = componentHarness(runtime); return view.render(); },
    replaceRuntime() { return view.replaceRuntime({ ...runtime }); },
    commandHook(work: (name: string) => void) { onCommand = work; },
    sessionReadHook(work: () => void) { onSessionRead = work; },
    readingReadHook(work: () => void) { onReadingRead = work; }
  };
}

test("fresh authorized feed mounts restore once in either layout order, clamp, and ignore queued zero", async t => {
  for (const contentFirst of [false, true]) {
    const s = await subject(t), old = s.remember();
    const next = s.mount(s.freshFeed());
    assert.notEqual(next.props.scrollKey, old.props.scrollKey, "A coalesced same-page response needs a new inner ScrollView mount.");
    next.scroll(0);
    if (contentFirst) { next.content(1000); assert.equal(next.calls.length, 0); next.layout(700); }
    else { next.layout(700); assert.equal(next.calls.length, 0); next.content(1000); }
    assert.deepEqual(next.calls, [{ x: 0, y: 300, animated: false }]);
    next.scroll(0); next.layout(600); next.content(1800);
    assert.equal(next.calls.length, 1, "Layout changes cannot repeatedly drive scrolling.");
    const later = s.mount(s.freshFeed()); later.layout(); later.content();
    assert.equal(later.calls[0]?.y, 800, "Pending zero events must not replace the original saved offset.");
    assert.deepEqual(s.commands, [], "Native callbacks cannot renew activity or dispatch reads.");
  }
});

test("observing the restored target or beginning a direct drag allows new user positions to win", async t => {
  for (const directDrag of [false, true]) {
    const s = await subject(t); s.remember();
    const next = s.mount(s.freshFeed()); next.layout(); next.content();
    assert.equal(next.calls[0]?.y, 800);
    if (directDrag) next.drag(); else next.scroll(800.25);
    next.scroll(240);
    const later = s.mount(s.freshFeed()); later.layout(); later.content();
    assert.equal(later.calls[0]?.y, 240);
    assert.deepEqual(s.commands, []);
  }
});

test("old same-page read callbacks and old ref cleanup cannot overwrite or revoke a later mount", async t => {
  const s = await subject(t), old = s.remember();
  const nextScreen = s.freshFeed();
  old.scroll(0); // The new response is current before its native ref attaches.
  const next = s.mount(nextScreen); old.scroll(0); old.detach();
  old.scroll(0); old.layout(1); old.content(1); old.drag();
  next.layout(); next.content(); assert.equal(next.calls[0]?.y, 800);
  next.scroll(800); next.scroll(450); old.scroll(0);
  const later = s.mount(s.freshFeed()); later.layout(); later.content();
  assert.equal(later.calls[0]?.y, 450);
  assert.deepEqual(s.commands, []);
});

test("detail and loading presentations cannot record a feed position", async t => {
  const s = await subject(t), old = s.remember();
  const feed = s.state.reading; assert.equal(feed.kind, "feed");
  if (feed.kind !== "feed") throw Error("Expected fictional feed.");
  s.state.navigation = { ...s.state.navigation, destination: { kind: "post", postId: "fixture-welcome" } };
  s.state.reading = { kind: "loading", target: "post" }; s.view.render();
  old.scroll(0); old.drag();
  s.state.reading = { kind: "post", post: feed.feed.page.items[0], revealed: false };
  const detail = s.view.render(); detail.props.onScroll?.({ nativeEvent: { contentOffset: { y: 0 } } });
  s.state.reading = { kind: "loading", target: "feed" };
  s.state.navigation = { ...s.state.navigation, destination: { kind: "screen", screen: "home" } };
  const loading = s.view.render(); loading.props.onScroll?.({ nativeEvent: { contentOffset: { y: 0 } } });
  const next = s.mount(s.freshFeed()); next.layout(); next.content();
  assert.equal(next.calls[0]?.y, 800);
});

test("choices, Next and Refresh clear their bookmark before a command can publish another feed", async t => {
  for (const [label, command] of [["Latest", "startFeed"], ["Friends", "startFeed"], ["Top This Week", "startFeed"],
    ["Trending", "startFeed"], ["Next page", "nextPage"], ["Refresh feed", "refresh"]]) {
    const s = await subject(t); s.remember();
    let observed = false;
    s.commandHook(name => {
      if (name !== command) return;
      observed = true;
      const next = s.mount(s.freshFeed()); next.layout(); next.content();
      assert.deepEqual(next.calls, [], label + " must clear before dispatch, even if the address repeats.");
    });
    s.view.press(label); assert.equal(observed, true);
    assert.deepEqual(s.commands, ["activity", command]);
  }
});

test("error recovery clears the prior bookmark before retry or refresh dispatch", async t => {
  for (const [problem, label, command] of [
    ["unavailable", "Try again", "retry"], ["feature-unavailable", "Check availability", "retry"],
    ["refresh-required", "Refresh feed", "refresh"]
  ] as const) {
    const s = await subject(t); s.remember();
    s.state.reading = { kind: "error", target: "feed", problem, retryAfterSeconds: null }; s.view.render();
    let observed = false;
    s.commandHook(name => {
      if (name !== command) return;
      observed = true; const next = s.mount(s.freshFeed()); next.layout(); next.content();
      assert.deepEqual(next.calls, []);
    });
    s.view.press(label); assert.equal(observed, true);
  }
});

test("getter-triggered concealment or a new generation prevents queued restore and clears the bookmark", async t => {
  for (const source of ["session", "reading"] as const) for (const conceal of [false, true]) {
    const s = await subject(t); s.remember();
    const next = s.mount(s.freshFeed()); next.layout();
    const invalidate = () => {
      s.state.session = { ...s.state.session, generation: s.state.session.generation + 1,
        ...(conceal ? { foreground: false, phase: "concealed" as const } : {}) };
      s.state.navigation = { ...s.state.navigation, generation: s.state.session.generation };
      s.view.render();
    };
    if (source === "session") s.sessionReadHook(invalidate); else s.readingReadHook(invalidate);
    next.content(); next.scroll(0); next.drag(); assert.deepEqual(next.calls, []);
    s.state.session = { ...s.state.session, foreground: true, phase: "ready" };
    const later = s.mount(s.freshFeed()); later.layout(); later.content();
    assert.deepEqual(later.calls, []);
    assert.deepEqual(s.commands, []);
  }
});

test("an empty feed clamps to zero and observing zero releases its pending restoration", async t => {
  const s = await subject(t); s.remember(); s.freshFeed();
  const feed = s.state.reading; assert.equal(feed.kind, "feed");
  if (feed.kind !== "feed") throw Error("Expected fictional feed.");
  s.state.reading = { kind: "feed", feed: { ...feed.feed, page: { items: [], nextCursor: null } } };
  const empty = s.mount(); empty.layout(); empty.content(0);
  assert.deepEqual(empty.calls, [{ x: 0, y: 0, animated: false }]);
  empty.scroll(0);
  const next = s.mount(s.freshFeed()); next.layout(); next.content();
  assert.equal(next.calls[0]?.y, 0, "An observed legitimate zero replaces the old position.");
});

test("unmount drops the bookmark and old callbacks before a same-generation Journey remount", async t => {
  const s = await subject(t), old = s.remember(), generation = s.state.session.generation;
  const next = s.mount(s.remountJourney()); old.detach(); old.scroll(0); old.layout(); old.content();
  next.layout(); next.content();
  assert.equal(s.state.session.generation, generation);
  assert.deepEqual(old.calls, []); assert.deepEqual(next.calls, []);
  assert.deepEqual(s.commands, []);
});

test("a new ready generation attached before parent layout effects can capture after old position cleanup", async t => {
  for (const replaceOwner of [false, true]) {
    const s = await subject(t), old = s.remember(), reading = s.state.reading;
    assert.equal(reading.kind, "feed");
    if (reading.kind !== "feed") throw Error("Expected fictional feed.");
    s.state.session = { ...s.state.session, generation: s.state.session.generation + 1,
      account: replaceOwner ? { ...s.state.session.account!, id: "other-fictional-owner" } : s.state.session.account };
    s.state.navigation = { ...s.state.navigation, generation: s.state.session.generation, owner: s.state.session.account!.id };
    s.state.reading = { kind: "feed", feed: structuredClone(reading.feed) };
    // React attaches the child's ref before running the parent's layout effect.
    const current = s.mount(s.view.render(true)); s.view.flushEffects();
    old.detach(); old.scroll(0); current.layout(); current.content();
    assert.deepEqual(current.calls, [], "A new generation cannot restore the old position.");
    current.scroll(360);
    const later = s.mount(s.freshFeed()); later.layout(); later.content();
    assert.equal(later.calls[0]?.y, 360, "Cleanup must not revoke the newly attached valid native view.");
    assert.deepEqual(s.commands, []);
  }
});

test("old runtime layout cleanup cannot revoke a replacement runtime ref attached earlier in the commit", async t => {
  const s = await subject(t), old = s.remember();
  const current = s.mount(s.replaceRuntime()); s.view.flushEffects();
  old.detach(); old.scroll(0); current.layout(); current.content();
  assert.deepEqual(current.calls, [], "A replacement runtime cannot inherit the old bookmark.");
  current.scroll(280);
  const later = s.mount(s.freshFeed()); later.layout(); later.content();
  assert.equal(later.calls[0]?.y, 280);
  assert.deepEqual(s.commands, []);
});
