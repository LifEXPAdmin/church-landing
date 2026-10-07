import assert from "node:assert/strict";
import test from "node:test";
import * as core from "../packages/shared-core/src/index";
import * as web from "../lib/platform/api-contracts";
import * as native from "../lib/platform/native-auth-contracts";

test("website and native consumers share the same contract functions and error class", () => {
  for (const [name, value] of Object.entries(web)) {
    assert.equal(core[name as keyof typeof core], value, name);
  }
  for (const [name, value] of Object.entries(native)) {
    assert.equal(core[name as keyof typeof core], value, name);
  }
  assert.throws(() => native.nativePasswordInput.parse({ email: "fictional@example.test", password: "short" }), core.WireContractError);
});
