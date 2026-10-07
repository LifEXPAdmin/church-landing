import test from "node:test";
import assert from "node:assert/strict";
import { WireContractError } from "../lib/platform/api-contracts";
import {
  encodeNativeResponse,
  decodeNativeResponse,
  decodeNativePasswordResponse,
  nativeAuthenticatorInput,
  nativePasswordInput,
  nativeAuthenticatorResult,
  nativeActivityInput,
  nativePasswordResult
} from "../lib/platform/native-auth-contracts";

test("native response identity is bound before encoding or consuming retained work", () => {
  const activity = {
    owner: "account_a",
    legacy: false,
    deadline: "2026-10-07T14:00:00.000Z",
    absoluteExpiresAt: "2026-11-01T14:00:00.000Z",
    serverTime: "2026-10-07T13:45:00.000Z"
  };
  const result = { apiVersion: "1", viewerId: "account_a", data: activity };
  assert.deepEqual(encodeNativeResponse("activity", result), result);
  assert.throws(
    () =>
      encodeNativeResponse("activity", { ...result, viewerId: "account_b" }),
    WireContractError
  );
  assert.throws(
    () => decodeNativeResponse("activity", result, "account_b"),
    WireContractError
  );
  assert.deepEqual(
    decodeNativeResponse(
      "activity",
      { ...result, data: { ...activity, future: true } },
      "account_a"
    ),
    result
  );
  const password = {
    ...result,
    data: {
      tokenType: "Bearer",
      token: "x".repeat(43),
      activity,
      session: {
        state: "authenticated",
        account: {
          id: "account_a",
          name: "Fictional member",
          username: "member_a"
        }
      }
    }
  };
  assert.deepEqual(decodeNativePasswordResponse(password), password);
  assert.throws(
    () => decodeNativePasswordResponse({ ...password, viewerId: "account_b" }),
    WireContractError
  );
  assert.throws(
    () =>
      decodeNativePasswordResponse({
        ...password,
        data: { ...password.data, session: { state: "guest", account: null } }
      }),
    WireContractError
  );
  assert.throws(
    () =>
      encodeNativeResponse("logout", {
        ...result,
        data: { ownerId: "account_b", signedOut: true }
      }),
    WireContractError
  );
});

test("native credentials preserve password bytes and reject identity/provider substitutes", () => {
  const input = { email: " Member@Example.test ", password: "  Paßword🔑  " };
  assert.deepEqual(nativePasswordInput.parse(input), input);
  for (const extra of [
    { ownerId: "other" },
    { token: "x" },
    { credentialMethod: "google" },
    { password: { value: input.password } }
  ])
    assert.throws(
      () => nativePasswordInput.parse({ ...input, ...extra }),
      WireContractError
    );
  assert.throws(
    () =>
      nativeActivityInput.parse({ activity: "foreground", time: Date.now() }),
    WireContractError
  );
});
test("authenticator commands expose only the fields for their exact operation", () => {
  const common = {
    requestKey: "76ff5d31-9439-4d9d-8174-aec5c5dbb657",
    expectedVersion: 0
  };
  const start = {
    ...common,
    operation: "mfa-start",
    currentPassword: "Fictional-password"
  };
  assert.deepEqual(nativeAuthenticatorInput.parse(start), start);
  for (const extra of [
    { requestKey: "challenge_1" },
    { actorId: "other" },
    { purpose: "change-access" },
    { code: "123456" },
    { credentialMethod: "google" },
    { expectedVersion: -1 }
  ])
    assert.throws(
      () => nativeAuthenticatorInput.parse({ ...start, ...extra }),
      WireContractError
    );
  assert.throws(
    () =>
      nativeAuthenticatorInput.parse({
        ...common,
        operation: "mfa-challenge",
        code: "123456",
        purpose: "grant-admin"
      }),
    WireContractError
  );
  assert.throws(
    () =>
      nativeAuthenticatorInput.parse({
        ...common,
        operation: "mfa-confirm",
        code: 123456
      }),
    WireContractError
  );
});
test("authenticator output and bearer issuance reject unexpected sensitive fields", () => {
  const result = {
    version: 1,
    message: "Confirmed.",
    enrollment: null,
    recoveryCodes: null
  };
  assert.deepEqual(nativeAuthenticatorResult.parse(result), result);
  assert.throws(
    () =>
      nativeAuthenticatorResult.parse({
        ...result,
        secretCiphertext: "private"
      }),
    WireContractError
  );
  assert.throws(
    () =>
      nativePasswordResult.parse({
        tokenType: "Bearer",
        token: "x".repeat(43),
        session: { state: "guest", account: null },
        activity: {}
      }),
    WireContractError
  );
});
