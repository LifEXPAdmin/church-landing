import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import yaml from "js-yaml";

const workflow = (name) => yaml.load(readFileSync(
  new URL(`../.github/workflows/${name}.yml`, import.meta.url), "utf8",
));
const mobile = workflow("mobile");
const portable = workflow("portable-contracts");

test("native workflows use runner context only after a job reaches its runner", () => {
  // GitHub rejects runner context in workflow/job env before creating any job.
  // It is available in step env. YAML parsing alone does not catch this error.
  for (const document of [mobile, portable]) {
    for (const env of [document.env, ...Object.values(document.jobs).map((job) => job.env)]) {
      for (const value of Object.values(env ?? {})) {
        assert.doesNotMatch(String(value), /\$\{\{[^}]*\brunner\b/);
      }
    }
  }
  const check = portable.jobs.verify.steps.find((step) => step.run === "npm run check:portable");
  assert.equal(check?.env?.GC_SHARED_CORE_TMP, "${{ runner.temp }}");
});

for (const name of ["checks", "packages", "export"]) {
  for (const available of [true, false]) {
    test(`${name} temporary storage ${available ? "is exported for later steps" : "fails closed without runner storage"}`, (t) => {
      const root = mkdtempSync(join(tmpdir(), "gc-native-workflow-"));
      t.after(() => rmSync(root, { recursive: true, force: true }));
      const runner = join(root, "runner with spaces");
      const environmentFile = join(root, "github-env");
      const steps = mobile.jobs[name].steps;
      const setupIndex = steps.findIndex((step) => step.name === "Prepare ephemeral temporary storage");
      assert.ok(setupIndex >= 0);
      assert.ok(setupIndex < steps.findIndex((step) => step.run?.includes(" ci ")));
      const result = spawnSync("bash", ["--noprofile", "--norc", "-e", "-o", "pipefail", "-c", steps[setupIndex].run], {
        cwd: root,
        encoding: "utf8",
        timeout: 2000,
        env: {
          PATH: process.env.PATH,
          GITHUB_ENV: environmentFile,
          ...(available ? { RUNNER_TEMP: runner } : {}),
        },
      });
      assert.equal(result.signal, null, result.error?.message);
      if (!available) {
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, /Runner temporary storage is required/);
        assert.throws(() => statSync(environmentFile), { code: "ENOENT" });
        return;
      }
      assert.equal(result.status, 0, result.stderr);
      const exported = Object.fromEntries(readFileSync(environmentFile, "utf8").trim().split("\n").map((line) => {
        const separator = line.indexOf("=");
        return [line.slice(0, separator), line.slice(separator + 1)];
      }));
      const expected = {
        npm_config_cache: join(runner, "mobile-npm-cache"),
        TMPDIR: join(runner, "mobile-tmp"),
        ...(name === "export" ? {
          __UNSAFE_EXPO_HOME_DIRECTORY: join(runner, "mobile-expo-home"),
          XDG_CACHE_HOME: join(runner, "mobile-cache"),
        } : {}),
      };
      assert.deepEqual(exported, expected);
      for (const directory of Object.values(exported)) assert.ok(statSync(directory).isDirectory());
    });
  }
}
