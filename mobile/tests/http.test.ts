import test from "node:test";
import assert from "node:assert/strict";
import { createFixtureHttpReader } from "../src/spike/http.ts";
import { fixturePosts } from "../src/spike/fixture.ts";

test("fixture transport cannot contact production or forward credentials", async () => {
  assert.throws(() => createFixtureHttpReader("https://godschurches.com"), /isolated/);
  assert.throws(() => createFixtureHttpReader("http://127.0.0.1:4084@other.example"), /isolated/);
  const reader = createFixtureHttpReader("http://127.0.0.1:4084", async (url, init) => {
    assert.equal(url, "http://127.0.0.1:4084/spike/feed");
    assert.equal(init?.credentials, "omit");
    assert.equal(init?.redirect, "error");
    return new Response(JSON.stringify({ kind: "fictional-spike", posts: fixturePosts }), { headers: { "Content-Type": "application/json" } });
  });
  assert.deepEqual(await reader(new AbortController().signal), fixturePosts);
});
test("malformed, oversized and cancelled fixture responses fail closed", async () => {
  for (const body of ['{"kind":"real","posts":[]}', '{"kind":"fictional-spike","posts":[{}]}', "x".repeat(16001)]) {
    const read = createFixtureHttpReader("http://10.0.2.2:4084", async () => new Response(body, { headers: { "Content-Type": "application/json" } }));
    await assert.rejects(read(new AbortController().signal));
  }
  const cancelled = new AbortController();
  cancelled.abort();
  let called = false;
  const read = createFixtureHttpReader("http://127.0.0.1:4084", async () => { called = true; return new Response(); });
  await assert.rejects(read(cancelled.signal));
  assert.equal(called, false);
});

test("fixture byte limit cancels a stream before buffering the entire reply", async () => {
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) { controller.enqueue(new Uint8Array(9000)); },
    cancel() { cancelled = true; }
  });
  const read = createFixtureHttpReader("http://127.0.0.1:4084", async () => new Response(body, { headers: { "Content-Type": "application/json" } }));
  await assert.rejects(read(new AbortController().signal), /byte limit/);
  assert.equal(cancelled, true);
});
