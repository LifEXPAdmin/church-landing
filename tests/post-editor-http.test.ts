import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { assertPortalTestDatabase } from "./seed-portal";
import { seedParticipation } from "./seed-post-participation";
const db = new PrismaClient(),
  origin = process.env.ACCOUNT_ORIGIN!,
  production = process.env.POST_RENDER_PHASE === "production";
assert.match(origin, /^https?:\/\/127\.0\.0\.1:\d+$/);
before(() => assertPortalTestDatabase(db));
after(() => db.$disconnect());
const get = (path: string, token = "", rsc = false) =>
  fetch(origin + path, {
    headers: {
      ...(token ? { Cookie: "church_platform_session=" + token } : {}),
      ...(rsc ? { RSC: "1" } : {})
    }
  });
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
test("actual publishing endpoints show current authorship choices and persist personal/church forms with safe text and church-page visibility", async () => {
  const f = await seedParticipation(db),
    marker = "Composer public " + randomUUID();
  assert.equal((await get("/api/platform/posts?view=composer")).status, 401);
  const choices = await (
    await get("/api/platform/posts?view=composer", f.lee.token)
  ).json();
  assert.equal(
    choices.churches.find((c: { id: string }) => c.id === f.churchA.id)
      .canPublish,
    false
  );
  const payload = {
    operation: "create",
    requestKey: randomUUID(),
    content:
      marker +
      "\n\n- Bring water\n- Welcome neighbors\n\n<script>alert(1)</script>",
    audienceChurchId: f.churchA.id,
    audience: "PUBLIC",
    topics: ["service", "community"],
    scripture: "Galatians 6:9"
  };
  assert.equal(
    (await send(f.lee.token, payload, "https://wrong.example")).status,
    403
  );
  assert.equal(
    (await send(f.lee.token, { ...payload, authorChurchId: f.churchA.id }))
      .status,
    403
  );
  const response = await send(f.lee.token, payload);
  assert.equal(response.status, 200);
  const p = await response.json();
  assert.equal((await (await send(f.lee.token, payload)).json()).id, p.id);
  const church = await send(f.ada.token, {
    ...payload,
    requestKey: randomUUID(),
    authorChurchId: f.churchA.id,
    content: "Church voice " + marker,
    audience: "CHURCH"
  });
  assert.equal(church.status, 200);
  const churchPost = await church.json();
  for (const rsc of [false, true]) {
    const response = await get("/platform/posts/" + p.id, "", rsc);
    const body = await response.text();
    assert.ok(body.includes(marker));
    if (!rsc) {
      assert.ok(!body.includes("<script>alert(1)</script>"));
      assert.match(body, /<ul\b[^>]*>[\s\S]*?<li>Bring water<\/li>/);
      assert.ok(body.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
    } else
      assert.match(response.headers.get("content-type")!, /text\/x-component/);
    for (const token of ["", f.blake.token, f.lee.token]) {
      const page = await (
        await get("/platform/churches/" + f.churchA.id, token, rsc)
      ).text();
      assert.ok(page.includes(marker));
      assert.equal(
        page.includes("Church voice " + marker),
        production && token === f.lee.token
      );
      assert.ok(!page.includes(f.ada.email));
    }
  }
  assert.equal(
    (await get("/api/platform/posts?postId=" + churchPost.id, f.blake.token))
      .status,
    404
  );
  assert.equal(
    (await get("/api/platform/posts?postId=" + p.id, f.ada.token)).status,
    403
  );
});
test("actual editor conflict, discussion, pin and withdrawal endpoints enforce current versions and render only permitted controls", async () => {
  const f = await seedParticipation(db);
  const p = await (
    await send(f.ada.token, {
      operation: "create",
      requestKey: randomUUID(),
      authorChurchId: f.churchA.id,
      audience: "PUBLIC",
      content: "Manage this fictional church notice."
    })
  ).json();
  const editorResponse = await get(
    "/api/platform/posts?postId=" + p.id,
    f.ada.token
  );
  assert.equal(editorResponse.status, 200);
  assert.match(editorResponse.headers.get("cache-control")!, /no-store/);
  const editor = await editorResponse.json();
  assert.equal(editor.canPin, true);
  assert.equal(editor.authorName, f.churchA.name);
  for (const secret of [f.ada.id, f.ada.email, "scheduledById", "requestKey"])
    assert.ok(!JSON.stringify(editor).includes(secret));
  assert.equal(
    (
      await send(f.ada.token, {
        operation: "edit",
        postId: p.id,
        expectedVersion: 1,
        audience: "CHURCH"
      })
    ).status,
    400
  );
  assert.equal(
    (
      await send(f.ada.token, {
        operation: "edit",
        postId: p.id,
        expectedVersion: 1,
        content: "Changed church notice",
        topics: ["prayer"]
      })
    ).status,
    200
  );
  assert.equal(
    (
      await send(f.ada.token, {
        operation: "edit",
        postId: p.id,
        expectedVersion: 1,
        content: "Stale draft"
      })
    ).status,
    409
  );
  const latest = await (
    await get("/api/platform/posts?postId=" + p.id, f.ada.token)
  ).json();
  assert.equal(latest.content, "Changed church notice");
  assert.equal(latest.version, 2);
  assert.equal(
    (
      await send(f.ada.token, {
        operation: "discussion",
        postId: p.id,
        expectedVersion: 2,
        closed: true,
        replyAudience: "CHURCH_MEMBERS"
      })
    ).status,
    200
  );
  assert.equal(
    (
      await send(f.ada.token, {
        operation: "pin",
        postId: p.id,
        expectedVersion: 3,
        until: new Date(Date.now() + 86400000).toISOString()
      })
    ).status,
    200
  );
  for (const rsc of [false, true]) {
    const guest = await (await get("/platform/posts/" + p.id, "", rsc)).text();
    assert.ok(guest.includes("Edited"));
    if (!rsc) assert.ok(guest.includes("This discussion is closed"));
    const thread = await (
      await get("/api/platform/comments?postId=" + p.id)
    ).json();
    assert.equal(thread.discussionClosed, true);
    assert.equal(thread.canReply, false);
    assert.ok(!guest.includes("Save post changes"));
    const own = await (
      await get("/platform/posts/" + p.id, f.ada.token, rsc)
    ).text();
    // Client-component button text is in HTML; Flight carries the component
    // reference and its permitted props instead of that component's rendered UI.
    assert.equal(
      own.includes(rsc ? '"PostControls"' : "Save post changes"),
      production
    );
    assert.ok(!guest.includes('"PostControls"'));
    const page = await (
      await get("/platform/churches/" + f.churchA.id, "", rsc)
    ).text();
    assert.ok(page.includes("Pinned notices"));
    assert.ok(page.includes("Changed church notice"));
  }
  assert.equal(
    (
      await send(f.ada.token, {
        operation: "withdraw",
        postId: p.id,
        expectedVersion: 4,
        confirmed: false
      })
    ).status,
    400
  );
  assert.equal(
    (
      await send(f.ada.token, {
        operation: "withdraw",
        postId: p.id,
        expectedVersion: 4,
        confirmed: true
      })
    ).status,
    200
  );
  assert.equal(
    (await get("/api/platform/posts?postId=" + p.id, f.ada.token)).status,
    404
  );
  assert.ok(
    !(await (await get("/platform/churches/" + f.churchA.id)).text()).includes(
      "Changed church notice"
    )
  );
});
