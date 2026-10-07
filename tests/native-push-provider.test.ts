import test from "node:test";
import assert from "node:assert/strict";
import { createNativePushTransport } from "../lib/platform/native-push-provider";
import { nativePushConfig } from "../lib/platform/native-push-config";

const ticket = "550e8400-e29b-41d4-a716-446655440000";
const config = () => ({
  projectId: ticket,
  accessToken: "fictional-access-token"
});
const token = "ExpoPushToken[fictional_routing_token]";
const payload = { deliveryId: ticket, tag: "a".repeat(64) };
const response = (value: unknown, status = 200) =>
  Response.json(value, { status });
const transport = (reply: () => Response | Promise<Response>) =>
  createNativePushTransport(async () => reply(), config);

test("native provider remains disabled unless all explicit server configuration is present", () => {
  const names = [
    "NATIVE_PUSH_ENABLED",
    "NATIVE_PUSH_EXPO_PROJECT_ID",
    "NATIVE_PUSH_EXPO_ACCESS_TOKEN"
  ];
  const old = names.map((name) => process.env[name]);
  try {
    for (const name of names) delete process.env[name];
    assert.equal(nativePushConfig(), null);
    process.env.NATIVE_PUSH_ENABLED = "true";
    process.env.NATIVE_PUSH_EXPO_PROJECT_ID = ticket;
    assert.equal(nativePushConfig(), null);
    process.env.NATIVE_PUSH_EXPO_ACCESS_TOKEN = "fictional-access-token";
    assert.deepEqual(nativePushConfig(), config());
    process.env.NATIVE_PUSH_EXPO_ACCESS_TOKEN = "fictional\ncredential";
    assert.equal(nativePushConfig(), null);
  } finally {
    names.forEach((name, i) =>
      old[i] === undefined
        ? delete process.env[name]
        : (process.env[name] = old[i])
    );
  }
});

test("provider call is fixed-origin, bounded, generic, and distinguishes ticket from acceptance", async () => {
  let calls = 0;
  const provider = createNativePushTransport(async (url, init) => {
    calls++;
    assert.equal(url, "https://exp.host/--/api/v2/push/send");
    assert.equal(init?.redirect, "error");
    assert.equal(init?.cache, "no-store");
    assert.ok(init?.signal instanceof AbortSignal);
    assert.equal(
      new Headers(init?.headers).get("authorization"),
      "Bearer fictional-access-token"
    );
    const body = JSON.parse(String(init?.body));
    assert.deepEqual(body, {
      to: token,
      title: "God’s Churches",
      body: "You have new activity on God’s Churches.",
      data: payload,
      ttl: 50,
      priority: "normal",
      collapseId: payload.tag,
      tag: payload.tag,
      channelId: "activity"
    });
    return response({ data: { status: "ok", id: ticket } });
  }, config);
  assert.deepEqual(await provider.send(token, payload, 50), {
    kind: "ticket",
    ticketId: ticket,
    statusCode: 200
  });
  assert.equal(calls, 1);
});

test("disabled and malformed calls make no network request", async () => {
  let calls = 0;
  const request: typeof fetch = async () => {
    calls++;
    throw Error("must not call");
  };
  assert.equal(
    (
      await createNativePushTransport(request, () => null).send(
        token,
        payload,
        50
      )
    ).kind,
    "failed"
  );
  const provider = createNativePushTransport(request, config);
  for (const invalid of [
    "https://localhost/token",
    "ExpoPushToken[]",
    "ExpoPushToken[bad\ntoken]"
  ])
    assert.equal((await provider.send(invalid, payload, 50)).kind, "failed");
  for (const ttl of [0, -1, 301, 1.5, NaN])
    assert.equal((await provider.send(token, payload, ttl)).kind, "failed");
  assert.equal(
    (await provider.receipt("https://localhost/receipt")).kind,
    "failed"
  );
  assert.equal(calls, 0);
});

for (const [status, kind] of [
  [400, "failed"],
  [401, "failed"],
  [403, "failed"],
  [404, "failed"],
  [408, "retry"],
  [429, "retry"],
  [500, "retry"],
  [503, "retry"]
] as const)
  test(`provider HTTP ${status} produces only redacted ${kind}`, async () => {
    const provider = transport(() => response({ secret: token }, status));
    assert.deepEqual(await provider.send(token, payload, 50), {
      kind,
      statusCode: status
    });
    assert.deepEqual(await provider.receipt(ticket), {
      kind,
      statusCode: status
    });
  });

test("only DeviceNotRegistered invalidates a device; credential failures do not", async () => {
  for (const [error, kind] of [
    ["DeviceNotRegistered", "invalid"],
    ["MessageRateExceeded", "retry"],
    ["InvalidCredentials", "failed"],
    ["MismatchSenderId", "failed"],
    ["MessageTooBig", "failed"]
  ]) {
    const failure = {
      status: "error",
      message: token,
      details: { error, secret: token }
    };
    assert.deepEqual(
      await transport(() => response({ data: failure })).send(
        token,
        payload,
        50
      ),
      { kind, statusCode: 200 }
    );
    assert.deepEqual(
      await transport(() => response({ data: { [ticket]: failure } })).receipt(
        ticket
      ),
      {
        kind: error === "MessageRateExceeded" ? "retry-delivery" : kind,
        statusCode: 200
      }
    );
  }
});

test("receipt polls use only their captured ticket and require explicit provider acceptance", async () => {
  const provider = createNativePushTransport(async (url, init) => {
    assert.equal(url, "https://exp.host/--/api/v2/push/getReceipts");
    assert.deepEqual(JSON.parse(String(init?.body)), { ids: [ticket] });
    return response({ data: { [ticket]: { status: "ok" } } });
  }, config);
  assert.deepEqual(await provider.receipt(ticket), {
    kind: "accepted",
    statusCode: 200
  });
  assert.deepEqual(
    await transport(() => response({ data: {} })).receipt(ticket),
    { kind: "pending", statusCode: 200 }
  );
  assert.equal(
    (
      await transport(() =>
        response({ data: { unexpected: { status: "ok" } } })
      ).receipt(ticket)
    ).kind,
    "failed"
  );
});

test("malformed, oversized, interrupted and top-level provider errors cannot become acceptance", async () => {
  for (const value of [
    null,
    [],
    {},
    { data: [] },
    { data: { status: "ok", id: token } },
    { errors: [{ message: token }], data: { status: "ok", id: ticket } }
  ])
    assert.equal(
      (await transport(() => response(value)).send(token, payload, 50)).kind,
      "failed"
    );
  for (const body of ["{", " ".repeat(32769)])
    assert.deepEqual(
      await transport(() => new Response(body)).send(token, payload, 50),
      { kind: "retry", statusCode: null }
    );
  assert.deepEqual(
    await transport(() => {
      throw Error(token);
    }).send(token, payload, 50),
    { kind: "retry", statusCode: null }
  );
});
