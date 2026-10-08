import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { createNativeFixture } from "../src/spike/native-fixture.ts";

type Runtime = ReturnType<typeof createNativeFixture>["runtime"];
type Mode = NonNullable<Parameters<Runtime["startFeed"]>[0]>;
type Element = { type: unknown; props: Record<string, unknown> };
type Props = { mode: Mode; onChoose(mode: Mode): void; onRefresh(): void };
type Button = { label: string; secondary: boolean; selected?: boolean; onPress(): void };
const jsx = (type: unknown, props: Element["props"]): Element => ({ type, props });
const modules: Record<string, unknown> = {
  "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "Fragment" },
  "./primitives": { Button: "Button" }
};
const code = ts.transpileModule(readFileSync(new URL("../src/ui/NativeFeedChoices.tsx", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 }
}).outputText;
const output: { NativeFeedChoices?: (props: Props) => Element } = {};
runInNewContext(code, { exports: output, require(name: string) {
  assert.ok(Object.hasOwn(modules, name), "Unexpected feed choices dependency: " + name);
  return modules[name];
} }, { timeout: 1000 });
assert.equal(typeof output.NativeFeedChoices, "function");

function buttons(value: unknown): Button[] {
  if (Array.isArray(value)) return Array.from(value).flatMap(buttons);
  if (!value || typeof value !== "object") return [];
  const element = value as Element;
  return element.type === "Button" ? [element.props as unknown as Button] : buttons(element.props?.children);
}
function feed(runtime: Runtime) {
  const state = runtime.reading.getSnapshot();
  assert.equal(state.kind, "feed");
  if (state.kind !== "feed") throw Error("Expected an authorized fictional feed.");
  return state.feed;
}

/** Invoke the actual leaf's handlers with the real fictional runtime. Descriptors
 * are not a React renderer and do not prove native layout or accessibility. */
async function subject(t: { after(cleanup: () => void): void }) {
  const fixture = createNativeFixture({ latencyMs: 0 }); t.after(fixture.runtime.dispose);
  const runtime = fixture.runtime, pending: Promise<void>[] = [];
  await runtime.setForeground(true); await fixture.signIn();
  function render() {
    const count = pending.length, before = runtime.reading.getSnapshot();
    const result = buttons(output.NativeFeedChoices!({
      mode: feed(runtime).mode,
      onChoose: mode => { pending.push(runtime.startFeed(mode)); },
      onRefresh: () => { pending.push(runtime.refresh()); }
    }));
    assert.equal(pending.length, count, "Rendering must not dispatch a command.");
    assert.equal(runtime.reading.getSnapshot(), before);
    return result;
  }
  return { fixture, runtime, render,
    async press(label: string) {
      const button = render().find(item => item.label === label);
      assert.ok(button, "Missing feed button: " + label);
      assert.equal(pending.length, 0);
      button.onPress();
      assert.equal(pending.length, 1, "A direct press dispatches exactly one command.");
      await pending.shift();
    }
  };
}

test("four primary choices dispatch their canonical modes and reflect only the supplied response", async t => {
  const s = await subject(t);
  const expected = [["Latest", "latest"], ["Friends", "friends"], ["Top This Week", "weekly"], ["Trending", "trending"]] as const;
  assert.deepEqual(s.render().map(button => button.label), [...expected.map(([label]) => label), "Refresh feed"]);
  assert.equal(s.render().every(button => button.secondary), true);
  for (const [label, mode] of expected) {
    await s.press(label);
    assert.equal(feed(s.runtime).mode, mode);
    assert.deepEqual(s.render().filter(button => button.selected).map(button => button.label), [label]);
  }
  await s.runtime.startFeed("for-you");
  assert.deepEqual(s.render().filter(button => button.selected), []);
});

test("changing a primary choice and refreshing keep one bounded first page", async t => {
  const s = await subject(t);
  await s.runtime.nextPage();
  assert.equal(feed(s.runtime).pageCursor, "fixture.second");
  await s.press("Top This Week");
  assert.equal(feed(s.runtime).mode, "weekly");
  assert.equal(feed(s.runtime).pageCursor, "fixture.first");
  assert.deepEqual(feed(s.runtime).page.items.map(item => item.id), ["fixture-welcome", "fixture-prayer"]);
  await s.runtime.nextPage(); await s.press("Refresh feed");
  assert.equal(feed(s.runtime).mode, "weekly");
  assert.equal(feed(s.runtime).pageCursor, "fixture.first");
});

test("the same choice handlers support empty responses and explicit interrupted-read recovery", async t => {
  const s = await subject(t);
  s.fixture.emptyNextFeed(); await s.press("Trending");
  assert.equal(feed(s.runtime).mode, "trending");
  assert.deepEqual(feed(s.runtime).page.items, []);
  assert.deepEqual(s.render().filter(button => button.selected).map(button => button.label), ["Trending"]);
  s.fixture.failNextRead(); await s.press("Refresh feed");
  assert.equal(s.runtime.reading.getSnapshot().kind, "error");
  await s.runtime.retry();
  assert.equal(feed(s.runtime).mode, "trending");
  assert.deepEqual(s.render().filter(button => button.selected).map(button => button.label), ["Trending"]);
});
