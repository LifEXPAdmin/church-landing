import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import {
  nativePushRegisterInput,
  nativePushPrepareInput,
  encodeNativePushResponse,
  decodeNativePushResponse,
  decodeNativePushRegistration,
  decodeNativePushRevocation
} from "../lib/platform/native-push-contracts";

const input = () => ({
  id: randomUUID(),
  mutationId: randomUUID(),
  installationSecret: randomBytes(32).toString("base64url"),
  expectedInstallationVersion: 0,
  recoveryEpoch: randomUUID(),
  provider: "EXPO" as const,
  platform: "IOS" as const,
  token: "ExpoPushToken[fictional_token]",
  label: "Fictional phone"
});
test("device responses preserve canonical browser labels without weakening native registration input", () => {
  const device = {
    id: "browser-device",
    version: 1,
    provider: "WEB_PUSH",
    platform: null,
    label: "Phone\nSafari",
    createdAt: "2026-10-07T20:00:00.000Z",
    expiresAt: "2026-10-08T20:00:00.000Z",
    isCurrentSession: true
  };
  const value = {
    apiVersion: "1",
    viewerId: "owner",
    data: { devices: [device] }
  };
  assert.deepEqual(encodeNativePushResponse("list", value), value);
  assert.deepEqual(decodeNativePushResponse("list", value, "owner"), value);
  assert.throws(() =>
    nativePushRegisterInput.parse({ ...input(), label: device.label })
  );
});
test("portable native registration admits only bounded canonical fields", () => {
  const body = input();
  assert.deepEqual(nativePushRegisterInput.parse(body), body);
  for (const delta of [
    { ownerId: "other" },
    { endpoint: "https://localhost" },
    { label: " " },
    { label: "a\nb" },
    { label: " trailing " },
    { expectedInstallationVersion: -1 },
    { expectedInstallationVersion: 2147483646 },
    { platform: "WEB" },
    { token: "device-token" }
  ])
    assert.throws(() => nativePushRegisterInput.parse({ ...body, ...delta }));
});
test("installation secrets require a canonical 32-byte base64url encoding", () => {
  const body = input();
  assert.doesNotThrow(() =>
    nativePushPrepareInput.parse({
      installationSecret: body.installationSecret
    })
  );
  for (const installationSecret of [
    "x".repeat(43),
    "A".repeat(42),
    "A".repeat(44),
    body.installationSecret + "=",
    "A".repeat(42) + "B"
  ])
    assert.throws(() => nativePushPrepareInput.parse({ installationSecret }));
});
test("registration decoder binds owner, association, generation and recovery epoch to the retained request", () => {
  const body = input();
  const response = {
    apiVersion: "1",
    viewerId: "owner",
    data: {
      id: body.id,
      version: 1,
      installationVersion: 1,
      recoveryEpoch: body.recoveryEpoch,
      message: "Saved."
    }
  };
  assert.deepEqual(
    decodeNativePushRegistration(response, "owner", body),
    response
  );
  for (const delta of [
    { id: randomUUID() },
    { version: 2 },
    { installationVersion: 2 },
    { recoveryEpoch: randomUUID() }
  ])
    assert.throws(() =>
      decodeNativePushRegistration(
        { ...response, data: { ...response.data, ...delta } },
        "owner",
        body
      )
    );
  assert.throws(() => decodeNativePushRegistration(response, "other", body));
  assert.throws(() =>
    encodeNativePushResponse("register", {
      ...response,
      data: { ...response.data, token: body.token }
    })
  );
});
test("removal decoder binds the exact target and resulting version", () => {
  const body = { id: "device", expectedVersion: 1, mutationId: randomUUID() };
  const response = {
    apiVersion: "1",
    viewerId: "owner",
    data: { id: "device", version: 2, removed: true, message: "Removed." }
  };
  assert.deepEqual(
    decodeNativePushRevocation(response, "owner", body),
    response
  );
  assert.throws(() =>
    decodeNativePushRevocation(response, "owner", { ...body, id: "different" })
  );
  assert.throws(() =>
    decodeNativePushRevocation(response, "owner", {
      ...body,
      expectedVersion: 2
    })
  );
});
test("descriptors strip unknown credential fields for consumers and reject them on encoding", () => {
  const device = {
    id: "device",
    version: 1,
    provider: "EXPO",
    platform: "ANDROID",
    label: "Fictional phone",
    createdAt: "2026-10-07T00:00:00.000Z",
    expiresAt: "2026-10-08T00:00:00.000Z",
    isCurrentSession: true
  };
  const raw = {
    apiVersion: "1",
    viewerId: "owner",
    data: {
      devices: [
        {
          ...device,
          token: "secret",
          installationHash: "hash",
          sessionId: "session"
        }
      ]
    }
  };
  assert.deepEqual(
    decodeNativePushResponse("list", raw, "owner").data.devices,
    [device]
  );
  assert.throws(() => encodeNativePushResponse("list", raw));
  assert.throws(() =>
    encodeNativePushResponse("list", {
      ...raw,
      data: { devices: [{ ...device, platform: null }] }
    })
  );
  assert.throws(() =>
    decodeNativePushResponse(
      "list",
      { ...raw, data: { devices: Array(9).fill(device) } },
      "owner"
    )
  );
});
test("notification navigation rejects external destinations and dishonest native availability", () => {
  const raw = {
    apiVersion: "1",
    viewerId: "owner",
    data: {
      href: "/platform/settings/notifications",
      preview: "You have new activity on God’s Churches.",
      tag: "a".repeat(64),
      requiresWeb: true
    }
  };
  assert.deepEqual(decodeNativePushResponse("open", raw, "owner"), raw);
  for (const href of [
    "https://evil.test",
    "//evil.test",
    "/platform\\evil",
    "/platform/messages?token=secret\n"
  ])
    assert.throws(() =>
      decodeNativePushResponse(
        "open",
        { ...raw, data: { ...raw.data, href } },
        "owner"
      )
    );
  assert.throws(() =>
    decodeNativePushResponse(
      "open",
      { ...raw, data: { ...raw.data, requiresWeb: false } },
      "owner"
    )
  );
});
