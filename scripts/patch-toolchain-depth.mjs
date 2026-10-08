import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, renameSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const manifest = JSON.parse(readFileSync(new URL("./toolchain-depth-manifest.json", import.meta.url), "utf8"));
export const sha256 = value => createHash("sha256").update(value).digest("hex");
const read = path => readFileSync(path, "utf8");
export function verifyPayload(root) {
  const pkg = JSON.parse(read(join(root, "package.json")));
  assert.equal(pkg.name, manifest.payload.name);
  assert.equal(pkg.version, manifest.payload.version);
  for (const [file, hash] of Object.entries(manifest.payload.files)) {
    assert.equal(sha256(readFileSync(join(root, file))), hash, `Reviewed payload changed: ${file}`);
  }
  return root;
}
export function consumerPayloads(nodeModules) {
  return ["micromatch", "tailwindcss"].map(consumer => {
    const scopedRequire = createRequire(join(resolve(nodeModules), consumer, "package.json"));
    return verifyPayload(dirname(scopedRequire.resolve("braces/package.json")));
  });
}
function replacement(kind, name, payloadRoot) {
  let source = read(join(payloadRoot, "lib", name + ".js"));
  if (kind === "nft" && name === "constants") {
    assert.equal(source.split("MAX_LENGTH: 10000,").length, 2);
    // Explicit adapter: retain NFT's existing 65,536-character ceiling.
    source = source.replace("MAX_LENGTH: 10000,", "MAX_LENGTH: 65536,");
  }
  if (kind === "nft" && name === "compile") {
    assert.equal(source.split(", strictZeros: true").length, 2);
    // Explicit adapter: preserve NFT's existing optional zero-padding matches.
    source = source.replace(", strictZeros: true", "");
    const debug = "      console.log('node.isClose', prefix, node.value);\n";
    assert.equal(source.split(debug).length, 2);
    // NFT did not contain this upstream diagnostic; do not introduce logging.
    source = source.replace(debug, "");
  }
  source = source.replace(/require\('([^']+)'\)/g, (_, request) => {
    const name = request.startsWith("./") ? request.slice(2) : request;
    assert.ok(name === "fill-range" || Object.hasOwn(manifest.bindings, name), "Unreviewed module dependency");
    return kind === "nft"
      ? `__nccwpck_require__(${name === "fill-range" ? 2661 : manifest.bindings[name]})`
      : `require_${name === "fill-range" ? "fill_range" : name}()`;
  });
  return kind === "nft"
    ? `,${manifest.bindings[name]}:(module,exports,__nccwpck_require__)=>{\n${source}\n}`
    : `// node_modules/braces/lib/${name}.js\nvar require_${name} = __commonJS({\n  "node_modules/braces/lib/${name}.js"(exports, module) {\n${source}\n  }\n});\n`;
}
export function transform(kind, input, payloadRoot) {
  const spec = manifest.bundles[kind];
  assert.ok(spec, "Unknown bundle");
  verifyPayload(payloadRoot);
  const hash = sha256(input);
  assert.ok(hash === spec.beforeSha256 || hash === spec.afterSha256, `Unexpected ${kind} bundle; review the exact source before changing it`);
  if (hash === spec.afterSha256) return input;
  let output = input;
  let outsideBefore = input;
  let outsideAfter;
  for (const module of spec.modules) {
    const body = replacement(kind, module.name, payloadRoot);
    assert.equal(body, module.replacement, `Replacement drift: ${kind}/${module.name}`);
    assert.equal(sha256(module.original), module.beforeSha256);
    assert.equal(output.split(module.original).length, 2, `Expected one exact ${kind}/${module.name} factory`);
    output = output.replace(module.original, () => body);
    outsideBefore = outsideBefore.replace(module.original, `/* ${module.name} */`);
  }
  outsideAfter = output;
  for (const module of spec.modules) outsideAfter = outsideAfter.replace(module.replacement, `/* ${module.name} */`);
  assert.equal(outsideAfter, outsideBefore, "Bytes outside the six factories changed");
  assert.equal(sha256(output), spec.afterSha256, "Patched artifact hash changed");
  return output;
}
export function patchInstalledBundles(nodeModules, { checkOnly = false } = {}) {
  const payloads = consumerPayloads(nodeModules);
  assert.equal(JSON.parse(read(join(nodeModules, "prettier-plugin-tailwindcss/package.json"))).version, manifest.plugin.version);
  assert.equal(sha256(readFileSync(join(nodeModules, manifest.plugin.path))), manifest.plugin.sha256, "Review changed plugin closure before proceeding");
  const plan = Object.entries(manifest.bundles).map(([kind, spec]) => {
    const packageName = kind === "nft" ? "next" : "prettier";
    assert.equal(JSON.parse(read(join(nodeModules, packageName, "package.json"))).version, spec.version);
    const path = join(nodeModules, spec.path), before = read(path), after = transform(kind, before, payloads[0]);
    if (checkOnly) assert.equal(before, after, `Patch required: ${kind}`);
    return { kind, path, before, after };
  });
  // Validate every payload/version/input/output before changing either bundle.
  for (const entry of plan) {
    if (entry.before === entry.after) continue;
    const temporary = entry.path + "." + randomUUID() + ".tmp";
    try {
      writeFileSync(temporary, entry.after, { flag: "wx" });
      renameSync(temporary, entry.path);
    } finally { rmSync(temporary, { force: true }); }
  }
  return plan.map(({ kind, after }) => ({ kind, sha256: sha256(after) }));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.ok(process.argv.length === 2 || (process.argv.length === 3 && process.argv[2] === "--check"), "Use no argument to patch, or --check to verify");
  console.log(JSON.stringify(patchInstalledBundles(resolve("node_modules"), { checkOnly: process.argv.includes("--check") })));
}
