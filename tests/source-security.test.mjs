import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { verifySourceSecurity } from "../scripts/verify-source-security.mjs";

const command = fileURLToPath(
  new URL("../scripts/verify-source-security.mjs", import.meta.url)
);
const integrity = "sha512-" + Buffer.alloc(64, 7).toString("base64");
const canary = 'fixture-only-secret/with?quote="and+space value';

function fixture(t, { git = true } = {}) {
  const cwd = realpathSync(mkdtempSync(join(tmpdir(), "gc-source-security-")));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const write = (path, value) => {
    mkdirSync(dirname(join(cwd, path)), { recursive: true });
    writeFileSync(
      join(cwd, path),
      typeof value === "string" ? value : JSON.stringify(value)
    );
  };
  const gitCommand = (...args) =>
    execFileSync("git", args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
  const manifest = {
    name: "fixture",
    version: "1.0.0",
    dependencies: { example: "1.0.0" },
    devDependencies: { checker: "2.0.0" }
  };
  const lock = {
    name: manifest.name,
    version: manifest.version,
    lockfileVersion: 3,
    packages: {
      "": structuredClone(manifest),
      "node_modules/example": {
        version: "1.0.0",
        resolved: "https://registry.npmjs.org/example/-/example-1.0.0.tgz",
        integrity
      },
      "node_modules/checker": {
        version: "2.0.0",
        dev: true,
        resolved: "https://registry.npmjs.org/checker/-/checker-2.0.0.tgz",
        integrity
      }
    }
  };
  if (git) {
    gitCommand("init", "-q");
    write("package.json", manifest);
    write("package-lock.json", lock);
    write(
      "app/page.tsx",
      "export const site = process.env.NEXT_PUBLIC_SITE_URL;\n"
    );
    write(".env.example", "DATABASE_URL=placeholder\n");
    gitCommand("add", ".");
  }
  const run = (options) => verifySourceSecurity({ cwd, env: {}, ...options });
  const cli = (args = [], env = {}) =>
    spawnSync(process.execPath, [command, ...args], {
      cwd,
      env: { ...process.env, ...env },
      encoding: "utf8"
    });
  return { cwd, write, git: gitCommand, manifest, lock, run, cli };
}

function codes(report) {
  return report.findings.map((finding) => finding.code);
}

test("source mode checks tracked metadata and authored env names without loading untracked private files", (t) => {
  const f = fixture(t);
  f.write(".env.local", "DATABASE_URL=" + canary);
  f.write(".account-test/private.json", canary);
  f.write("lib/untracked.ts", "process.env.NEXT_PUBLIC_UNTRACKED_SECRET");
  const before = readFileSync(join(f.cwd, ".env.local"), "utf8");
  const report = f.run();
  assert.equal(report.ok, true);
  assert.deepEqual(report.counts, {
    trackedFiles: 4,
    authoredFiles: 1,
    lockedPackages: 2,
    publicBuildFiles: 0,
    suppliedSecretKeys: 0
  });
  assert.equal(readFileSync(join(f.cwd, ".env.local"), "utf8"), before);
  const cli = f.cli();
  assert.equal(cli.status, 0);
  assert.equal(cli.stderr, "");
  assert.equal(JSON.parse(cli.stdout).ok, true);
});

test("source mode requires the Git root and a tracked lockfile", (t) => {
  const absent = fixture(t, { git: false });
  assert.deepEqual(codes(absent.run()), ["GIT_ROOT_REQUIRED"]);
  const f = fixture(t);
  assert.deepEqual(codes(f.run({ cwd: join(f.cwd, "app") })), [
    "GIT_ROOT_REQUIRED"
  ]);
  f.git("rm", "--cached", "package-lock.json");
  assert.ok(codes(f.run()).includes("TRACKED_MANIFEST_REQUIRED"));
});

test("lock version, root dependencies and dev dependencies must agree with package.json", (t) => {
  const f = fixture(t);
  f.lock.lockfileVersion = 2;
  f.write("package-lock.json", f.lock);
  assert.ok(codes(f.run()).includes("LOCKFILE_V3_REQUIRED"));
  f.lock.lockfileVersion = 3;
  f.lock.packages[""].dependencies.example = "2.0.0";
  f.write("package-lock.json", f.lock);
  assert.ok(codes(f.run()).includes("LOCK_ROOT_MISMATCH"));
  f.lock.packages[""].dependencies.example = "1.0.0";
  f.lock.packages[""].devDependencies.checker = "9.0.0";
  f.write("package-lock.json", f.lock);
  assert.ok(codes(f.run()).includes("LOCK_ROOT_MISMATCH"));
});

test("resolved packages reject untrusted registries, credentials and queries without printing them", (t) => {
  const f = fixture(t);
  for (const url of [
    "http://registry.npmjs.org/example.tgz",
    "https://registry.npmjs.org.evil.invalid/example.tgz",
    "https://user:" + canary + "@registry.npmjs.org/example.tgz",
    "https://registry.npmjs.org/example.tgz?token=" +
      encodeURIComponent(canary),
    "file:../private-package"
  ]) {
    f.lock.packages["node_modules/example"].resolved = url;
    f.write("package-lock.json", f.lock);
    const report = f.run();
    assert.ok(codes(report).includes("LOCK_REGISTRY_UNTRUSTED"));
    assert.equal(JSON.stringify(report).includes(canary), false);
    assert.equal(JSON.stringify(report).includes(url), false);
  }
});

test("registry artifacts require canonical SHA-512 integrity", (t) => {
  const f = fixture(t);
  for (const value of [
    undefined,
    "sha1-abcdef",
    "sha512-AAAA",
    integrity + " trailing"
  ]) {
    f.lock.packages["node_modules/example"].integrity = value;
    f.write("package-lock.json", f.lock);
    assert.ok(codes(f.run()).includes("LOCK_INTEGRITY_INVALID"));
  }
});

test("matching root metadata cannot hide missing required direct dependency lock entries", (t) => {
  const f = fixture(t);
  delete f.lock.packages["node_modules/example"];
  f.write("package-lock.json", f.lock);
  assert.ok(codes(f.run()).includes("LOCK_DIRECT_DEPENDENCY_MISSING"));
  delete f.lock.packages["node_modules/checker"];
  f.write("package-lock.json", f.lock);
  assert.equal(f.run().ok, false);
});

test("tracked environment files, private directories and key files fail without reading their values", (t) => {
  const f = fixture(t);
  for (const path of [
    ".env",
    ".env.production",
    "nested/.account-test/receipt.json",
    ".vercel/project.json",
    "node_modules/private.txt",
    "keys/signing.pem",
    "keys/signing.p12"
  ]) {
    f.write(path, canary);
    f.git("add", "-f", path);
  }
  const report = f.run();
  assert.equal(
    report.findings.filter(
      (finding) => finding.code === "TRACKED_PRIVATE_ARTIFACT"
    ).length,
    7
  );
  assert.equal(JSON.stringify(report).includes(canary), false);
  assert.equal(
    report.findings.some((finding) => finding.path === ".env.example"),
    false
  );
});

test("only the existing public site URL name is allowed in authored tracked source", (t) => {
  const f = fixture(t);
  f.write(
    "lib/exposure.ts",
    "const publicValue = process.env.NEXT_PUBLIC_private_token; // " + canary
  );
  f.git("add", "lib/exposure.ts");
  const report = f.run();
  assert.deepEqual(report.findings, [
    {
      code: "PUBLIC_ENV_NOT_ALLOWED",
      path: "lib/exposure.ts",
      key: "NEXT_PUBLIC_private_token"
    }
  ]);
  assert.equal(JSON.stringify(report).includes(canary), false);
});

test("malformed manifest errors redact parser snippets and CLI arguments", (t) => {
  const f = fixture(t);
  f.write("package-lock.json", "{bad json " + canary);
  const cli = f.cli();
  assert.equal(cli.status, 1);
  assert.equal(cli.stderr, "");
  assert.ok(codes(JSON.parse(cli.stdout)).includes("JSON_INVALID"));
  assert.equal(cli.stdout.includes(canary), false);
  const invalid = f.cli([canary]);
  assert.equal(invalid.status, 1);
  assert.equal(invalid.stdout.includes(canary), false);
  assert.deepEqual(codes(JSON.parse(invalid.stdout)), ["ARGUMENT_INVALID"]);
});

test("tracked authored symlinks cannot read untracked private files", (t) => {
  const f = fixture(t);
  f.write("private.txt", "NEXT_PUBLIC_PRIVATE_SECRET=" + canary);
  symlinkSync("../private.txt", join(f.cwd, "app", "linked.ts"));
  f.git("add", "app/linked.ts");
  const report = f.run();
  assert.ok(codes(report).includes("SYMLINK_DISALLOWED"));
  assert.equal(codes(report).includes("PUBLIC_ENV_NOT_ALLOWED"), false);
  assert.equal(JSON.stringify(report).includes(canary), false);
});

test("build-only mode works without Git or a lockfile and reports zero secret coverage explicitly", (t) => {
  const f = fixture(t, { git: false });
  f.write(".next/static/chunks/app.js", "export const marker = 1;");
  const report = f.run({ build: true });
  assert.equal(report.ok, true);
  assert.deepEqual(report.counts, {
    trackedFiles: 0,
    authoredFiles: 0,
    lockedPackages: 0,
    publicBuildFiles: 1,
    suppliedSecretKeys: 0
  });
  assert.equal(f.cli(["--build"]).status, 0);
});

test("requested build mode fails closed for missing or empty public output", (t) => {
  const f = fixture(t, { git: false });
  assert.deepEqual(codes(f.run({ build: true })), ["BUILD_MISSING"]);
  mkdirSync(join(f.cwd, ".next/static"), { recursive: true });
  assert.deepEqual(codes(f.run({ build: true })), ["BUILD_OUTPUT_EMPTY"]);
});

test("public sourcemap assets and inline, relative and external mapping comments are rejected", (t) => {
  const f = fixture(t, { git: false });
  f.write(
    ".next/static/chunks/app.js.map",
    JSON.stringify({ sourcesContent: [canary] })
  );
  f.write(
    ".next/static/chunks/inline.js",
    "//# sourceMappingURL=data:application/json;base64,e30="
  );
  f.write(
    ".next/static/chunks/relative.js",
    "export const x = 1; //# sourceMappingURL=relative.js.map"
  );
  f.write(
    ".next/static/chunks/external.js",
    "//@ sourceMappingURL=https://assets.example.invalid/source"
  );
  f.write(
    ".next/static/css/site.css",
    "body {color: blue} /*# sourceMappingURL=site.css.map */"
  );
  const report = f.run({ build: true });
  assert.equal(
    report.findings.filter((finding) => finding.code === "PUBLIC_SOURCE_MAP")
      .length,
    5
  );
  assert.equal(JSON.stringify(report).includes(canary), false);
});

test("build coverage includes database aliases but excludes the intentionally public VAPID key", (t) => {
  const f = fixture(t, { git: false });
  f.write(".next/static/chunks/database.js", encodeURIComponent(canary));
  const report = f.run({
    build: true,
    env: { POSTGRES_URL_NON_POOLING: canary, PUSH_VAPID_PUBLIC_KEY: canary }
  });
  assert.equal(report.counts.suppliedSecretKeys, 1);
  assert.deepEqual(report.findings, [
    {
      code: "PUBLIC_SECRET_VALUE",
      path: ".next/static/chunks/database.js",
      key: "POSTGRES_URL_NON_POOLING"
    }
  ]);
  assert.equal(JSON.stringify(report).includes(canary), false);
  assert.equal(
    f.run({ build: true, env: { PUSH_VAPID_PUBLIC_KEY: canary } }).ok,
    true
  );
});

test("build canaries detect raw, JSON-escaped and URL-encoded values with redacted CLI output", (t) => {
  const f = fixture(t, { git: false });
  for (const value of [
    canary,
    JSON.stringify(canary).slice(1, -1),
    encodeURIComponent(canary)
  ]) {
    f.write(".next/static/chunks/app.js", value);
    const report = f.run({
      build: true,
      env: {
        ADMIN_PASSWORD: canary,
        CRON_SECRET: "too-short",
        UNLISTED_SECRET: canary
      }
    });
    assert.equal(report.counts.suppliedSecretKeys, 1);
    assert.deepEqual(report.findings, [
      {
        code: "PUBLIC_SECRET_VALUE",
        path: ".next/static/chunks/app.js",
        key: "ADMIN_PASSWORD"
      }
    ]);
    const cli = f.cli(["--build"], { ADMIN_PASSWORD: canary });
    assert.equal(cli.status, 1);
    assert.equal(cli.stderr, "");
    for (const variant of [
      canary,
      JSON.stringify(canary).slice(1, -1),
      encodeURIComponent(canary)
    ])
      assert.equal(cli.stdout.includes(variant), false);
    assert.ok(codes(JSON.parse(cli.stdout)).includes("PUBLIC_SECRET_VALUE"));
  }
});

test("build symlinks and secret-bearing filenames remain fail-closed and redacted", (t) => {
  const f = fixture(t, { git: false });
  const simpleCanary = "fixture-secret-in-path-123456";
  f.write(".next/static/chunks/" + simpleCanary + ".map", "{}");
  f.write("untracked-private.txt", canary);
  symlinkSync(
    "../../../untracked-private.txt",
    join(f.cwd, ".next/static/chunks/linked.js")
  );
  const report = f.run({ build: true, env: { CRON_SECRET: simpleCanary } });
  assert.ok(codes(report).includes("SYMLINK_DISALLOWED"));
  assert.equal(JSON.stringify(report).includes(simpleCanary), false);
  assert.equal(JSON.stringify(report).includes(canary), false);
});
