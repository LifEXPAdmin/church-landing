import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, symlinkSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { manifest, sha256, transform, consumerPayloads, patchInstalledBundles } from "../scripts/patch-toolchain-depth.mjs";
const require = createRequire(import.meta.url);
const nodeModules = process.env.TOOLCHAIN_DEPTH_NODE_MODULES ?? resolve("node_modules");
const read = path => readFileSync(path, "utf8");
function pristine(kind, source) {
  const spec = manifest.bundles[kind];
  if (sha256(source) === spec.afterSha256) for (const factory of spec.modules) source = source.replace(factory.replacement, () => factory.original);
  assert.equal(sha256(source), spec.beforeSha256);
  return source;
}
function capsule(kind, source, patched) {
  const spec = manifest.bundles[kind];
  assert.equal(sha256(source), patched ? spec.afterSha256 : spec.beforeSha256);
  const factories = spec.modules.map(module => {
    const text = patched ? module.replacement : module.original;
    assert.equal(source.split(text).length, 2);
    return text;
  });
  if (kind === "nft") {
    const api = source.slice(source.indexOf(",8333:"), source.indexOf(",8179:"));
    const dependencies = [2661, 492, 3357, 3837].map(id => {
      const start = source.indexOf("," + id + ":"); assert.ok(start > 0);
      const tail = source.slice(start + 1), next = tail.search(/,\d+:(?:(?:\([^)]*\)|[A-Za-z_$][\w$]*)=>|function\([^)]*\))\{/); assert.ok(next > 0);
      return source.slice(start, start + 1 + next);
    });
    return `const factories={${[api, ...factories, ...dependencies].map(factory => factory.slice(1)).join(",")}};const cache=new Map();function load(id){if(cache.has(id))return cache.get(id).exports;const module={exports:{}};cache.set(id,module);factories[id](module,module.exports,load);return module.exports;}module.exports=load(8333);`;
  }
  const start = source.indexOf("// node_modules/braces/index.js\n");
  const api = source.slice(start, source.indexOf("\n// node_modules/", start + 1));
  const dependencies = ["is-number", "to-regex-range", "fill-range"].map(name => {
    const start = source.indexOf(`// node_modules/${name}/index.js\n`); assert.ok(start > 0);
    return source.slice(start, source.indexOf("\n// node_modules/", start + 1));
  });
  return `const __require=require;const __commonJS=factory=>{let module;return()=>{if(!module){module={exports:{}};Object.values(factory)[0](module.exports,module);}return module.exports;};};\n${[...dependencies, ...factories, api].join("\n")}\nmodule.exports=require_braces();`;
}
function runDepthChild() {
  const [oldPath, newPath, kind] = process.argv.slice(3);
  const before = require(oldPath), after = require(newPath);
  let assertions = 0;
  const equal = (a, b) => { assert.deepEqual(a, b); assertions++; };
  const outcome = (lib, method, input, options = {}) => {
    const logs = [], previous = console.log; console.log = (...args) => logs.push(args);
    try { return { value: lib[method](input, options), logs }; }
    catch (error) { return { error: error.name, message: error.message, logs }; }
    finally { console.log = previous; }
  };
  const patterns = ["a/{b,c}/d", "{01..05}", "{a..e}", "{2..10..2}", "{1..8}", "{{a}}", "{a,{b,c}}", "x\\{y,z\\}", "[{}]", '"{{x}}"', "${x,y}", "(a|b)", "{{a,b}", "{a,b}}", "a{,b}c", "{1..1001}"];
  let state = 0x4e732;
  const random = n => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state % n; };
  const tokens = ["a", "b", "/", "{x,y}", "{1..3}", "(ab)", "[xy]", "\\{", "}", ",", ".", "?", "*", "'x'", "${x}"];
  for (let i = 0; i < 1500; i++) { let pattern = ""; for (let j = 0, size = 1 + random(6); j < size; j++) pattern += tokens[random(tokens.length)]; patterns.push(pattern); }
  for (const pattern of patterns) for (const method of ["compile", "expand", "stringify"]) for (const options of [{}, { escapeInvalid: true }, { keepEscaping: true, keepQuotes: true }, { nodupes: true, noempty: true }]) equal(outcome(after, method, pattern, options), outcome(before, method, pattern, options));
  equal(outcome(after, "compile", { type: "close", value: "fixture-value", isClose: true }), outcome(before, "compile", { type: "close", value: "fixture-value", isClose: true }));
  for (const [open, close] of [["{", "}"], ["(", ")"]]) for (const depth of [0, 1, 99, 100, 101, 1000, 4900]) for (const method of ["parse", "compile", "expand", "stringify"]) {
    const result = outcome(after, method, open.repeat(depth) + "x" + close.repeat(depth));
    equal(result.error, depth <= 100 ? undefined : "SyntaxError");
    if (depth > 100) assert.match(result.message, /Input depth \(101\)/);
  }
  const ceiling = manifest.limits[kind];
  for (const method of ["parse", "compile", "expand", "stringify"]) {
    equal(outcome(after, method, "((x))", { maxDepth: 1.5 }).error, "SyntaxError");
    equal(outcome(after, method, "(x)", { maxDepth: 1.5 }).error, undefined);
    equal(outcome(after, method, "(x)", { maxDepth: 0 }).error, "SyntaxError");
    equal(outcome(after, method, "x", { maxDepth: 0 }).error, undefined);
    equal(outcome(after, method, "abc", { maxDepth: -1 }).error, "RangeError");
    for (const maxDepth of [Infinity, NaN, "999", 100000]) equal(outcome(after, method, "(".repeat(101) + "x" + ")".repeat(101), { maxDepth }).error, "SyntaxError");
    equal(outcome(after, method, "a".repeat(ceiling + 1), { maxLength: NaN }).error, "RangeError");
    equal(outcome(after, method, "a".repeat(ceiling + 1), { maxLength: Infinity }).error, "SyntaxError");
    for (const length of kind === "nft" ? [10001, 65536] : [10000]) equal(outcome(after, method, "a".repeat(length)), outcome(before, method, "a".repeat(length)));
    let reads = 0;
    equal(outcome(after, method, "((x))", { get maxDepth() { return ++reads === 1 ? 1 : NaN; } }).error, "SyntaxError"); equal(reads, 1);
  }
  for (const method of ["compile", "expand", "stringify"]) {
    for (const depth of [100, 101, 10000]) {
      const ast = { type: "root", nodes: [] }; let node = ast;
      for (let i = 0; i < depth; i++) { const child = { type: "paren", nodes: [] }; node.nodes.push(child); node = child; }
      node.nodes.push({ type: "text", value: "x" });
      equal(outcome(after, method, ast).error, depth <= 100 ? undefined : "RangeError");
    }
    const ast = { type: "root", nodes: [] }; ast.nodes.push(ast);
    assert.match(outcome(after, method, ast).message, /AST depth \(101\)/);
  }
  for (const twoNodes of [false, true]) {
    const ast = after.parse("(x)"), paren = ast.nodes.find(node => node.type === "paren");
    paren.parent = twoNodes ? { type: "paren", parent: paren } : paren;
    equal(outcome(after, "expand", ast).message, "AST parent chain contains a cycle");
  }
  for (const input of ["", "x", "{}", "()", "{a,b}", "{{a,b}}", "a/{01..03}/b", ["a/{b,c}", "x/{1..3}"]]) for (const options of [{}, { expand: true }, { expand: true, nodupes: true, noempty: true }, { escapeInvalid: true }]) equal(after(input, options), before(input, options));
  for (const input of ["{".repeat(101) + "x" + "}".repeat(101), "(".repeat(101) + "x" + ")".repeat(101)]) for (const options of [{}, { expand: true }]) {
    assert.throws(() => after(input, options), /Input depth \(101\)/); assert.throws(() => after.create(input, options), /Input depth \(101\)/); assert.throws(() => after(["ordinary", input], options), /Input depth \(101\)/);
  }
  console.log(JSON.stringify({ kind, assertions, differentialPatterns: patterns.length, ceiling }));
}
if (process.argv[2] === "depth-child") runDepthChild();
else {
  test("all embedded processors preserve ordinary behavior and bound deep input/AST/cycles", { timeout: 30000 }, t => {
    const root = mkdtempSync(join(tmpdir(), "gc-toolchain-depth-"));
    try {
      const payload = consumerPayloads(nodeModules)[0];
      for (const [kind, spec] of Object.entries(manifest.bundles)) {
        const before = pristine(kind, read(join(nodeModules, spec.path))), after = transform(kind, before, payload);
        assert.equal(sha256(after), spec.afterSha256); assert.equal(transform(kind, after, payload), after);
        assert.throws(() => transform(kind, before + "\n", payload), /Unexpected/);
        const oldPath = join(root, kind + "-old.cjs"), newPath = join(root, kind + "-patched.cjs");
        writeFileSync(oldPath, capsule(kind, before, false)); writeFileSync(newPath, capsule(kind, after, true));
        const child = spawnSync(process.execPath, ["--max-old-space-size=256", fileURLToPath(import.meta.url), "depth-child", oldPath, newPath, kind], { encoding: "utf8", timeout: 15000, maxBuffer: 1024 * 1024, env: { ...process.env, NODE_DISABLE_COMPILE_CACHE: "1" } });
        assert.equal(child.status, 0, child.stderr); assert.equal(child.error, undefined);
        const result = JSON.parse(child.stdout); assert.equal(result.differentialPatterns, 1516); assert.ok(result.assertions > 18000);
        t.diagnostic(JSON.stringify(result));
      }
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
  test("installer resolves both consumer aliases and validates all inputs before any mutation", () => {
    const root = mkdtempSync(join(tmpdir(), "gc-toolchain-install-"));
    try {
      const payloads = consumerPayloads(nodeModules);
      for (const [index, consumer] of ["micromatch", "tailwindcss"].entries()) {
        const consumerRoot = join(root, consumer); mkdirSync(consumerRoot, { recursive: true });
        writeFileSync(join(consumerRoot, "package.json"), JSON.stringify({ name: consumer }));
        cpSync(payloads[index], join(consumerRoot, "node_modules/braces"), { recursive: true });
      }
      for (const [kind, spec] of Object.entries(manifest.bundles)) {
        const name = kind === "nft" ? "next" : "prettier"; mkdirSync(dirname(join(root, spec.path)), { recursive: true });
        writeFileSync(join(root, name, "package.json"), JSON.stringify({ version: spec.version }));
        writeFileSync(join(root, spec.path), pristine(kind, read(join(nodeModules, spec.path))));
      }
      mkdirSync(dirname(join(root, manifest.plugin.path)), { recursive: true });
      writeFileSync(join(root, "prettier-plugin-tailwindcss/package.json"), JSON.stringify({ version: manifest.plugin.version }));
      writeFileSync(join(root, manifest.plugin.path), read(join(nodeModules, manifest.plugin.path)));
      const nft = join(root, manifest.bundles.nft.path), prettier = join(root, manifest.bundles.prettier.path);
      const beforeNft = read(nft), beforePrettier = read(prettier);
      assert.throws(() => patchInstalledBundles(root, { checkOnly: true }), /Patch required/);
      writeFileSync(prettier, beforePrettier + "\n"); assert.throws(() => patchInstalledBundles(root), /Unexpected/); assert.equal(read(nft), beforeNft);
      writeFileSync(prettier, beforePrettier); const first = patchInstalledBundles(root); assert.equal(first.length, 2);
      assert.deepEqual(patchInstalledBundles(root), first); assert.deepEqual(patchInstalledBundles(root, { checkOnly: true }), first);
      const alias = join(root, "tailwindcss/node_modules/braces/lib/parse.js"); writeFileSync(alias, read(alias) + "\n");
      assert.throws(() => patchInstalledBundles(root), /Reviewed payload changed/); assert.equal(sha256(read(nft)), manifest.bundles.nft.afterSha256);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
  test("real NFT and Prettier APIs plus unchanged Tailwind formatter plugin use the patched files", { timeout: 30000 }, async () => {
    const root = mkdtempSync(join(tmpdir(), "gc-toolchain-consumers-"));
    try {
      const modules = join(root, "node_modules"); mkdirSync(modules);
      symlinkSync(join(nodeModules, "next"), join(modules, "next"), "dir");
      const payload = consumerPayloads(nodeModules)[0];
      const nftSpec = manifest.bundles.nft, nftBefore = pristine("nft", read(join(nodeModules, nftSpec.path)));
      const nftOld = join(modules, "nft-old.cjs"), nftNew = join(modules, "nft-new.cjs"); writeFileSync(nftOld, nftBefore); writeFileSync(nftNew, transform("nft", nftBefore, payload));
      const beforePrettier = pristine("prettier", read(join(nodeModules, manifest.bundles.prettier.path)));
      for (const variant of ["prettier", "prettier-old"]) {
        const target = join(modules, variant); mkdirSync(target);
        for (const entry of readdirSync(join(nodeModules, "prettier"))) if (entry !== "index.mjs") symlinkSync(join(nodeModules, "prettier", entry), join(target, entry));
        writeFileSync(join(target, "index.mjs"), variant === "prettier" ? transform("prettier", beforePrettier, payload) : beforePrettier);
      }
      const pluginRoot = join(modules, "prettier-plugin-tailwindcss"); mkdirSync(join(pluginRoot, "dist"), { recursive: true });
      for (const entry of readdirSync(join(nodeModules, "prettier-plugin-tailwindcss"))) if (entry !== "dist") symlinkSync(join(nodeModules, "prettier-plugin-tailwindcss", entry), join(pluginRoot, entry));
      for (const entry of readdirSync(join(nodeModules, "prettier-plugin-tailwindcss/dist"))) if (entry !== "index.mjs") symlinkSync(join(nodeModules, "prettier-plugin-tailwindcss/dist", entry), join(pluginRoot, "dist", entry));
      writeFileSync(join(pluginRoot, "dist/index.mjs"), read(join(nodeModules, manifest.plugin.path)));
      writeFileSync(join(root, "a.js"), "module.exports = require('./b.js');\n"); writeFileSync(join(root, "b.js"), "module.exports = 1;\n"); writeFileSync(join(root, ".prettierrc.json"), '{"singleQuote":true}\n');
      const normalize = result => ({ files: [...result.fileList].sort(), warnings: [...result.warnings].map(error => error.message).sort() });
      assert.deepEqual(normalize(await require(nftNew).nodeFileTrace([join(root, "a.js")], { base: root })), normalize(await require(nftOld).nodeFileTrace([join(root, "a.js")], { base: root })));
      const before = await import(pathToFileURL(join(modules, "prettier-old/index.mjs"))), after = await import(pathToFileURL(join(modules, "prettier/index.mjs")));
      for (const [parser, text] of [["babel", "const x={hello:'world', nested:[1,2,3]};"], ["typescript", "const x: {a:number}={a:1};"], ["html", '<div class="px-2 flex">Hello</div>'], ["css", ".a {color:red;margin:0px;}"], ["markdown", "# Example\n\nhello  world\n"]]) assert.equal(await after.format(text, { parser }), await before.format(text, { parser }));
      assert.equal(await after.resolveConfigFile(join(root, "a.js")), await before.resolveConfigFile(join(root, "a.js")));
      assert.deepEqual(await after.getFileInfo(join(root, "a.js")), await before.getFileInfo(join(root, "a.js")));
      const text = '<div class="text-red-500 flex px-2">Hello</div>';
      const result = await after.format(text, { parser: "html", plugins: [join(pluginRoot, "dist/index.mjs")] });
      assert.equal(result, await before.format(text, { parser: "html", plugins: [join(nodeModules, manifest.plugin.path)] })); assert.match(result, /class="flex px-2 text-red-500"/);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
}
