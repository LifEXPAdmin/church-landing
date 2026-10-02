import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const ts = require(process.env.TYPESCRIPT_MODULE || "typescript");

// Executes the real component/hook bodies with deterministic hook lifetimes.
// This is a focused state-machine check, not a React DOM or browser substitute.
export function clientHarness(globals = {}) {
  const slots = [];
  let cursor = 0,
    changed = false,
    output,
    renderBody;
  let effects = [];
  const same = (a, b) =>
    a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const react = {
    useState(initial) {
      const i = cursor++;
      if (!(i in slots))
        slots[i] = typeof initial === "function" ? initial() : initial;
      return [
        slots[i],
        (value) => {
          const next = typeof value === "function" ? value(slots[i]) : value;
          if (!Object.is(next, slots[i])) {
            slots[i] = next;
            changed = true;
          }
        }
      ];
    },
    useRef(initial) {
      const i = cursor++;
      return (slots[i] ??= { current: initial });
    },
    useMemo(fn, deps) {
      const i = cursor++;
      if (!same(slots[i]?.deps, deps)) slots[i] = { deps, value: fn() };
      return slots[i].value;
    },
    useCallback(fn, deps) {
      return react.useMemo(() => fn, deps);
    },
    useEffect(fn, deps) {
      const i = cursor++;
      if (!same(slots[i]?.deps, deps)) {
        const old = slots[i];
        slots[i] = { deps };
        effects.push(() => {
          old?.cleanup?.();
          slots[i].cleanup = fn();
        });
      }
    }
  };
  react.useLayoutEffect = react.useEffect;
  const jsx = (type, props, key) => ({ type, props: props || {}, key });
  function render() {
    for (let n = 0; n < 30; n++) {
      cursor = 0;
      changed = false;
      effects = [];
      output = renderBody();
      effects.forEach((effect) => effect());
      if (!changed) return output;
    }
    throw new Error("Component failed to settle");
  }
  return {
    load(path, mocks = {}) {
      const filename = resolve(path);
      const code = ts.transpileModule(readFileSync(filename, "utf8"), {
        fileName: filename,
        compilerOptions: {
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.CommonJS,
          jsx: ts.JsxEmit.ReactJSX
        }
      }).outputText;
      const exports = {};
      vm.runInNewContext(
        code,
        {
          exports,
          console,
          URL,
          Date,
          crypto,
          ...globals,
          require(name) {
            if (name === "react") return react;
            if (name === "react/jsx-runtime")
              return { jsx, jsxs: jsx, Fragment: "fragment" };
            if (name === "react-dom") return { flushSync: (fn) => fn() };
            assert.ok(name in mocks, `Unmocked import ${name} in ${path}`);
            return mocks[name];
          }
        },
        { filename }
      );
      return exports;
    },
    mount(fn) {
      renderBody = fn;
      return render();
    },
    render,
    get output() {
      return output;
    },
    async settle() {
      for (let i = 0; i < 8; i++) {
        await new Promise((done) => setImmediate(done));
        if (changed) render();
      }
      return output;
    },
    unmount() {
      slots.forEach((slot) => slot?.cleanup?.());
    }
  };
}

export function nodes(tree, predicate) {
  if (Array.isArray(tree))
    return tree.flatMap((child) => nodes(child, predicate));
  if (!tree || typeof tree !== "object") return [];
  return [
    ...(predicate(tree) ? [tree] : []),
    ...nodes(tree.props?.children, predicate)
  ];
}
export function textContent(tree) {
  if (Array.isArray(tree)) return tree.map(textContent).join("");
  if (tree == null || typeof tree === "boolean") return "";
  return typeof tree === "object"
    ? textContent(tree.props?.children)
    : String(tree);
}
export function button(tree, text) {
  const result = nodes(
    tree,
    (n) => n.type === "button" && textContent(n).trim() === text
  );
  assert.equal(result.length, 1, `Expected one button: ${text}`);
  return result[0];
}
export function input(tree, label) {
  const labels = nodes(
    tree,
    (n) => n.type === "label" && textContent(n).trim() === label
  );
  assert.equal(labels.length, 1, `Expected one label: ${label}`);
  return nodes(labels[0], (n) =>
    ["input", "textarea", "select"].includes(n.type)
  )[0];
}
