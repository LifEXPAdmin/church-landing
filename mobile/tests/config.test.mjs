import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import config from "../app.config.js";
test("development and staging use separate identities; production remains gated", () => {
  const original = process.env.APP_VARIANT;
  try {
    process.env.APP_VARIANT = "development";
    const dev = config();
    process.env.APP_VARIANT = "staging";
    const staging = config();
    assert.notEqual(dev.ios.bundleIdentifier, staging.ios.bundleIdentifier);
    assert.notEqual(dev.android.package, staging.android.package);
    assert.notEqual(dev.scheme, staging.scheme);
    assert.notEqual(dev.slug, staging.slug, "Expo Dev Client generated schemes must not collide");
    assert.equal(dev.extra.fixtureOnly, true);
    assert.equal(dev.updates.enabled, false);
    process.env.APP_VARIANT = "production";
    assert.throws(config, /Production identifiers/);
    process.env.APP_VARIANT = "constructor";
    assert.throws(config, /Production identifiers/);
  } finally {
    if (original === undefined) delete process.env.APP_VARIANT;
    else process.env.APP_VARIANT = original;
  }
});

test("Metro partitions inlined native and fixture selections while reusing equivalent selections", () => {
  const require = createRequire(import.meta.url);
  const path = require.resolve("../metro.config.js");
  const saved = require.cache[path], original = process.env.EXPO_PUBLIC_APPLICATION_MODE;
  function version(mode) {
    if (mode === undefined) delete process.env.EXPO_PUBLIC_APPLICATION_MODE;
    else process.env.EXPO_PUBLIC_APPLICATION_MODE = mode;
    delete require.cache[path];
    return require(path).cacheVersion;
  }
  try {
    const fixture = version("fixture"), native = version("native");
    assert.notEqual(fixture, native);
    assert.equal(version("fixture"), fixture);
    assert.equal(version(undefined), fixture);
    assert.notEqual(version("invalid"), native,
      "An invalid mode must not inherit a cached native literal when a backend is accepted later");
  } finally {
    if (original === undefined) delete process.env.EXPO_PUBLIC_APPLICATION_MODE;
    else process.env.EXPO_PUBLIC_APPLICATION_MODE = original;
    delete require.cache[path];
    if (saved) require.cache[path] = saved;
  }
});

test("only fixture builds include local fixture network exceptions", () => {
  const originalMode = process.env.EXPO_PUBLIC_APPLICATION_MODE;
  const originalVariant = process.env.APP_VARIANT;
  try {
    process.env.APP_VARIANT = "development";
    for (const mode of [undefined, "fixture", "native", "", "typo"]) {
      if (mode === undefined) delete process.env.EXPO_PUBLIC_APPLICATION_MODE;
      else process.env.EXPO_PUBLIC_APPLICATION_MODE = mode;
      const built = config();
      const fixture = mode === undefined || mode === "fixture";
      assert.equal(built.extra.fixtureOnly, fixture);
      assert.equal(built.extra.applicationMode, fixture ? "fixture" : "unavailable");
      assert.equal(built.plugins.includes("./plugins/with-fixture-network"), fixture);
      assert.equal(built.updates.enabled, false);
    }
  } finally {
    if (originalMode === undefined) delete process.env.EXPO_PUBLIC_APPLICATION_MODE;
    else process.env.EXPO_PUBLIC_APPLICATION_MODE = originalMode;
    if (originalVariant === undefined) delete process.env.APP_VARIANT;
    else process.env.APP_VARIANT = originalVariant;
  }
});
