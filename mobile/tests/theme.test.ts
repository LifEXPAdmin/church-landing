import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { nativeDesignTokens } from "@godschurches/shared-core";
import { observeMotionPreference } from "../src/ui/motion-preference.ts";

function fixture() {
  const queries: { resolve: (value: boolean) => void; reject: (error: Error) => void }[] = [];
  const values: boolean[] = [];
  let change = (_: boolean) => {}, resume = () => {}, stopped = 0;
  const stop = observeMotionPreference({
    read: () => new Promise<boolean>((resolve, reject) => queries.push({ resolve, reject })),
    subscribe: (listener) => { change = listener; return () => { stopped++; }; },
    onResume: (listener) => { resume = listener; return () => { stopped++; }; }
  }, (value) => values.push(value));
  return { queries, values, change: (value: boolean) => change(value), resume: () => resume(), stop, stopped: () => stopped };
}
const settle = async () => { await Promise.resolve(); await Promise.resolve(); };

test("motion is reduced until the native query resolves, and read failure stays reduced", async () => {
  const a = fixture();
  assert.deepEqual(a.values, [true]);
  a.queries[0].resolve(false); await settle();
  assert.deepEqual(a.values, [true, false]);
  a.resume(); a.queries[1].reject(new Error("unavailable")); await settle();
  assert.equal(a.values.at(-1), true); a.stop();
});
test("a stale query cannot override a newer device accessibility event", async () => {
  const a = fixture();
  a.change(true); a.queries[0].resolve(false); await settle();
  assert.deepEqual(a.values, [true, true]); a.stop();
});
test("foreground recheck supersedes older queries and reconciles the latest preference", async () => {
  const a = fixture();
  a.resume(); a.queries[1].resolve(true); await settle();
  a.queries[0].resolve(false); await settle();
  assert.equal(a.values.at(-1), true);
  a.change(false); assert.equal(a.values.at(-1), false); a.stop();
});
test("unmount removes subscriptions and ignores pending results or queued events", async () => {
  const a = fixture(); a.stop();
  assert.equal(a.stopped(), 2);
  a.queries[0].resolve(false); a.change(false); a.resume(); await settle();
  assert.deepEqual(a.values, [true]); assert.equal(a.queries.length, 1);
});

type Element = { type: unknown; key: string | undefined; props: Record<string, unknown> };
type Component = (props: Record<string, unknown>) => Element;
type ThemeValue = ReturnType<typeof import("../src/ui/theme.tsx").useTheme>;
const compiled = Object.fromEntries(["theme", "primitives"].map(name => [name,
  ts.transpileModule(readFileSync(new URL(`../src/ui/${name}.tsx`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 }
  }).outputText]));

/** Execute the actual provider/primitive functions with explicit hook renders.
 * Descriptors verify host identity and props, not native layout or focus. */
function textFixture(platform = "ios") {
  const owners = new Map<Component, unknown[]>();
  let slots: unknown[] = [], cursor = 0;
  const dimensions = { width: 375, height: 667, scale: 2, fontScale: 1 };
  let context: { Provider: string; value: unknown };
  const jsx = (type: unknown, props: Element["props"], key?: string | number): Element =>
    ({ type, props, key: key === undefined ? undefined : String(key) });
  const modules: Record<string, unknown> = {
    "react": {
      createElement(type: unknown, props: Element["props"], ...children: unknown[]) {
        const { key, ...rest } = props;
        return jsx(type, { ...rest, ...(children.length ? { children: children.length === 1 ? children[0] : children } : {}) }, key as string | number | undefined);
      },
      createContext(value: unknown) { context = { Provider: "ThemeProvider", value }; return context; },
      useContext(value: typeof context) { return value.value; },
      useState(initial: unknown) {
        const index = cursor++, own = slots;
        if (!(index in own)) own[index] = typeof initial === "function" ? initial() : initial;
        return [own[index], (value: unknown) => { own[index] = typeof value === "function" ? value(own[index]) : value; }];
      },
      useMemo(create: () => unknown, dependencies: unknown[]) {
        const index = cursor++, previous = slots[index] as { dependencies: unknown[]; value: unknown } | undefined;
        if (!previous || dependencies.some((value, i) => !Object.is(value, previous.dependencies[i])))
          slots[index] = { dependencies, value: create() };
        return (slots[index] as { value: unknown }).value;
      },
      useEffect() {}
    },
    "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "Fragment" },
    "react-native": { Platform: { OS: platform }, useColorScheme: () => "light", useWindowDimensions: () => dimensions,
      Text: "NativeText", TextInput: "TextInput", Pressable: "Pressable", View: "View", ScrollView: "ScrollView", KeyboardAvoidingView: "KeyboardAvoidingView" },
    "react-native-safe-area-context": { SafeAreaView: "SafeAreaView" },
    "expo-status-bar": { StatusBar: "StatusBar" },
    "@godschurches/shared-core": { nativeDesignTokens },
    "./motion-preference": { observeMotionPreference }
  };
  function load(name: string) {
    const output: Record<string, Component> = {};
    runInNewContext(compiled[name], { exports: output, require(id: string) {
      assert.ok(Object.hasOwn(modules, id), "Unexpected primitive dependency: " + id); return modules[id];
    } }, { timeout: 1000 });
    return output;
  }
  const provider = load("theme"); modules["./theme"] = provider;
  const primitives = load("primitives");
  function render(component: Component, props: Record<string, unknown> = {}) {
    slots = owners.get(component) ?? []; owners.set(component, slots); cursor = 0;
    return component(props);
  }
  function theme(scale: number) {
    dimensions.fontScale = scale;
    context.value = render(provider.ThemeProvider, { children: null }).props.value;
    return context.value as ThemeValue;
  }
  theme(1);
  return { theme, render: (name: string, props: Record<string, unknown> = {}) => render(primitives[name], props),
    textChild(element: Element) { return render(element.type as Component, element.props); } };
}
function descendants(value: unknown): Element[] {
  if (Array.isArray(value)) return Array.from(value).flatMap(descendants);
  if (!value || typeof value !== "object") return [];
  const element = value as Element;
  return [element, ...descendants(element.props?.children)];
}

test("iOS live font scale replaces only text identity without scaling logical tokens twice", () => {
  const f = textFixture(), normal = f.theme(1);
  const first = f.render("Text", { variant: "title", children: "Fictional heading" });
  const large = f.theme(3.12), expanded = f.render("Text", { variant: "title", children: "Fictional heading" });
  assert.notEqual(expanded.key, first.key); assert.equal(expanded.type, "NativeText");
  assert.equal(large.theme, normal.theme); assert.equal(large.choices, normal.choices);
  assert.equal(expanded.props.allowFontScaling, true); assert.equal(expanded.props.maxFontSizeMultiplier, undefined);
  assert.deepEqual(expanded.props.style, first.props.style); assert.equal(expanded.props.accessibilityRole, "header");
  assert.equal(f.theme(3.12), large); assert.equal(f.render("Text").key, expanded.key);
  f.theme(1); assert.equal(f.render("Text").key, first.key);
  normal.update({ readerSize: "largest" });
  const preference = f.theme(1);
  assert.equal(preference.choices.readerSize, "largest");
  assert.ok(preference.theme.type.reader.fontSize > normal.theme.type.reader.fontSize);
});

test("font scale preserves input, button and screen identities, values and callbacks", () => {
  const f = textFixture(), onPress = () => {}, onChangeText = () => {}, inputRef = { current: null }, scrollRef = { current: null };
  function controls() {
    return { button: f.render("Button", { label: "Retry same Like choice", onPress, selected: true }),
      input: descendants(f.render("Input", { label: "Fictional password", value: "fictional text", secureTextEntry: true, onChangeText, inputRef }))
        .find(element => element.type === "TextInput")!,
      scroll: descendants(f.render("Screen", { children: "Fictional content", scrollKey: "same-route", scrollRef }))
        .find(element => element.type === "ScrollView")! };
  }
  const normal = controls(), oldLabel = f.textChild(normal.button.props.children as Element);
  f.theme(3.12); const large = controls(), newLabel = f.textChild(large.button.props.children as Element);
  assert.notEqual(newLabel.key, oldLabel.key);
  assert.equal(large.button.key, normal.button.key); assert.equal(large.button.props.onPress, onPress);
  assert.equal(large.button.props.accessibilityRole, "button"); assert.equal(large.button.props.accessibilityLabel, "Retry same Like choice");
  assert.equal((large.button.props.accessibilityState as { selected: boolean }).selected, true);
  assert.equal(large.input.key, normal.input.key); assert.equal(large.input.props.ref, inputRef);
  assert.equal(large.input.props.value, "fictional text"); assert.equal(large.input.props.secureTextEntry, true);
  assert.equal(large.input.props.onChangeText, onChangeText); assert.equal(large.input.props.allowFontScaling, true);
  assert.equal(large.scroll.key, "same-route"); assert.equal(large.scroll.props.ref, scrollRef);
});

test("Android text identity stays unchanged when native font scale changes", () => {
  const f = textFixture("android"), first = f.render("Text", { children: "Fictional text" });
  f.theme(3.12); const large = f.render("Text", { children: "Fictional text" });
  assert.equal(large.key, first.key); assert.equal(large.props.allowFontScaling, true);
  assert.deepEqual(large.props.style, first.props.style); assert.equal(large.props.maxFontSizeMultiplier, undefined);
});
