import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { assertPortalTestDatabase } from "./seed-portal";
import { seedParticipation } from "./seed-post-participation";
import { postCommand } from "../lib/platform/post-commands";
import { readerHref } from "../lib/platform/reader-navigation";
const db = new PrismaClient(),
  origin = process.env.ACCOUNT_ORIGIN!;
const production = process.env.POST_RENDER_PHASE === "production";
assert.match(origin, /^https?:\/\/127\.0\.0\.1:\d+$/);
before(() => assertPortalTestDatabase(db));
after(() => db.$disconnect());
const get = (path: string, token = "", rsc = false) =>
  fetch(origin + path, {
    headers: {
      Cookie: "church_platform_session=" + token,
      ...(rsc ? { RSC: "1" } : {})
    }
  });
test("actual reader HTML and Flight keep a selected bounded set while new posts arrive and permissions change", async () => {
  const f = await seedParticipation(db);
  const create = (content: string) =>
    postCommand(db, f.lee.token, {
      operation: "create",
      requestKey: randomUUID(),
      content
    });
  const c = await create("Reader C " + randomUUID());
  const b = await create("Reader B " + randomUUID());
  const a = await create("Reader A " + randomUUID());
  const row = await db.platformPost.findUniqueOrThrow({ where: { id: a.id } });
  const path = readerHref("/platform", b.id, "pages", {
    id: a.id,
    at: row.publishedAt!.toISOString()
  });
  const arrival = await create("NEW ARRIVAL " + randomUUID());
  for (const rsc of [false, true]) {
    const body = await (await get(path, f.lee.token, rsc)).text();
    assert.ok(
      body.includes(a.id) && body.includes(b.id) && body.includes(c.id)
    );
    assert.ok(!body.includes(arrival.id));
    assert.equal(body.includes(f.post.id), production);
    if (!rsc) {
      const attrs = (id: string) =>
        body.match(
          new RegExp('<div([^>]*data-post="' + id + '"[^>]*)>')
        )?.[1] ?? "";
      assert.match(attrs(a.id), /hidden=""/);
      assert.match(attrs(a.id), /inert=""/);
      assert.ok(!attrs(b.id).includes("hidden"));
      assert.match(attrs(c.id), /hidden=""/);
    }
    const guest = await (await get(path, "", rsc)).text();
    assert.ok(!guest.includes(f.post.id));
  }
  const list = await (
    await get(path.replace("mode=pages", "mode=list"), f.lee.token)
  ).text();
  assert.match(list, /data-mode="list"/);
  assert.ok(!list.match(/<div[^>]*data-post="[^"]+"[^>]*hidden=/));
  await postCommand(db, f.lee.token, {
    operation: "withdraw",
    postId: b.id,
    expectedVersion: 1,
    confirmed: true
  });
  const removed = await (await get(path, f.lee.token)).text();
  assert.ok(
    removed.includes("The post you were reading is no longer in this set.")
  );
  assert.ok(!removed.includes('data-post="' + b.id + '"'));
});
test("canonical comment API writes only to the selected reader post without altering its feed anchor", async () => {
  if (!production) return; // Private form rendering is intentionally production-only.
  const f = await seedParticipation(db);
  const a = await postCommand(db, f.lee.token, {
    operation: "create",
    requestKey: randomUUID(),
    content: "Reader action A"
  });
  const b = await postCommand(db, f.lee.token, {
    operation: "create",
    requestKey: randomUUID(),
    content: "Reader action B"
  });
  const row = await db.platformPost.findUniqueOrThrow({ where: { id: b.id } });
  const path = readerHref("/platform", a.id, "pages", {
    id: b.id,
    at: row.publishedAt!.toISOString()
  });
  const html = await (await get(path, f.lee.token)).text();
  assert.ok(html.includes(a.id) && html.includes(b.id));
  const content = "Reader action target " + randomUUID();
  const body = JSON.stringify({
    operation: "create",
    postId: a.id,
    content,
    mutationId: randomUUID()
  });
  for (let retry = 0; retry < 2; retry++) {
    const response = await fetch(origin + "/api/platform/comments", {
      method: "POST",
      headers: {
        Origin: origin,
        Cookie: "church_platform_session=" + f.lee.token,
        "Content-Type": "application/json",
        "X-Expected-Account": f.lee.id
      },
      body
    });
    assert.equal(response.status, 200);
  }
  const returned = await get(path, f.lee.token);
  assert.equal(returned.url, origin + path);
  assert.equal(
    await db.platformPostComment.count({
      where: { postId: a.id, authorId: f.lee.id, content }
    }),
    1
  );
  assert.equal(
    await db.platformPostComment.count({ where: { postId: b.id, content } }),
    0
  );
});
