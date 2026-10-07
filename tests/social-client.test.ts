import assert from "node:assert/strict";
import test from "node:test";
import { prepareSocialRequest, socialRequest, SocialClientError } from "../lib/platform/social-client";
import { RequestClientError } from "../packages/shared-core/src/request-client";

const receipt = { id: "owner-a", version: 1, message: "Saved." };
const body = JSON.stringify({ mutationId: "original-key", desired: true });
const json = (value: unknown, status = 200, headers = {}) => new Response(JSON.stringify(value), {
  status, headers: { "content-type": "application/json", ...headers }
});
async function withFetch(run: (set: (fn: typeof fetch) => void) => Promise<void>) {
  const previous = globalThis.fetch;
  try { await run(fn => { globalThis.fetch = fn; }); } finally { globalThis.fetch = previous; }
}
test("browser adapter preserves both identity reads, cookie policy, headers and legacy error class", async () => {
  await withFetch(async set => {
    const calls: { path: string; init?: RequestInit }[] = [];
    set(async (path, init) => {
      calls.push({ path: String(path), init });
      return String(path).includes("view=identity") ? json({ id: "owner-a" }) : json(receipt);
    });
    assert.deepEqual(await socialRequest("/api/platform/choice", body, "owner-a"), { owner: "owner-a", data: receipt });
    assert.equal(calls.length, 3);
    assert.equal(calls.filter(c => c.path.includes("view=identity")).length, 2);
    for (const call of calls) {
      assert.equal(call.init?.credentials, "same-origin"); assert.equal(call.init?.cache, "no-store");
    }
    assert.equal(calls[1].init?.method, "POST"); assert.equal(calls[1].init?.body, body);
    assert.equal((calls[1].init?.headers as Record<string, string>)["X-Expected-Account"], "owner-a");
    assert.equal(SocialClientError, RequestClientError);
  });
});

test("original browser choice survives A to B to A without being rebound to B", async () => {
  await withFetch(async set => {
    let owner = "owner-a", lost = true;
    const sent: { path: string; body: unknown; owner: unknown }[] = [];
    set(async (path, init) => {
      if (String(path).includes("view=identity")) return json({ id: owner });
      sent.push({ path: String(path), body: init?.body, owner: (init?.headers as Record<string, string>)["X-Expected-Account"] });
      if (lost) throw new TypeError("Network reply lost");
      return json(receipt);
    });
    const original = prepareSocialRequest("/api/platform/original-choice", body, "owner-a", "POST", { idempotent: true });
    await assert.rejects(original.run(), SocialClientError);
    owner = "owner-b"; lost = false;
    await assert.rejects(original.run(), error => error instanceof SocialClientError && error.status === 401);
    assert.equal(sent.length, 1);
    owner = "owner-a";
    await original.run();
    assert.deepEqual(sent, [
      { path: "/api/platform/original-choice", body, owner: "owner-a" },
      { path: "/api/platform/original-choice", body, owner: "owner-a" }
    ]);
  });
});

test("non-JSON command replies do not escape as values or skip the post identity check", async () => {
  await withFetch(async set => {
    let identities = 0;
    set(async path => {
      if (String(path).includes("view=identity")) { identities++; return json({ id: "owner-a" }); }
      return new Response("<html>fictional private fragment</html>", { status: 502 });
    });
    await assert.rejects(socialRequest("/api/platform/choice", body, "owner-a"), error => {
      assert.ok(error instanceof SocialClientError); assert.equal(error.code, undefined);
      assert.equal(error.status, 503);
      assert.equal(error.message.includes("private fragment"), false); return true;
    });
    assert.equal(identities, 2);
  });
});

test("identity failures never inherit a rejected command's code", async () => {
  await withFetch(async set => {
    let identities = 0, dispatches = 0;
    set(async path => {
      if (String(path).includes("view=identity")) {
        identities++;
        return identities === 1 ? json({ id: "owner-a" }) : json({ code: "do-not-inherit" }, 503);
      }
      return json({ message: "Rejected", code: "conflict" }, 409);
    });
    await assert.rejects(socialRequest("/api/platform/choice", body, "owner-a", "POST", () => dispatches++), error => {
      assert.ok(error instanceof SocialClientError); assert.equal(error.status, 503);
      assert.equal(error.code, undefined); return true;
    });
    assert.equal(dispatches, 1);
  });
});

test("legacy browser account-change errors remain distinct from command rejection codes", async () => {
  await withFetch(async set => {
    let identities = 0;
    set(async path => {
      if (String(path).includes("view=identity")) return json({ id: ++identities === 1 ? "owner-a" : "owner-b" });
      return json({ message: "Rejected", code: "conflict" }, 409);
    });
    await assert.rejects(socialRequest("/api/platform/choice", body, "owner-a"), error => {
      assert.ok(error instanceof SocialClientError); assert.equal(error.status, 401);
      assert.equal(error.code, undefined); return true;
    });
  });
});

test("representative private-choice decoder refuses malformed success and can retry its original key", async () => {
  await withFetch(async set => {
    let malformed = true, commands = 0;
    set(async path => {
      if (String(path).includes("view=identity")) return json({ id: "owner-a" });
      commands++; return json(malformed ? { id: "owner-a", version: "wrong" } : receipt);
    });
    const original = prepareSocialRequest("/api/platform/choice", body, "owner-a", "POST", {
      idempotent: true, decode(value) {
        if (!value || typeof value !== "object" || !Number.isInteger((value as typeof receipt).version)) throw Error();
        return value as typeof receipt;
      }
    });
    await assert.rejects(original.run(), error => error instanceof SocialClientError && error.code === "unconfirmed");
    malformed = false; assert.deepEqual((await original.run()).data, receipt);
    assert.equal(commands, 2);
  });
});

for (const status of [400, 409]) test(`post-command identity ${status} cannot discard the uncertain original save`, async () => {
  await withFetch(async set => {
    let identities = 0;
    const sent: unknown[] = [];
    set(async (path, init) => {
      if (String(path).includes("view=identity"))
        return ++identities === 2 ? json({ message: "Identity unavailable" }, status) : json({ id: "owner-a" });
      sent.push(init?.body); return json(receipt);
    });
    const original = prepareSocialRequest("/api/platform/choice", body, "owner-a", "POST", { idempotent: true });
    await assert.rejects(original.run(), error => {
      assert.ok(error instanceof SocialClientError);
      assert.equal(error.status, status);
      assert.equal(error.dispatched, true, "The command may already have committed");
      assert.equal(error.responseError, false, "Identity failure is not a definitive command rejection");
      return true;
    });
    await original.run();
    assert.deepEqual(sent, [body, body]);
  });
});

test("cancellation aborts the post-command identity fetch and releases the original for explicit retry", async () => {
  await withFetch(async set => {
    let identities = 0, cancelled = false, postSignal: AbortSignal | null | undefined;
    let begin!: () => void, finish!: () => void;
    const started = new Promise<void>(resolve => { begin = resolve; });
    const listeners = new Set<() => void>();
    const cancellation = { get cancelled() { return cancelled; }, subscribe(listener: () => void) {
      listeners.add(listener); return () => { listeners.delete(listener); };
    } };
    set(async (path, init) => {
      if (!String(path).includes("view=identity")) return json(receipt);
      if (++identities !== 2) return json({ id: "owner-a" });
      postSignal = init?.signal;
      return new Promise<Response>((resolve, reject) => {
        finish = () => resolve(json({ id: "owner-a" }));
        postSignal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
        begin();
      });
    });
    const original = prepareSocialRequest("/api/platform/choice", body, "owner-a", "POST", { idempotent: true });
    const outcome = original.run({ cancellation }).then(() => null, error => error);
    await started;
    try {
      cancelled = true; listeners.forEach(listener => listener());
      assert.equal(postSignal?.aborted, true);
      const error = await outcome;
      assert.ok(error instanceof SocialClientError);
      assert.equal(error.code, "cancelled"); assert.equal(error.dispatched, true);
      assert.equal(listeners.size, 0);
      await original.run();
      assert.equal(identities, 4);
    } finally { finish(); await outcome; }
  });
});
