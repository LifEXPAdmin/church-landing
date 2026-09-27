import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import corpus from "../lib/platform/password-blocklist.json" with { type: "json" };
import { validateNewPassword } from "../lib/platform/password-policy";
import {
  hashPassword,
  validatePassword,
  verifyPassword
} from "../lib/platform/auth";

const context = {
  name: "Fictional Cedar Finch",
  username: "cedar_finch42",
  email: "cedar.contact@example.test"
};

test("reviewed ranked corpus contains 10000 distinct eligible whole-password checks", () => {
  assert.equal(corpus.count, 10000);
  assert.equal(new Set(corpus.hashes).size, 10000);
  assert.equal(corpus.inspectedLines, 22191);
  assert.equal(
    corpus.sourceSha256,
    "1472aafa2561df5e3293aee252aee3ca660c12b399a283cf808bb01b39be388b"
  );
  assert.ok(corpus.hashes.every((s) => /^[a-f0-9]{64}$/.test(s)));
  assert.deepEqual(corpus.hashes, [...corpus.hashes].sort());
  for (const word of ["password", "12345678", "password123", "qwerty123"]) {
    assert.ok(
      corpus.hashes.includes(createHash("sha256").update(word).digest("hex"))
    );
    assert.equal(validateNewPassword(word, context), "password-unsafe");
  }
});

test("common whole-password case, spacing and compatibility variants are screened", () => {
  for (const candidate of [
    "PASSWORD123",
    " password123 ",
    "ｐａｓｓｗｏｒｄ１２３",
    "p-a-s-s-w-o-r-d"
  ])
    assert.equal(
      validateNewPassword(candidate, context),
      "password-unsafe",
      candidate
    );
});

test("documented product and current account variants are screened as whole values", () => {
  for (const candidate of [
    "God's Churches2026!",
    "2026godschurches",
    "ＧｏｄｓＣｈｕｒｃｈｅｓ99",
    "church-platform!",
    "godschurches.com",
    "CEDAR_FINCH42!",
    "cedarfinch789!",
    "Fictional Cedar Finch!",
    "cedar.contact",
    "cedar.contact@example.test2026"
  ])
    assert.equal(
      validateNewPassword(candidate, context),
      "password-unsafe",
      candidate
    );
  assert.equal(
    validateNewPassword("92387160354890", {
      ...context,
      username: "92387160354890"
    }),
    "password-unsafe"
  );
  assert.equal(
    validateNewPassword("923871603548902026!", {
      ...context,
      username: "92387160354890"
    }),
    "password-unsafe"
  );
  assert.equal(
    validateNewPassword("81029643751096", {
      ...context,
      email: "81029643751096@example.test"
    }),
    "password-unsafe"
  );
  assert.equal(
    validateNewPassword("Jo734295861!", { ...context, name: "Jo" }),
    "password-unsafe"
  );
});

test("long passphrases may contain context words; no character-class rules or truncation", () => {
  for (const candidate of [
    "the gods churches moon is beautifully violet",
    "cedar finch greets seven silver umbrellas",
    "unique🍃new🍃password",
    "🙏".repeat(64),
    "春".repeat(128),
    "  lilac orbit lantern  "
  ])
    assert.equal(validateNewPassword(candidate, context), null);
  for (const candidate of [
    null,
    {},
    [],
    12345678,
    "a".repeat(7),
    "a".repeat(129),
    "🙏".repeat(65)
  ])
    assert.equal(validateNewPassword(candidate, context), "invalid");
});

test("screening does not invalidate or normalize existing credentials", async () => {
  const weak = "PaSsWoRd123";
  assert.equal(validateNewPassword(weak, context), "password-unsafe");
  assert.equal(validatePassword(weak), null);
  const prior = await hashPassword(weak);
  assert.ok(await verifyPassword(weak, prior));
  assert.equal(await verifyPassword(weak.toLowerCase(), prior), false);
  const exact = "  lilac orbit lantern  ";
  const stored = await hashPassword(exact);
  assert.ok(await verifyPassword(exact, stored));
  assert.equal(await verifyPassword(exact.trim(), stored), false);
});
