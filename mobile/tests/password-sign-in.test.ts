import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { nativePasswordInput } from "@godschurches/shared-core";
import { createNativeFixture } from "../src/spike/native-fixture.ts";

const source = readFileSync(new URL("../src/ui/PasswordSignIn.tsx", import.meta.url), "utf8");
const code = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022
} }).outputText;
type Runtime = ReturnType<typeof createNativeFixture>["runtime"];
type Element = { type: unknown; props: Record<string, unknown> };
type Input = { value: string; onChangeText(value: string): void; onSubmitEditing(): void;
  inputRef?: { current: unknown }; returnKeyType?: string; submitBehavior?: string; secureTextEntry?: boolean };
type Effect = () => void | (() => void);

/** Execute actual component handlers with explicit state/effect rerenders. JSX
 * remains a descriptor tree, not a React renderer or native accessibility test. */
function form(runtime: Runtime, platform = "ios") {
  const slots: unknown[] = [], pending: Array<{ index: number; effect: Effect }> = [], announcements: string[] = [];
  const cleanups = new Map<number, () => void>();
  let cursor = 0, tree: Element;
  const jsx = (type: unknown, props: Element["props"]): Element => ({ type, props });
  const modules: Record<string, unknown> = {
    "react": {
      useState(initial: unknown) {
        const index = cursor++;
        if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
        return [slots[index], (value: unknown) => {
          slots[index] = typeof value === "function" ? value(slots[index]) : value;
        }];
      },
      useRef(initial: unknown) {
        const index = cursor++;
        if (!(index in slots)) slots[index] = { current: initial };
        return slots[index];
      },
      useEffect(effect: Effect, dependencies?: unknown[]) {
        const index = cursor++, previous = slots[index] as unknown[] | undefined;
        if (!dependencies || !previous || dependencies.length !== previous.length ||
          dependencies.some((value, i) => !Object.is(value, previous[i]))) pending.push({ index, effect });
        slots[index] = dependencies;
      }
    },
    "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "Fragment" },
    "react-native": { Platform: { OS: platform }, AccessibilityInfo: {
      announceForAccessibility(message: string) { announcements.push(message); }
    } },
    "@godschurches/shared-core": { nativePasswordInput: { parse(value: unknown) {
      // The real schema rejects foreign-realm prototypes. Bridge the VM value
      // into its realm without changing any fields or replacing validation.
      return nativePasswordInput.parse(structuredClone(value));
    } } },
    "./primitives": { Button: "Button", Input: "Input", Text: "Text" }
  };
  const output: { PasswordSignIn?: (props: { runtime: Runtime }) => Element } = {};
  runInNewContext(code, { exports: output, require(name: string) {
    assert.ok(Object.hasOwn(modules, name), "Unexpected password form dependency: " + name);
    return modules[name];
  } }, { timeout: 1000 });
  assert.equal(typeof output.PasswordSignIn, "function");
  function render() {
    cursor = 0; tree = output.PasswordSignIn!({ runtime });
    for (const { index, effect } of pending.splice(0)) {
      cleanups.get(index)?.(); cleanups.delete(index);
      const cleanup = effect(); if (cleanup) cleanups.set(index, cleanup);
    }
  }
  function elements(value: unknown): Element[] {
    if (Array.isArray(value)) return value.flatMap(elements);
    if (!value || typeof value !== "object") return [];
    const element = value as Element;
    return [element, ...elements(element.props?.children)];
  }
  function find(type: string, label: string) {
    const found = elements(tree).find(element => element.type === type && element.props.label === label);
    assert.ok(found, `Missing ${type}: ${label}`); return found;
  }
  render();
  return { announcements, render,
    unmount() { for (const cleanup of cleanups.values()) cleanup(); cleanups.clear(); pending.length = 0; },
    input: (label: string) => find("Input", label).props as unknown as Input,
    press: () => (find("Button", "Sign in").props.onPress as () => void)(),
    change(label: string, value: string) {
      (find("Input", label).props.onChangeText as (value: string) => void)(value); render();
    },
    text: () => JSON.stringify(tree)
  };
}

async function subject(t: { after(cleanup: () => void): void }, platform = "ios") {
  const fixture = createNativeFixture({ latencyMs: 0 }); t.after(fixture.runtime.dispose);
  await fixture.runtime.setForeground(true);
  const dispatched: Array<Parameters<Runtime["signIn"]>[0]> = [];
  let beforeDispatch = () => {};
  const runtime = { ...fixture.runtime, signIn(input: Parameters<Runtime["signIn"]>[0]) {
    beforeDispatch(); dispatched.push(input); return Promise.resolve();
  } };
  const component = form(runtime, platform); t.after(component.unmount);
  return { runtime, dispatched, form: component, beforeDispatch(callback: () => void) { beforeDispatch = callback; } };
}

test("Email Next focuses the password field without submitting credentials", async t => {
  const s = await subject(t); let focuses = 0;
  const password = s.form.input("Password"); assert.ok(password.inputRef);
  password.inputRef.current = { focus() { focuses++; } };
  const email = s.form.input("Email");
  assert.equal(email.returnKeyType, "next"); assert.equal(email.submitBehavior, "submit");
  assert.equal(password.returnKeyType, "go"); assert.equal(password.secureTextEntry, true);
  email.onSubmitEditing();
  assert.equal(focuses, 1); assert.equal(s.dispatched.length, 0);
});

test("each invalid attempt clears the password and repeats only the generic iOS announcement", async t => {
  const s = await subject(t);
  s.form.change("Email", "   "); s.form.change("Password", "fictional-valid-password");
  s.form.press(); s.form.render();
  assert.equal(s.form.input("Email").value, "   "); assert.equal(s.form.input("Password").value, "");
  s.form.change("Password", "short"); s.form.input("Password").onSubmitEditing(); s.form.render();
  assert.equal(s.form.input("Password").value, ""); assert.equal(s.dispatched.length, 0);
  assert.equal(s.form.announcements.length, 2);
  assert.equal(s.form.announcements[0], s.form.announcements[1]);
  assert.match(s.form.announcements[0], /8 to 128/);
  assert.ok(s.form.text().includes(s.form.announcements[0]));
  assert.equal(s.form.announcements.some(message => message.includes("fictional-valid-password") || message.includes("short")), false);
  const android = await subject(t, "android");
  android.form.press(); android.form.render();
  assert.equal(android.form.announcements.length, 0); assert.equal(android.dispatched.length, 0);
});

test("Go and Sign in trim only email and clear both fields before canonical dispatch", async t => {
  const s = await subject(t);
  s.beforeDispatch(() => {
    s.form.render();
    assert.equal(s.form.input("Email").value, ""); assert.equal(s.form.input("Password").value, "");
  });
  for (const submit of [() => s.form.input("Password").onSubmitEditing(), () => s.form.press()]) {
    s.form.change("Email", "  demo@example.invalid  "); s.form.change("Password", "  fictional password  ");
    submit();
  }
  assert.deepEqual(s.dispatched, [
    { email: "demo@example.invalid", password: "  fictional password  " },
    { email: "demo@example.invalid", password: "  fictional password  " }
  ]);
  assert.equal(s.form.announcements.length, 0);
});

test("retained hidden and authenticated callbacks cannot focus, announce or dispatch", async t => {
  const s = await subject(t); let focuses = 0;
  const ref = s.form.input("Password").inputRef; assert.ok(ref);
  ref.current = { focus() { focuses++; } };
  s.form.change("Email", "demo@example.invalid"); s.form.change("Password", "fictional-preview-password");
  const next = s.form.input("Email").onSubmitEditing, submit = s.form.input("Password").onSubmitEditing;
  await s.runtime.setForeground(false); next(); submit();
  s.form.change("Password", "short"); s.form.press(); s.form.render();
  assert.equal(focuses, 0); assert.equal(s.dispatched.length, 0); assert.equal(s.form.announcements.length, 0);
  await s.runtime.setForeground(true);
  const real = createNativeFixture({ latencyMs: 0 }); t.after(real.runtime.dispose);
  await real.runtime.setForeground(true);
  const retained = form(real.runtime);
  const nextAfterSignIn = retained.input("Email").onSubmitEditing;
  const retainedRef = retained.input("Password").inputRef; assert.ok(retainedRef);
  retainedRef.current = { focus() { focuses++; } };
  await real.signIn();
  nextAfterSignIn(); retained.press(); retained.render();
  assert.equal(focuses, 0); assert.equal(retained.announcements.length, 0);
  assert.equal(real.runtime.session.getSnapshot().phase, "ready");
});

test("callbacks from before concealment remain inert after a signed-out resume", async t => {
  const s = await subject(t); let focuses = 0;
  const ref = s.form.input("Password").inputRef; assert.ok(ref);
  ref.current = { focus() { focuses++; } };
  s.form.change("Email", "demo@example.invalid"); s.form.change("Password", "short");
  const invalid = s.form.input("Password").onSubmitEditing;
  s.form.change("Password", "fictional-preview-password");
  const next = s.form.input("Email").onSubmitEditing, submit = s.form.input("Password").onSubmitEditing;
  const initialGeneration = s.runtime.session.getSnapshot().generation;
  await s.runtime.setForeground(false); await s.runtime.setForeground(true);
  assert.equal(s.runtime.session.getSnapshot().phase, "signed-out");
  assert.notEqual(s.runtime.session.getSnapshot().generation, initialGeneration);
  next(); submit(); invalid();
  assert.deepEqual({ focuses, dispatched: s.dispatched.length, announcements: s.form.announcements.length },
    { focuses: 0, dispatched: 0, announcements: 0 });
});

test("unmounted form callbacks stay inert when a fresh form opens in the same generation", async t => {
  const s = await subject(t); let oldFocuses = 0, freshFocuses = 0;
  const ref = s.form.input("Password").inputRef; assert.ok(ref);
  ref.current = { focus() { oldFocuses++; } };
  s.form.change("Email", "demo@example.invalid"); s.form.change("Password", "short");
  const invalid = s.form.input("Password").onSubmitEditing;
  s.form.change("Password", "fictional-preview-password");
  const next = s.form.input("Email").onSubmitEditing, submit = s.form.input("Password").onSubmitEditing;
  const generation = s.runtime.session.getSnapshot().generation;
  s.form.unmount();
  const fresh = form(s.runtime); t.after(fresh.unmount);
  const freshRef = fresh.input("Password").inputRef; assert.ok(freshRef);
  freshRef.current = { focus() { freshFocuses++; } };
  next(); submit(); invalid();
  assert.deepEqual({ focuses: oldFocuses, dispatched: s.dispatched.length, announcements: s.form.announcements.length },
    { focuses: 0, dispatched: 0, announcements: 0 });
  assert.equal(s.runtime.session.getSnapshot().generation, generation);
  fresh.input("Email").onSubmitEditing(); assert.equal(freshFocuses, 1);
  fresh.change("Email", "demo@example.invalid"); fresh.change("Password", "fictional-preview-password"); fresh.press();
  assert.equal(s.dispatched.length, 1);
});
