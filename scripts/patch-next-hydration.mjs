import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Temporary backport of React PR #35494, commit c18662405cc436646411647f8a8965c1c0594c3c.
// https://github.com/react/react/pull/35494 (Meta Platforms, Inc.; MIT license).
// Next 15.5.25 bundles its own renderer, so upgrading react-dom alone cannot fix
// its interrupted host hydration. Remove this backport when upgrading to a Next
// renderer containing the upstream fix. Never adapt it silently to another build.
export const rendererFiles = [
  [
    "react-dom",
    "production",
    "9bcaacd92279559075407d2fb09b19893f03f9b93ad74eb0ef42b31b66f6053e"
  ],
  [
    "react-dom",
    "development",
    "14c33685b88f2e39827dc6f0515f9d44411958758aef6573686468163465f6bb"
  ],
  [
    "react-dom-experimental",
    "production",
    "61b94036cbc40ea30618c53b174185f783101b11de218985afecc67e5ff44823"
  ],
  [
    "react-dom-experimental",
    "development",
    "fdfab447bf93c4eeab2ba143f585371817f165a6af763b5d2c4a60eddc77e325"
  ]
].map(([variant, mode, sha256]) => ({
  path: `dist/compiled/${variant}/cjs/react-dom-client.${mode}.js`,
  mode,
  sha256
}));

function replacement(mode) {
  const variable = mode === "production" ? "next" : "unitOfWork";
  const indent = mode === "production" ? "      " : "          ";
  const before = `case 5:\n${indent}resetHooksOnUnwind(${variable});\n`;
  // This is the upstream popHydrationStateOnInterruptedWork logic inlined at
  // its sole call site. It neither clears DOM nodes nor suppresses mismatches.
  const after =
    before +
    [
      "// Godschurches: React #35494 interrupted host hydration backport.",
      `if (${variable} === hydrationParentFiber) {`,
      "  if (!isHydrating) {",
      `    popToNextHostParent(${variable});`,
      "    isHydrating = true;",
      "  } else {",
      `    popToNextHostParent(${variable});`,
      `    if (${variable}.stateNode != null)`,
      `      nextHydratableInstance = ${variable}.stateNode;`,
      "  }",
      "}"
    ]
      .map((line) => indent + line + "\n")
      .join("");
  return { before, after };
}

export function patchNextHydration(nextRoot, { checkOnly = false } = {}) {
  assert.equal(
    JSON.parse(readFileSync(resolve(nextRoot, "package.json"), "utf8")).version,
    "15.5.25",
    "Review/remove the hydration backport before changing Next versions"
  );
  // Validate every renderer before writing any file, including already patched
  // cached installations. A changed dependency must never receive a partial patch.
  const plan = rendererFiles.map(({ path, mode, sha256 }) => {
    const file = resolve(nextRoot, path),
      source = readFileSync(file, "utf8");
    const { before, after } = replacement(mode);
    const patched = source.includes(after);
    const original = patched ? source.replace(after, before) : source;
    assert.equal(
      createHash("sha256").update(original).digest("hex"),
      sha256,
      `Unexpected renderer bytes: ${path}; review the upstream backport`
    );
    assert.equal(
      original.split(before).length,
      2,
      `Expected one host replay in ${path}`
    );
    if (checkOnly) assert.ok(patched, `Hydration backport missing: ${path}`);
    return { file, patched, source: original.replace(before, after) };
  });
  if (!checkOnly)
    for (const file of plan)
      if (!file.patched) writeFileSync(file.file, file.source);
  return {
    verified: plan.length,
    applied: checkOnly ? 0 : plan.filter((f) => !f.patched).length
  };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const result = patchNextHydration(resolve("node_modules/next"), {
    checkOnly: process.argv.includes("--check")
  });
  console.log(
    `React hydration backport: ${result.verified} renderers verified, ${result.applied} applied.`
  );
}
