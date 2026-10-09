import assert from "node:assert/strict";
import test from "node:test";
import { apiResponseExamples, examplePost } from "../../lib/platform/api-contract-examples.ts";
import { createNativeApplication, type NativeApplicationPorts } from "../src/session/native-application.ts";
import { createCredentialVault, type TextStore } from "../src/session/credential-vault.ts";
import type { NativeApiConfiguration, NativeWireRequest, NativeWireResponse } from "../src/platform/request-adapter.ts";

const configuration = { environment: "staging", origin: "https://fictional.example.invalid" } as const;
const owner = apiResponseExamples.session.viewerId;
function deferred() {
  let resolve = () => {};
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}
function fixture() {
  let nonce = 0, storageCalls = 0;
  const store = (): TextStore => {
    let value: string | null = null;
    return {
      async read() { storageCalls++; return value; },
      async write(next) { storageCalls++; value = next; },
      async remove() { storageCalls++; value = null; }
    };
  };
  const vault = createCredentialVault("staging|" + configuration.origin, {
    secret: store(), marker: store(),
    randomId: () => `00000000-0000-4000-8000-${String(++nonce).padStart(12, "0")}`
  });
  const requests: NativeWireRequest[] = [], factoryConfigurations: NativeApiConfiguration[] = [], scopes: string[] = [];
  const state = { liked: false, likeVersion: 0, intercept: null as ((request: NativeWireRequest) => Promise<void>) | null };
  const ports: NativeApplicationPorts = {
    wire(fixed) {
      factoryConfigurations.push(fixed);
      return async request => {
        requests.push(request); await state.intercept?.(request);
        const path = new URL(request.url).pathname;
        const activity = { owner, legacy: false, deadline: "2026-10-08T12:01:00.000Z",
          absoluteExpiresAt: "2026-11-07T12:00:00.000Z", serverTime: "2026-10-08T12:00:00.000Z" };
        let receipt = null;
        if (path.endsWith("/like") && request.method === "POST") {
          const body = JSON.parse(request.body!);
          assert.equal(body.mutationId, "fictional-native-choice");
          assert.equal(body.expectedVersion, state.likeVersion);
          state.liked = body.desired; state.likeVersion++;
          receipt = { id: examplePost.id, version: state.likeVersion, message: "Fictional result" };
        }
        const data = path.endsWith("/like") ? receipt ?? { id: examplePost.id, liked: state.liked,
          count: null, version: state.likeVersion } : path.endsWith("/session") ? apiResponseExamples.session.data :
          path.endsWith("/session/activity") ? activity : path.endsWith("/capabilities") ? {
            supportedVersions: ["1"], features: [{ name: "feed.read", available: true }, { name: "post.read", available: true },
              { name: "likes.read", available: true }, { name: "likes.write", available: true }]
          } : path.endsWith("/feed") ? apiResponseExamples.feed.data : path.endsWith("/posts/" + examplePost.id) ? examplePost : null;
        assert.notEqual(data, null, "Only the expected fictional reads are available");
        return { status: 200, apiVersion: "1", contentType: "application/json", cacheControl: "no-store", retryAfter: null,
          body: JSON.stringify({ apiVersion: "1", viewerId: owner, data }) } satisfies NativeWireResponse;
      };
    },
    vault(environment, origin) { scopes.push(environment + "|" + origin); return vault; }
  };
  return { ports, vault, requests, factoryConfigurations, scopes, state, storageCalls: () => storageCalls,
    seed: () => vault.replace({ isCurrent: () => true }, { ownerId: owner!, token: "a".repeat(43) }) };
}
function ready(f: ReturnType<typeof fixture>, config: NativeApiConfiguration = configuration) {
  const application = createNativeApplication(config, f.ports);
  assert.equal(application.kind, "ready");
  if (application.kind !== "ready") throw Error("Expected a constructed application");
  return application.runtime;
}

test("construction remains concealed with no storage or network I/O until foreground entry", async t => {
  const f = fixture(), runtime = ready(f); t.after(runtime.dispose);
  assert.equal(f.factoryConfigurations.length, 1); assert.equal(f.scopes.length, 1);
  assert.equal(f.storageCalls(), 0); assert.deepEqual(f.requests, []);
  assert.equal(runtime.session.getSnapshot().phase, "concealed");
  assert.equal(runtime.session.getSnapshot().account, null);
  assert.equal(runtime.navigation.getSnapshot().destination, null);
  assert.equal(runtime.reading.getSnapshot().kind, "concealed");
  await runtime.setForeground(true);
  assert.equal(runtime.session.getSnapshot().phase, "signed-out");
  assert.ok(f.storageCalls() > 0); assert.deepEqual(f.requests, []);
});

test("one frozen configuration binds factories and runtime despite later input mutation", async t => {
  const f = fixture(); await f.seed();
  const input: { environment: "staging" | "development"; origin: string } = { ...configuration };
  const wire = f.ports.wire;
  f.ports.wire = fixed => {
    input.environment = "development"; input.origin = "https://different.example.invalid";
    assert.ok(Object.isFrozen(fixed));
    assert.throws(() => Object.assign(fixed, { origin: input.origin }));
    return wire(fixed);
  };
  const runtime = ready(f, input); t.after(runtime.dispose);
  assert.deepEqual(f.factoryConfigurations, [configuration]);
  assert.deepEqual(f.scopes, ["staging|" + configuration.origin]);
  await runtime.setForeground(true);
  assert.equal(runtime.reading.getSnapshot().kind, "feed");
  assert.equal(await runtime.open({ kind: "post", postId: examplePost.id }), "opened");
  const reading = runtime.reading.getSnapshot();
  assert.equal(reading.kind, "post");
  if (reading.kind === "post") assert.equal(reading.post.id, examplePost.id);
  assert.ok(f.requests.every(request => new URL(request.url).origin === configuration.origin &&
    request.headers["X-Expected-Account"] === owner));
});

test("invalid configuration and factory failures expose only a generic unavailable result", () => {
  for (const value of [null, {}, { environment: "production", origin: configuration.origin },
    { ...configuration, origin: "http://fictional.example.invalid" }]) {
    const f = fixture();
    assert.deepEqual(createNativeApplication(value as NativeApiConfiguration, f.ports), { kind: "unavailable" });
    assert.deepEqual(f.factoryConfigurations, []); assert.deepEqual(f.scopes, []);
    assert.equal(f.storageCalls(), 0); assert.deepEqual(f.requests, []);
  }
  for (const factory of ["wire", "vault"] as const) {
    const f = fixture();
    f.ports[factory] = () => { throw Error("Private native path and credential details"); };
    const application = createNativeApplication(configuration, f.ports);
    assert.deepEqual(application, { kind: "unavailable" });
    assert.equal(f.storageCalls(), 0); assert.deepEqual(f.requests, []);
  }
});

test("effect cleanup fences a late restore and setup creates a fresh owner using the same vault", async t => {
  const f = fixture(); await f.seed();
  const entered = deferred(), release = deferred();
  let held = false;
  f.state.intercept = async request => {
    if (!held && new URL(request.url).pathname.endsWith("/session")) {
      held = true; entered.resolve(); await release.promise;
    }
  };
  const first = ready(f); t.after(first.dispose);
  const restoring = first.setForeground(true); await entered.promise;
  first.dispose(); first.dispose();
  const second = ready(f); t.after(second.dispose);
  assert.notEqual(first, second);
  assert.equal(second.session.getSnapshot().phase, "concealed");
  try {
    await second.setForeground(true);
    assert.equal(second.session.getSnapshot().account?.id, owner);
    assert.equal(second.reading.getSnapshot().kind, "feed");
  } finally { release.resolve(); await restoring; }
  assert.equal(first.session.getSnapshot().phase, "concealed");
  assert.equal(first.session.getSnapshot().account, null);
  assert.equal(first.reading.getSnapshot().kind, "concealed");
  assert.equal(first.navigation.getSnapshot().destination, null);
  const count = f.requests.length;
  await first.setForeground(true); await first.open({ kind: "post", postId: examplePost.id });
  assert.equal(f.requests.length, count);
  assert.equal(second.session.getSnapshot().account?.id, owner);
  assert.equal(f.factoryConfigurations.length, 2);
  assert.deepEqual(f.scopes, ["staging|" + configuration.origin, "staging|" + configuration.origin]);
});


test("native composition passes the ID port without invoking it during construction or reads", async t => {
  const f = fixture(); await f.seed(); let calls = 0;
  f.ports.mutationId = () => { calls++; return "fictional-native-choice"; };
  const runtime = ready(f); t.after(runtime.dispose);
  assert.equal(calls, 0);
  await runtime.setForeground(true);
  assert.equal(calls, 0);
  await runtime.open({ kind: "post", postId: examplePost.id });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => { stop(); reject(Error("Like status was not ready")); }, 1000);
    const check = () => { if (runtime.likes.getSnapshot().canChoose) { clearTimeout(timer); stop(); resolve(); } };
    const stop = runtime.likes.subscribe(check); check();
  });
  assert.equal(calls, 0);
  await runtime.setLike(runtime.likes.getSnapshot(), true);
  assert.equal(calls, 1); assert.equal(f.state.liked, true);
  assert.equal(f.requests.filter(r => r.method === "POST" && r.url.endsWith("/like")).length, 1);
});
