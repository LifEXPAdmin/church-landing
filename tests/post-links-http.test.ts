import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { assertPortalTestDatabase } from "./seed-portal";
import { seedParticipation } from "./seed-post-participation";
import { signPostPreview } from "../lib/platform/post-links";
const db = new PrismaClient(),
  origin = process.env.ACCOUNT_ORIGIN!,
  production = process.env.POST_RENDER_PHASE === "production";
assert.match(origin, /^https?:\/\/127\.0\.0\.1:\d+$/);
before(() => assertPortalTestDatabase(db));
after(() => db.$disconnect());
const send = (token: string, input: Record<string, unknown>, source = origin) =>
  fetch(origin + "/api/platform/posts", {
    method: "POST",
    headers: {
      Origin: source,
      Cookie: "church_platform_session=" + token,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input)
  });
const get = (id: string, token = "", rsc = false) =>
  fetch(origin + "/platform/posts/" + id, {
    headers: {
      Cookie: "church_platform_session=" + token,
      ...(rsc ? { RSC: "1" } : {})
    }
  });
test("actual preview API denies unsafe or unsigned requests and keeps an unavailable preview as a removable plain link", async () => {
  const f = await seedParticipation(db);
  const input = { operation: "preview-link", linkUrl: "https://127.0.0.1/" };
  assert.equal((await send("", input)).status, 401);
  assert.equal(
    (await send(f.lee.token, input, "https://wrong.example")).status,
    403
  );
  assert.equal((await send(f.lee.token, input)).status, 400);
  const fallback = await send(f.lee.token, {
    ...input,
    linkUrl: "https://post-preview-fixture.invalid/resource"
  });
  assert.equal(fallback.status, 200);
  assert.match(fallback.headers.get("cache-control")!, /no-store/);
  const plain = await fallback.json();
  assert.equal(plain.preview, null);
  const created = await send(f.lee.token, {
    operation: "create",
    requestKey: randomUUID(),
    content: "A resource without a preview.",
    linkUrl: plain.url,
    linkReceipt: plain.receipt
  });
  assert.equal(created.status, 200);
  const post = await created.json();
  const body = await (await get(post.id)).text();
  assert.ok(body.includes(plain.url));
  assert.ok(body.includes("opens in a new tab"));
  assert.equal(
    (
      await send(f.lee.token, {
        operation: "edit",
        postId: post.id,
        expectedVersion: 1,
        linkUrl: ""
      })
    ).status,
    200
  );
  assert.ok(!(await (await get(post.id)).text()).includes(plain.url));
});
test("actual HTML and Flight expose inert preview text only to the current post audience and erase withdrawn links", async () => {
  const f = await seedParticipation(db),
    url = "https://example.com/" + randomUUID();
  const marker = "Link " + randomUUID(),
    preview = {
      title: marker + " <script>alert(1)</script>",
      description: "Fictional resource",
      sourceUrl: url
    };
  const created = await send(f.ada.token, {
    operation: "create",
    requestKey: randomUUID(),
    authorChurchId: f.churchA.id,
    audience: "PUBLIC",
    content: "A public church resource.",
    linkUrl: url,
    linkReceipt: signPostPreview(f.ada.id, url, preview),
    keepLinkPreview: true
  });
  assert.equal(created.status, 200);
  const post = await created.json();
  for (const rsc of [false, true]) {
    const body = await (await get(post.id, "", rsc)).text();
    assert.ok(body.includes(marker));
    assert.ok(body.includes(url));
    if (!rsc) {
      assert.ok(!body.includes("<script>alert(1)</script>"));
      assert.ok(body.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
      assert.match(body, /rel="noopener noreferrer"/);
      assert.match(body, /referrerPolicy="no-referrer"/i);
    }
    assert.ok(!body.includes("linkReceipt"));
  }
  assert.equal(
    (
      await send(f.ada.token, {
        operation: "edit",
        postId: post.id,
        expectedVersion: 1,
        audience: "CHURCH",
        confirmAudienceChange: true
      })
    ).status,
    200
  );
  for (const rsc of [false, true])
    for (const token of ["", f.blake.token, f.lee.token]) {
      const body = await (await get(post.id, token, rsc)).text();
      assert.equal(body.includes(marker), production && token === f.lee.token);
      assert.equal(body.includes(url), production && token === f.lee.token);
    }
  assert.equal(
    (
      await send(f.ada.token, {
        operation: "withdraw",
        postId: post.id,
        expectedVersion: 2,
        confirmed: true
      })
    ).status,
    200
  );
  assert.ok(!(await (await get(post.id, f.lee.token)).text()).includes(marker));
  assert.equal(
    (await db.platformPost.findUniqueOrThrow({ where: { id: post.id } }))
      .linkTitle,
    null
  );
});
