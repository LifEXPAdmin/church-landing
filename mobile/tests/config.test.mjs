import test from "node:test";
import assert from "node:assert/strict";
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
