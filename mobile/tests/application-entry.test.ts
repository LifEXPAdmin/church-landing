import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { selectApplicationConfiguration } from "../application-configuration.js";
import { createNativeApplication, type NativeApplication } from "../src/session/native-application.ts";
import { createNativeFixture } from "../src/spike/native-fixture.ts";

const source = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");
const code = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022
} }).outputText;
type Fixture = ReturnType<typeof createNativeFixture>;
type Application = NativeApplication | { kind: "fixture"; fixture: Fixture };
type Element = { type: unknown; props: { children?: unknown } };
type Setup = () => void | (() => void);
const adapters = ["./src/platform/native-json.native", "./src/platform/secure-credentials", "./src/platform/storage-probe"];

/** Execute the real module and only its owner effect. JSX is a descriptor tree;
 * this does not simulate React reconciliation, native rendering or StrictMode. */
function entry(mode?: string, missing?: "wire" | "vault") {
  const loaded: string[] = [], fixtures: Fixture[] = [];
  let application: Application | null = null, setup: Setup | null = null, renderingOwner = false;
  const jsx = (type: unknown, props: Element["props"]): Element => ({ type, props });
  const unexpectedHook = () => { assert.fail("Only ApplicationOwner hooks should execute"); };
  const modules: Record<string, unknown> = {
    "react": {
      useState() { assert.ok(renderingOwner); return [application, (value: Application) => { application = value; }]; },
      useEffect(value: Setup) { assert.ok(renderingOwner); setup = value; },
      useRef: unexpectedHook, useSyncExternalStore: unexpectedHook
    },
    "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "Fragment" },
    "react-native": { Platform: { OS: "ios" } },
    "react-native-safe-area-context": { SafeAreaProvider: "SafeAreaProvider" },
    "expo-linking": {},
    "./application-configuration": { selectApplicationConfiguration: (value: unknown) => missing ?
      selectApplicationConfiguration(value, { environment: "staging", origin: "https://fictional.example.invalid" }) :
      selectApplicationConfiguration(value) },
    "./src/session/native-application": { createNativeApplication },
    "./src/spike/native-fixture": { createNativeFixture() {
      const fixture = createNativeFixture({ latencyMs: 0 }); fixtures.push(fixture); return fixture;
    } },
    "./src/spike/links": {}, "./src/navigation/link-intake": {}, "./src/platform/android-back": {},
    "./src/ui/theme": { ThemeProvider: "ThemeProvider" },
    "./src/ui/primitives": { Button: "Button", Card: "Card", Screen: "Screen", Text: "Text" },
    "./src/ui/DisplayControls": { DisplayControls: "DisplayControls" },
    "./src/ui/NativeJourney": { NativeJourney: "NativeJourney" }
  };
  const output: { default?: () => Element } = {};
  runInNewContext(code, {
    exports: output, __DEV__: false, process: { env: { EXPO_PUBLIC_APPLICATION_MODE: mode } },
    require(name: string) {
      loaded.push(name);
      if (adapters.includes(name)) {
        if (missing === "vault" && name === adapters[0]) return { nativeJsonWire: () => async () => {
          assert.fail("Construction must not dispatch native I/O");
        } };
        throw Error("Private native module path and diagnostic details");
      }
      assert.ok(Object.hasOwn(modules, name), "Unexpected App dependency: " + name);
      return modules[name];
    }
  }, { timeout: 1000 });
  assert.equal(typeof output.default, "function");
  const tree = output.default!();
  function findOwner(value: unknown): (() => Element) | null {
    if (Array.isArray(value)) {
      for (const child of value) { const found = findOwner(child); if (found) return found; }
      return null;
    }
    if (!value || typeof value !== "object") return null;
    const element = value as Element;
    if (typeof element.type === "function" && element.type.name === "ApplicationOwner") return element.type as () => Element;
    return findOwner(element.props?.children);
  }
  const owner = findOwner(tree); assert.ok(owner, "App must render its application owner");
  const render = () => {
    renderingOwner = true;
    try { return owner(); } finally { renderingOwner = false; }
  };
  render(); assert.equal(typeof setup, "function");
  return { loaded, fixtures, render, state: () => application, start: () => setup!(),
    dispose: () => { for (const fixture of fixtures) fixture.runtime.dispose(); } };
}

test("fixture and unavailable admission never import native adapters at load, render or owner setup", t => {
  for (const mode of [undefined, "fixture", "native", "invalid"]) {
    const app = entry(mode); t.after(app.dispose);
    assert.deepEqual(app.loaded.filter(name => adapters.includes(name)), []);
    const cleanup = app.start(); app.render();
    assert.equal(app.state()?.kind, mode === undefined || mode === "fixture" ? "fixture" : "unavailable");
    assert.equal(app.fixtures.length, mode === undefined || mode === "fixture" ? 1 : 0);
    assert.deepEqual(app.loaded.filter(name => adapters.includes(name)), []);
    cleanup?.();
  }
});

test("selected native adapter import failures stay inside composition with no fixture fallback", t => {
  for (const missing of ["wire", "vault"] as const) {
    const app = entry("native", missing); t.after(app.dispose);
    assert.deepEqual(app.loaded.filter(name => adapters.includes(name)), []);
    const cleanup = app.start();
    assert.equal(app.state()?.kind, "unavailable");
    assert.deepEqual(Object.keys(app.state()!), ["kind"]);
    assert.equal(app.fixtures.length, 0);
    assert.deepEqual(app.loaded.filter(name => adapters.includes(name)), missing === "wire" ? [adapters[0]] : adapters.slice(0, 2));
    const displayed = JSON.stringify(app.render());
    assert.ok(displayed.includes("Sign-in is unavailable in this build."));
    assert.equal(displayed.includes("Private native"), false);
    cleanup?.();
  }
});

test("owner setup, cleanup and setup construct distinct usable fixtures without reusing the disposed runtime", async t => {
  const app = entry("fixture"); t.after(app.dispose);
  const cleanup = app.start(), first = app.fixtures[0];
  assert.ok(first); cleanup?.();
  const secondCleanup = app.start(), second = app.fixtures[1];
  assert.ok(second); assert.notEqual(first.runtime, second.runtime);
  await first.runtime.setForeground(true);
  assert.equal(first.runtime.session.getSnapshot().phase, "concealed");
  await second.runtime.setForeground(true);
  assert.equal(second.runtime.session.getSnapshot().phase, "signed-out");
  secondCleanup?.();
  await second.runtime.setForeground(true);
  assert.equal(second.runtime.session.getSnapshot().phase, "concealed");
  assert.deepEqual(app.loaded.filter(name => adapters.includes(name)), []);
});
