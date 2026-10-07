import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const selectors = [
  ".foo:hover > .bar::before",
  ".hover\\:bg-red-500:hover, .-mt-2",
  ":is(.group:hover .item):not([hidden])",
  '[data-state="open"] .peer ~ .target:focus-visible',
  ".w-\\[calc\\(100\\%-1rem\\)\\]::after",
  ":where(.one, .two) > .three:nth-child(2n + 1)"
];
const nestedCases = [
  ".card { color: red; &:hover, &:focus { color: blue } }",
  ".a, .b { .child { display: flex } & + & { margin: 0 } }",
  ".card { @media (min-width: 640px) { &:is(.active, .open) { display: grid } } }",
  ".parent { /* keep */ [data-state=\"open\"] & { color: red } @starting-style { opacity: 0 } }"
];
export const outputKeys = [
  ...selectors.map((_, i) => `selector:${i}`),
  ...nestedCases.map((_, i) => `nested:${i}`),
  "variants", "app/globals.css", "app/platform/platform.css"
];

export function compareReports(baseline, candidate) {
  for (const [label, report, parserVersion] of [["baseline", baseline, "6.1.4"], ["candidate", candidate, "7.1.6"]]) {
    assert.ok(report && typeof report === "object", `${label}: missing report`);
    assert.equal(report.consumers?.tailwind, "3.4.19", `${label}: Tailwind version`);
    assert.equal(report.consumers?.nested, "6.2.0", `${label}: nesting version`);
    assert.equal(report.consumers?.tailwindParser, parserVersion, `${label}: Tailwind parser`);
    assert.equal(report.consumers?.nestedParser, parserVersion, `${label}: nesting parser`);
    assert.deepEqual(Object.keys(report.outputs || {}).sort(), [...outputKeys].sort(), `${label}: incomplete outputs`);
    for (const key of outputKeys) {
      assert.equal(typeof report.outputs[key], "string", `${label}: ${key} missing output`);
      assert.ok(report.outputs[key].trim().length, `${label}: ${key} empty output`);
    }
    for (const css of ["variants", "app/globals.css", "app/platform/platform.css"]) assert.ok(report.outputs[css].includes("{"), `${label}: ${css} missing CSS rules`);
    assert.ok(report.outputs.variants.includes("group-hover"), `${label}: missing variant generation`);
    assert.ok(report.outputs["app/globals.css"].includes("--tw-"), `${label}: missing Tailwind generation`);
  }
  for (const key of outputKeys) assert.equal(candidate.outputs[key], baseline.outputs[key], `Output changed: ${key}`);
  return Object.fromEntries(outputKeys.map(key => [key, { bytes: Buffer.byteLength(candidate.outputs[key]), sha256: createHash("sha256").update(candidate.outputs[key]).digest("hex") }]));
}

async function collect(install, project) {
  process.chdir(project);
  const require = createRequire(resolve(install, "package.json"));
  const twRequire = createRequire(require.resolve("tailwindcss/package.json"));
  const nestedRequire = createRequire(twRequire.resolve("postcss-nested/package.json"));
  const parser = twRequire("postcss-selector-parser");
  const postcss = require("postcss");
  const tailwind = require("tailwindcss");
  const autoprefixer = require("autoprefixer");
  const nested = twRequire("postcss-nested");
  const prefix = twRequire("./lib/util/prefixSelector.js").default;
  const { applyImportantSelector } = twRequire("./lib/util/applyImportantSelector.js");
  const loadConfig = require("tailwindcss/loadConfig");
  const configPath = resolve(project, "tailwind.config.ts");
  const config = loadConfig(configPath);
  assert.ok(Array.isArray(config.content) && config.content.length, "Missing project content globs");
  assert.ok(twRequire("fast-glob").sync(config.content, { cwd: project, onlyFiles: true }).length, "Project content globs matched no files");
  const outputs = {};
  for (const [i, selector] of selectors.entries()) {
    // Actual Tailwind AST mutation helpers, including pseudo movement and cloning.
    const ast = parser().astSync(selector);
    assert.ok(ast.nodes.length && ast.nodes.every(node => node.nodes.length), "Empty selector AST");
    outputs[`selector:${i}`] = JSON.stringify({ roundtrip: ast.toString(), prefixed: prefix("tw-", ast.clone(), true).toString(), important: applyImportantSelector(selector, "#app") });
  }
  for (const [i, css] of nestedCases.entries()) {
    const result = await postcss([nested()]).process(css, { from: undefined });
    assert.equal(result.warnings().length, 0, "Unexpected nesting warning");
    outputs[`nested:${i}`] = result.css;
  }
  // A separate fixture exercises actual variant traversal/insertion. The two
  // project stylesheets below use the original configuration without alteration.
  const variantConfig = { ...config, content: [{ raw: '<div class="group-hover:text-red-500 peer-checked:block dark:hover:underline [&>p]:mt-2 before:content-[\'x\'] supports-[display:grid]:grid"></div>', extension: "html" }] };
  outputs.variants = (await postcss([tailwind(variantConfig), autoprefixer()]).process("@tailwind utilities;", { from: undefined })).css;
  for (const file of ["app/globals.css", "app/platform/platform.css"]) {
    const path = resolve(project, file);
    const input = readFileSync(path, "utf8");
    assert.ok(input.trim(), `${file}: empty input`);
    const result = await postcss([tailwind(configPath), autoprefixer()]).process(input, { from: path });
    assert.equal(result.warnings().length, 0, `${file}: unexpected warning`);
    outputs[file] = result.css;
  }
  return { consumers: { tailwind: twRequire("./package.json").version, nested: nestedRequire("./package.json").version, tailwindParser: twRequire("postcss-selector-parser/package.json").version, nestedParser: nestedRequire("postcss-selector-parser/package.json").version }, outputs };
}

export function runWorker(install, project) {
  const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url), "--worker", resolve(install), resolve(project)], { encoding: "utf8", timeout: 120000, maxBuffer: 16 * 1024 * 1024 });
  if (child.error) throw child.error;
  assert.equal(child.status, 0, `Compatibility worker failed: ${child.stderr.slice(-3000)}`);
  assert.ok(child.stdout.trim(), "Compatibility worker returned no data");
  return JSON.parse(child.stdout);
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args[0] === "--worker") {
      assert.equal(args.length, 3, "Invalid worker arguments");
      process.stdout.write(JSON.stringify(await collect(args[1], args[2])));
    } else {
      assert.equal(args.length, 6, "Usage: --baseline DIR --candidate DIR --project DIR");
      const options = Object.fromEntries([0, 2, 4].map(i => [args[i], args[i + 1]]));
      assert.deepEqual(Object.keys(options).sort(), ["--baseline", "--candidate", "--project"]);
      const baseline = runWorker(options["--baseline"], options["--project"]);
      const candidate = runWorker(options["--candidate"], options["--project"]);
      console.log(JSON.stringify({ status: "passed", baseline: baseline.consumers, candidate: candidate.consumers, outputs: compareReports(baseline, candidate) }, null, 2));
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
