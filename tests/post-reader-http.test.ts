import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { parse } from "parse5";
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
test("actual native comment action keeps the selected post and feed anchor and writes only to that post", async () => {
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
  const document = parse(html);
  type Node =
    | typeof document
    | {
        nodeName: string;
        attrs?: Array<{ name: string; value: string }>;
        childNodes?: Node[];
      };
  const nodes: Node[] = [];
  const walk = (node: Node) => {
    nodes.push(node);
    if ("childNodes" in node) node.childNodes?.forEach(walk);
  };
  walk(document);
  const attr = (node: Node, name: string) =>
    "attrs" in node
      ? node.attrs?.find((a) => a.name === name)?.value
      : undefined;
  const forms = nodes.filter(
    (node) =>
      node.nodeName === "form" &&
      attr(node, "class")?.includes("gc-comment-form")
  );
  const fields = (form: Node) => {
    const out: Record<string, string> = {};
    const visit = (node: Node) => {
      if (node.nodeName === "input") {
        const name = attr(node, "name");
        if (name) out[name] = attr(node, "value") ?? "";
      }
      if ("childNodes" in node) node.childNodes?.forEach(visit);
    };
    visit(form);
    return out;
  };
  const original = forms.map(fields).find((form) => form.postId === a.id);
  assert.ok(
    original &&
      Object.keys(original).some((name) => name.startsWith("$ACTION_ID_"))
  );
  const form = new FormData();
  for (const [key, value] of Object.entries(original)) form.set(key, value);
  const content = "Reader action target " + randomUUID();
  form.set("content", content);
  form.set("redirectTo", path);
  const response = await fetch(origin + path, {
    method: "POST",
    redirect: "manual",
    headers: {
      Origin: origin,
      Cookie: "church_platform_session=" + f.lee.token
    },
    body: form
  });
  assert.equal(response.status, 303);
  const returned = new URL(response.headers.get("location")!, origin);
  assert.deepEqual(
    Object.fromEntries(returned.searchParams),
    Object.fromEntries(new URL(path, origin).searchParams)
  );
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
