import assert from "node:assert/strict";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

const files = walk(".next");
const traces = files.filter((path) => path.endsWith(".nft.json"));
for (const required of [
  ".next/next-server.js.nft.json",
  ".next/server/app/api/platform/account/route.js.nft.json",
  ".next/server/app/api/platform/portal/route.js.nft.json",
  ".next/server/app/api/platform/support/route.js.nft.json"
]) {
  assert.ok(
    existsSync(required),
    "Expected account/portal/server trace is missing"
  );
}

// Prisma's CLI can load executable config. It must not enter HTTP function graphs.
const forbidden =
  /\/node_modules\/(?:deepmerge-ts|@prisma\/config|c12|prisma)\//;
let entries = 0;
for (const path of traces) {
  const trace = JSON.parse(readFileSync(path, "utf8"));
  assert.ok(Array.isArray(trace.files), "Invalid runtime trace");
  for (const file of trace.files) {
    entries++;
    assert.ok(
      !/\/(?:\.account-test|\.git)(?:\/|$)|\/\.env(?:\.[^/]+)?$/.test(
        resolve(dirname(path), file)
      ),
      "Release blocked: private fixture, repository metadata or environment file entered a runtime trace"
    );
    assert.ok(
      !forbidden.test(resolve(dirname(path), file)),
      "Release blocked: Prisma configuration tooling entered a runtime trace"
    );
  }
}
const serverJs = files.filter(
  (path) => path.startsWith(".next/server/") && path.endsWith(".js")
);
for (const path of serverJs) {
  assert.ok(
    !/deepmerge-ts|@prisma\/config|loadConfigFromFile|loadConfigTsOrJs/.test(
      readFileSync(path, "utf8")
    ),
    "Release blocked: inspect configuration-loader reference in server bundle"
  );
}
console.log(
  `Release runtime trace check passed: ${traces.length} traces, ${entries} entries, ${serverJs.length} server JS files; no private fixtures/environment files or Prisma configuration-loader path.`
);
