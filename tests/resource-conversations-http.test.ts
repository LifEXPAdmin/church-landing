import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { assertPortalTestDatabase } from "./seed-portal";
import { seedVolunteerApplications } from "./seed-volunteer-applications";
import { volunteerCommand } from "../lib/platform/volunteer-commands";
import { sessionCookieFixtureName } from "../scripts/session-cookie-fixture.mjs";
const db = new PrismaClient(),
  origin = process.env.ACCOUNT_ORIGIN!;
assert.match(origin, /^https:\/\/127\.0\.0\.1:\d+$/);
before(() => assertPortalTestDatabase(db));
after(() => db.$disconnect());
const get = (path: string, token = "", owner = "", extra = {}) =>
  fetch(origin + path, {
    headers: {
      Cookie: sessionCookieFixtureName() + "=" + token,
      ...(owner ? { "X-Expected-Account": owner } : {}),
      ...extra
    },
    redirect: "manual"
  });
const post = (token: string, owner: string, body: unknown, from = origin) =>
  fetch(origin + "/api/platform/comments", {
    method: "POST",
    headers: {
      Origin: from,
      Cookie: sessionCookieFixtureName() + "=" + token,
      "X-Expected-Account": owner,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

test("built comment read and draft endpoints bind the original account with private cache policy", async () => {
  const f = await seedVolunteerApplications(db, false);
  for (const view of ["", "&view=drafts"]) {
    const path = "/api/platform/comments?postId=" + f.opportunityPost.id + view;
    for (const [token, owner] of [
      [f.lee.token, f.val.id],
      ["", f.lee.id]
    ]) {
      const r = await get(path, token, owner);
      assert.equal(r.status, 401, await r.clone().text());
      assert.match(r.headers.get("cache-control")!, /no-store/);
    }
    const r = await get(path, f.lee.token, f.lee.id);
    assert.equal(r.status, 200, await r.clone().text());
    assert.match(r.headers.get("cache-control")!, /no-store/);
    assert.match(r.headers.get("vary")!, /X-Expected-Account/i);
    if (!view) assert.equal((await r.json()).viewerId, f.lee.id);
  }
});

test("built recruitment comments deduplicate exact bytes and never submit private applications", async () => {
  const f = await seedVolunteerApplications(db, false);
  const input = {
    operation: "create",
    mutationId: randomUUID(),
    postId: f.opportunityPost.id,
    content: "Fictional HTTPS shared question"
  };
  assert.equal((await post(f.lee.token, f.val.id, input)).status, 401);
  assert.equal(
    (await post(f.lee.token, f.lee.id, input, "https://unrelated.example"))
      .status,
    403
  );
  const r = await post(f.lee.token, f.lee.id, input);
  assert.equal(r.status, 200, await r.clone().text());
  const saved = await r.json();
  assert.deepEqual(
    await (await post(f.lee.token, f.lee.id, input)).json(),
    saved
  );
  const thread = await (
    await get(
      "/api/platform/comments?postId=" + f.opportunityPost.id,
      f.val.token,
      f.val.id
    )
  ).json();
  assert.equal(thread.items[0].id, saved.id);
  assert.equal(thread.visibleCount, 1);
  assert.equal(
    await db.volunteerApplication.count({
      where: { opportunityId: f.opportunity.id }
    }),
    0
  );
});

test("built opportunity HTML, RSC and comment projections conceal another applicant's private details", async () => {
  const f = await seedVolunteerApplications(db, false);
  const statement = "Fictional private application marker " + randomUUID();
  const application = await volunteerCommand(
    db,
    f.lee.token,
    f.application(statement)
  );
  for (const extra of [{}, { RSC: "1" }]) {
    const r = await get(
      "/platform/serve/" + f.opportunity.id,
      f.val.token,
      "",
      extra
    );
    assert.equal(r.status, 200);
    const raw = await r.text();
    assert.ok(!raw.includes(statement));
    assert.ok(!raw.includes(application.id));
  }
  for (const actor of [f.ada, f.lee, f.val]) {
    const r = await get(
      "/api/platform/comments?postId=" + f.opportunityPost.id,
      actor.token,
      actor.id
    );
    const raw = await r.text();
    assert.ok(!raw.includes(statement));
    assert.ok(!raw.includes(application.id));
  }
  await db.platformPost.update({
    where: { id: f.opportunityPost.id },
    data: { status: "WITHDRAWN", withdrawnAt: new Date() }
  });
  assert.equal(
    (
      await get(
        "/api/platform/comments?postId=" + f.opportunityPost.id,
        f.lee.token,
        f.lee.id
      )
    ).status,
    404
  );
  assert.equal(
    (
      await post(f.lee.token, f.lee.id, {
        operation: "create",
        mutationId: randomUUID(),
        postId: f.opportunityPost.id,
        content: "Revoked source must deny new comments"
      })
    ).status,
    404
  );
});
