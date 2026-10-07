import test from "node:test";
import assert from "node:assert/strict";
import { createCredentialVault, sameCredential, type TextStore, type VaultPorts } from "../src/session/credential-vault.ts";

const scope = "staging|https://fictional.invalid";
const credential = { ownerId: "fictional-alex", token: "a".repeat(43) };
const ticket = { isCurrent: () => true };
class MemoryStore implements TextStore {
  value: string | null = null;
  failWrite = false;
  failRead = false;
  ignoreWrite = false;
  ignoreRemove = false;
  async read() { if (this.failRead) throw new Error("sensitive native error"); return this.value; }
  async write(value: string) {
    if (this.failWrite) throw new Error("sensitive native error");
    if (!this.ignoreWrite) this.value = value;
  }
  async remove() { if (!this.ignoreRemove) this.value = null; }
}
function fixture() {
  let nonce = 0;
  const marker = new MemoryStore();
  const secret = new MemoryStore();
  const ports: VaultPorts = { marker, secret, randomId: () => `00000000-0000-4000-8000-${String(++nonce).padStart(12, "0")}` };
  return { marker, secret, ports, vault: createCredentialVault(scope, ports), fresh: () => createCredentialVault(scope, ports) };
}
async function saved(f: ReturnType<typeof fixture>, input = credential) {
  const result = await f.vault.replace(ticket, input);
  assert.equal(result.status, "candidate");
  if (result.status !== "candidate") throw new Error("Missing fixture credential");
  return result.candidate;
}
function deferred() {
  let resolve: () => void = () => {};
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

test("one bounded unverified credential is bound to installation, owner and environment", async () => {
  const f = fixture();
  const first = await saved(f);
  const restore = await f.fresh().readCandidate(ticket);
  assert.deepEqual(restore, { status: "candidate", candidate: first });
  assert.equal(Object.isFrozen(first), true);
  assert.ok(f.marker.value && f.marker.value.length <= 256);
  assert.ok(f.secret.value && f.secret.value.length <= 1024);
  assert.ok(!f.marker.value.includes(credential.ownerId));
  assert.ok(!f.marker.value.includes(credential.token));
  const second = await saved(f, { ...credential, ownerId: "fictional-blair", token: "b".repeat(43) });
  assert.equal(second.installationId, first.installationId);
  assert.notEqual(second.credentialId, first.credentialId);
  assert.ok(!f.secret.value?.includes(credential.token));
  assert.equal(sameCredential(first, second), false);
});

test("missing installation marker rejects surviving Keychain data after reinstall or cache eviction", async () => {
  const f = fixture();
  const old = await saved(f);
  f.marker.value = null;
  assert.deepEqual(await f.fresh().readCandidate(ticket), { status: "empty", cleanupPending: false });
  assert.equal(f.secret.value, null);
  const next = await saved(f);
  assert.notEqual(next.installationId, old.installationId);
});

test("pending, corrupt, oversized, foreign and mismatched records fail closed", async () => {
  const corruptions: Array<(f: ReturnType<typeof fixture>) => void> = [
    (f) => { f.marker.value = f.marker.value!.replace('"active"', '"pending"'); },
    (f) => { f.marker.value = "malformed"; },
    (f) => { f.secret.value = "x".repeat(1025); },
    (f) => { f.secret.value = f.secret.value!.replace("staging|", "development|"); },
    (f) => { f.secret.value = f.secret.value!.replace('"credentialId":"00000000', '"credentialId":"10000000'); },
    (f) => { f.secret.value = f.secret.value!.replace('"version":1', '"version":2'); },
    (f) => { f.secret.value = f.secret.value!.replace('"version":1', '"extra":"unexpected","version":1'); }
  ];
  for (const corrupt of corruptions) {
    const f = fixture(); await saved(f); corrupt(f);
    assert.deepEqual(await f.fresh().readCandidate(ticket), { status: "empty", cleanupPending: false });
    assert.equal(f.secret.value, null);
  }
});

test("interruption before activation cannot restore the replacement or the old account", async () => {
  const f = fixture(); await saved(f);
  const reached = deferred(); const release = deferred();
  const original = f.secret.write.bind(f.secret);
  f.secret.write = async (value) => { await original(value); reached.resolve(); await release.promise; };
  let active = true;
  const replacing = f.vault.replace({ isCurrent: () => active }, { ownerId: "fictional-blair", token: "b".repeat(43) });
  await reached.promise;
  // Simulate the persisted files seen by a new process without a parallel writer.
  const disk = { marker: f.marker.value, secret: f.secret.value };
  const restarted = fixture(); restarted.marker.value = disk.marker; restarted.secret.value = disk.secret;
  assert.deepEqual(await restarted.vault.readCandidate(ticket), { status: "empty", cleanupPending: false });
  active = false; release.resolve();
  assert.deepEqual(await replacing, { status: "stale", cleanup: "cleared" });
  assert.equal(f.secret.value, null);
});

test("ignored SecureStore writes are detected and never activate credentials", async () => {
  const f = fixture(); await saved(f); f.secret.ignoreWrite = true;
  assert.deepEqual(await f.vault.replace(ticket, { ...credential, token: "b".repeat(43) }), { status: "unavailable", cleanup: "cleared" });
  assert.deepEqual(await f.fresh().readCandidate(ticket), { status: "empty", cleanupPending: false });
});

test("logout tombstone prevents restoration even when native deletion silently fails", async () => {
  const f = fixture(); await saved(f); f.secret.ignoreRemove = true;
  assert.deepEqual(await f.vault.clear(), { status: "cleanup-pending" });
  assert.notEqual(f.secret.value, null);
  assert.deepEqual(await f.fresh().readCandidate(ticket), { status: "empty", cleanupPending: true });
});

test("both stores failing leaves logout unconfirmed and this process locked", async () => {
  const f = fixture(); await saved(f); f.marker.failWrite = true; f.secret.ignoreRemove = true;
  assert.deepEqual(await f.vault.clear(), { status: "unconfirmed" });
  assert.deepEqual(await f.vault.readCandidate(ticket), { status: "locked" });
  // Both persistence mechanisms failed. A new process still sees an unverified
  // candidate; only canonical revocation can additionally invalidate its token.
  const restored = await f.fresh().readCandidate(ticket);
  assert.equal(restored.status, "candidate");
});

test("a queued logout persists even when the next sign-in attempt never saves", async () => {
  const f = fixture(); await saved(f);
  const clearing = f.vault.clear();
  assert.deepEqual(await f.vault.replace({ isCurrent: () => false }, credential), { status: "stale" });
  assert.deepEqual(await clearing, { status: "cleared" });
  assert.deepEqual(await f.fresh().readCandidate(ticket), { status: "empty", cleanupPending: false });
});

test("old delayed logout cannot erase a replacement login, including the same account", async () => {
  for (const ownerId of [credential.ownerId, "fictional-blair"]) {
    const f = fixture(); const old = await saved(f);
    const next = await saved(f, { ownerId, token: "b".repeat(43) });
    assert.deepEqual(await f.vault.clear(old), { status: "superseded" });
    assert.deepEqual(await f.vault.readCandidate(ticket), { status: "candidate", candidate: next });
  }
});

test("logout queues before a later replacement and cannot delete its secret", async () => {
  const f = fixture(); const old = await saved(f);
  const clearing = f.vault.clear(old);
  const replacing = f.vault.replace(ticket, { ownerId: "fictional-blair", token: "b".repeat(43) });
  assert.deepEqual(await clearing, { status: "cleared" });
  const result = await replacing;
  assert.equal(result.status, "candidate");
  assert.deepEqual(await f.fresh().readCandidate(ticket), result);
});

test("late candidate reads never publish after generation invalidation", async () => {
  const f = fixture(); await saved(f);
  const reached = deferred(); const release = deferred();
  const original = f.secret.read.bind(f.secret);
  f.secret.read = async () => { reached.resolve(); await release.promise; return original(); };
  let active = true;
  const reading = f.vault.readCandidate({ isCurrent: () => active });
  await reached.promise; active = false; release.resolve();
  assert.deepEqual(await reading, { status: "stale" });
});

test("stale final activation reports unconfirmed cleanup when both stores fail", async () => {
  const f = fixture(); let active = true;
  const original = f.marker.write.bind(f.marker);
  f.marker.write = async (value) => {
    await original(value);
    if (value.includes('"active"')) { active = false; f.marker.failWrite = true; f.secret.ignoreRemove = true; }
  };
  const result = await f.vault.replace({ isCurrent: () => active }, credential);
  assert.deepEqual(result, { status: "stale", cleanup: "unconfirmed" });
  assert.deepEqual(await f.vault.readCandidate(ticket), { status: "locked" });
  assert.equal((await f.fresh().readCandidate(ticket)).status, "candidate");
});

test("guarded logout still tombstones a matching marker when secure reads fail", async () => {
  const f = fixture(); const old = await saved(f); f.secret.failRead = true;
  assert.deepEqual(await f.vault.clear(old), { status: "cleanup-pending" });
  f.secret.failRead = false;
  assert.deepEqual(await f.fresh().readCandidate(ticket), { status: "empty", cleanupPending: false });
});

test("guarded logout uses the known current binding when marker reads fail", async () => {
  const f = fixture(); const old = await saved(f); f.marker.failRead = true;
  assert.deepEqual(await f.vault.clear(old), { status: "cleared" });
  f.marker.failRead = false;
  assert.deepEqual(await f.fresh().readCandidate(ticket), { status: "empty", cleanupPending: false });
});

test("marker eviction during a secure read cannot publish a restored candidate", async () => {
  const f = fixture(); await saved(f);
  const original = f.secret.read.bind(f.secret);
  f.secret.read = async () => { f.marker.value = null; return original(); };
  assert.deepEqual(await f.fresh().readCandidate(ticket), { status: "empty", cleanupPending: false });
});

test("failed final activation and throwing deletion retain a non-restorable marker", async () => {
  const f = fixture(); const original = f.marker.write.bind(f.marker);
  f.marker.write = async (value) => {
    if (value.includes('"active"')) throw new Error("native activation error");
    await original(value);
  };
  f.secret.remove = async () => { throw new Error("native deletion error"); };
  assert.deepEqual(await f.vault.replace(ticket, credential), { status: "unavailable", cleanup: "cleanup-pending" });
  assert.deepEqual(await f.fresh().readCandidate(ticket), { status: "empty", cleanupPending: true });
});

test("failed restoration cleanup retains its outcome even if the read becomes stale", async () => {
  for (const cancel of [false, true]) {
    const f = fixture(); await saved(f); let active = true;
    f.marker.value = "corrupt"; f.marker.failWrite = true;
    f.secret.remove = async () => { if (cancel) active = false; };
    assert.deepEqual(await f.fresh().readCandidate({ isCurrent: () => active }), {
      status: cancel ? "stale" : "unavailable", cleanup: "unconfirmed"
    });
  }
});

test("storage exceptions are sanitized and a rejected operation does not poison the queue", async () => {
  const f = fixture(); f.marker.failRead = true;
  assert.deepEqual(await f.vault.readCandidate(ticket), { status: "unavailable" });
  f.marker.failRead = false;
  await saved(f);
  assert.deepEqual(await f.vault.clear(), { status: "cleared" });
});

test("invalid inputs and stale tickets do not write or leak a secret", async () => {
  const f = fixture();
  for (const input of [{ ...credential, token: "short" }, { ...credential, ownerId: "bad\nowner" }]) {
    assert.deepEqual(await f.vault.replace(ticket, input), { status: "invalid" });
  }
  assert.deepEqual(await f.vault.readCandidate({ isCurrent: () => false }), { status: "stale" });
  assert.equal(f.marker.value, null); assert.equal(f.secret.value, null);
});
