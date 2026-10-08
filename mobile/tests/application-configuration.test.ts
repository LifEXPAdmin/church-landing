import assert from "node:assert/strict";
import test from "node:test";
import { selectApplicationConfiguration, validateNativeConfiguration } from "../application-configuration.js";

test("only an absent or explicit fixture selection starts the fictional application", () => {
  assert.deepEqual(selectApplicationConfiguration(undefined), { kind: "fixture" });
  assert.deepEqual(selectApplicationConfiguration("fixture"), { kind: "fixture" });
  for (const value of ["", "Native", "native ", "production", "constructor", null, {}, true])
    assert.deepEqual(selectApplicationConfiguration(value), { kind: "unavailable" });
});

test("native activation requires the bundled accepted configuration, never an environment origin", () => {
  const previous = process.env.EXPO_PUBLIC_API_ORIGIN;
  try {
    process.env.EXPO_PUBLIC_API_ORIGIN = "https://unreviewed.example.invalid";
    assert.deepEqual(selectApplicationConfiguration("native"), { kind: "unavailable" });
    assert.deepEqual(selectApplicationConfiguration("native", null), { kind: "unavailable" });
  } finally {
    if (previous === undefined) delete process.env.EXPO_PUBLIC_API_ORIGIN;
    else process.env.EXPO_PUBLIC_API_ORIGIN = previous;
  }
});

test("a controlled accepted configuration is copied and frozen without exporting additional data", () => {
  const input = { environment: "staging", origin: "https://fictional.example.invalid", privateValue: "never-copy" };
  const selected = selectApplicationConfiguration("native", input);
  assert.equal(selected.kind, "native");
  if (selected.kind !== "native") return;
  input.origin = "https://changed.example.invalid";
  assert.deepEqual(selected.configuration, { environment: "staging", origin: "https://fictional.example.invalid" });
  assert.equal(Object.isFrozen(selected), true);
  assert.equal(Object.isFrozen(selected.configuration), true);
});

test("invalid native configurations cannot reach a factory", () => {
  for (const value of [undefined, null, {}, [],
    { environment: "production", origin: "https://fictional.example.invalid" },
    ...["http://fictional.example.invalid", "https://user:password@fictional.example.invalid", "https://fictional.example.invalid/", "https://fictional.example.invalid/path", "https://fictional.example.invalid?override=true", "https://fictional.example.invalid#fragment"].map(origin => ({ environment: "staging", origin })),
    { get environment() { throw Error("private error"); } }
  ]) {
    assert.equal(validateNativeConfiguration(value), null);
    assert.deepEqual(selectApplicationConfiguration("native", value), { kind: "unavailable" });
  }
});
