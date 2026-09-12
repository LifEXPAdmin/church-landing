import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { createPortalActor, assertPortalTestDatabase } from "./seed-portal";
import { readRelationships } from "../lib/platform/relationships";
import { PortalError } from "../lib/platform/portal";
import { AccountError } from "../lib/platform/accounts";
const db = new PrismaClient();
let owner: Awaited<ReturnType<typeof createPortalActor>>, other: typeof owner;
const targets: string[] = [];
before(async () => {
  await assertPortalTestDatabase(db);
  owner = await createPortalActor(db, "safetysearch");
  other = await createPortalActor(db, "safetyother");
  for (let i = 0; i < 23; i++) {
    const key = randomUUID().replaceAll("-", "").slice(0, 16);
    const u = await db.platformUser.create({
      data: {
        name: "Searchable safety member " + i,
        username: "safe_" + key,
        email: key + "@example.test"
      }
    });
    targets.push(u.id);
    await db.socialRelationship.create({
      data: {
        ownerId: owner.id,
        targetUserId: u.id,
        blocked: true,
        muted: i < 2,
        snoozedUntil: i === 2 ? new Date(Date.now() + 86400000) : null
      }
    });
  }
});
after(() => db.$disconnect());
async function list(
  token: unknown,
  query: { view?: string; q?: unknown; after?: unknown }
) {
  const result = await readRelationships(db, token, query);
  assert.ok("items" in result);
  return result;
}
test("blocked search filters the owner's full list before pagination with no duplicate or foreign records", async () => {
  const first = await list(owner.token, {
    view: "blocked",
    q: "SEARCHABLE SAFETY"
  });
  assert.equal(first.items.length, 20);
  assert.ok(first.nextCursor);
  const second = await list(owner.token, {
    view: "blocked",
    q: "SEARCHABLE SAFETY",
    after: first.nextCursor
  });
  assert.equal(second.items.length, 3);
  assert.equal(second.nextCursor, null);
  assert.equal(
    new Set([...first.items, ...second.items].map((r) => r.id)).size,
    23
  );
  assert.equal(
    (
      await list(other.token, {
        view: "blocked",
        q: "SEARCHABLE SAFETY",
        after: first.nextCursor
      })
    ).items.length,
    0
  );
  const target = await db.platformUser.findUniqueOrThrow({
    where: { id: targets[22] }
  });
  assert.equal(
    (await list(owner.token, { view: "blocked", q: target.username })).items
      .length,
    1
  );
  await assert.rejects(
    list(undefined, { view: "blocked", q: "Searchable" }),
    (e) => e instanceof AccountError && e.code === "session"
  );
});
test("muted search ANDs its filter with current mute or snooze and literal wildcards never expand the result", async () => {
  assert.equal(
    (await list(owner.token, { view: "muted", q: "Searchable" })).items.length,
    3
  );
  assert.equal(
    (await list(owner.token, { view: "muted", q: "unmatched" })).items.length,
    0
  );
  await db.platformUser.update({
    where: { id: targets[0] },
    data: { name: "Literal 100%_value" }
  });
  assert.equal(
    (await list(owner.token, { view: "blocked", q: "%_" })).items.length,
    1
  );
  assert.equal(
    (await list(owner.token, { view: "blocked", q: "nonmatching%" })).items
      .length,
    0
  );
});
test("unavailable labels cannot be recovered through search and malformed/unsupported queries fail explicitly", async () => {
  await db.platformUser.update({
    where: { id: targets[1] },
    data: { name: "Hidden safety label", deactivatedAt: new Date() }
  });
  assert.equal(
    (await list(owner.token, { view: "blocked", q: "Hidden safety label" }))
      .items.length,
    0
  );
  const all = await list(owner.token, { view: "blocked" });
  const row = all.items.find(
    (r) => "targetUserId" in r && r.targetUserId === targets[1]
  );
  assert.ok(row && "target" in row);
  assert.equal(row.target, null);
  for (const query of [
    { view: "blocked", q: "x".repeat(101) },
    { view: "blocked", q: 42 },
    { view: "following", q: "Searchable" }
  ])
    await assert.rejects(
      list(owner.token, query),
      (e) => e instanceof PortalError && e.status === 400
    );
});

test("muted church search uses only the owner's actual settings and available church label", async () => {
  const church = await db.church.create({
    data: {
      slug: "safety-search-" + randomUUID(),
      name: "Safety Search Chapel",
      summary: "Fictional search fixture"
    }
  });
  await db.socialRelationship.create({
    data: { ownerId: owner.id, churchId: church.id, muted: true }
  });
  const matches = await list(owner.token, {
    view: "muted",
    q: "Safety Search Chapel"
  });
  assert.equal(matches.items.length, 1);
  assert.ok("target" in matches.items[0]);
  assert.equal(matches.items[0].target?.name, "Safety Search Chapel");
  assert.equal(
    (await list(other.token, { view: "muted", q: "Safety Search Chapel" }))
      .items.length,
    0
  );
  assert.equal(
    (await list(owner.token, { view: "blocked", q: "Safety Search Chapel" }))
      .items.length,
    0
  );
});
