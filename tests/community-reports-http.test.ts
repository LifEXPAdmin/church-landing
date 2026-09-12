import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  createPortalActor,
  seedOperatorGrants,
  assertPortalTestDatabase
} from "./seed-portal";
import { communityReportCommand } from "../lib/platform/community-reports";

const db = new PrismaClient(),
  origin = process.env.ACCOUNT_ORIGIN!;
const enabled = process.env.COMMUNITY_REPORTS_ENABLED === "true";
assert.match(origin, /^https:\/\/127\.0\.0\.1:\d+$/);
let author: Awaited<ReturnType<typeof createPortalActor>>;
let reporter: typeof author, reviewer: typeof author;
before(async () => {
  await assertPortalTestDatabase(db);
  author = await createPortalActor(db, "reportapi");
  reporter = await createPortalActor(db, "reporter");
  reviewer = await createPortalActor(db, "reviewapi");
  await seedOperatorGrants(db, reviewer, ["REVIEW_COMMUNITY_REPORTS"]);
});
beforeEach(() => db.platformAuthLimit.deleteMany());
after(() => db.$disconnect());
const get = (query: Record<string, string>, token = reporter.token) =>
  fetch(
    origin + "/api/platform/community-reports?" + new URLSearchParams(query),
    { headers: { cookie: `church_platform_session=${token}` } }
  );
const send = (
  body: string,
  actor = reporter,
  expected = actor.id,
  from = origin
) =>
  fetch(origin + "/api/platform/community-reports", {
    method: "POST",
    headers: {
      origin: from,
      cookie: `church_platform_session=${actor.token}`,
      "content-type": "application/json",
      "x-expected-account": expected
    },
    body
  });
async function input() {
  const p = await db.platformPost.create({
    data: { authorId: author.id, content: "Fictional HTTP report source" }
  });
  return {
    operation: "create",
    mutationId: randomUUID(),
    targetType: "POST",
    targetId: p.id,
    expectedTargetVersion: p.version,
    expectedContextVersion: 0,
    reason: "SPAM",
    details: "Deliberately submitted HTTP context"
  };
}
async function prepare(body: Record<string, unknown>) {
  const prior = process.env.COMMUNITY_REPORTS_ENABLED;
  try {
    process.env.COMMUNITY_REPORTS_ENABLED = "true";
    return await communityReportCommand(db, reporter.token, body);
  } finally {
    if (prior === undefined) delete process.env.COMMUNITY_REPORTS_ENABLED;
    else process.env.COMMUNITY_REPORTS_ENABLED = prior;
  }
}
test("report HTTPS boundary rejects guests, other origins, account replacement and unsupported fields", async () => {
  const body = await input(),
    raw = JSON.stringify(body);
  assert.equal((await get({ view: "mine" }, "")).status, 401);
  assert.equal((await send(raw, reporter, author.id)).status, 401);
  assert.equal(
    (await send(raw, reporter, reporter.id, "https://elsewhere.example"))
      .status,
    403
  );
  assert.equal(
    (await send(JSON.stringify({ ...body, reporterId: author.id }))).status,
    400
  );
  const response = await get({
    view: "target",
    targetType: "POST",
    targetId: body.targetId
  });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control")!, /private, no-store/);
  assert.equal((await response.json()).available, enabled);
  assert.equal((await send(raw)).status, enabled ? 200 : 503);
});
test("receipt retry stays exact across disabled intake and source withdrawal; author cannot read it", async () => {
  const body = await input(),
    receipt = await prepare(body),
    raw = JSON.stringify(body);
  assert.deepEqual(await (await send(raw)).json(), receipt);
  assert.equal(
    (await send(JSON.stringify({ ...body, details: "Changed body" }))).status,
    409
  );
  assert.equal(
    (await get({ view: "receipt", id: receipt.id }, author.token)).status,
    404
  );
  const owned = await get({ view: "receipt", id: receipt.id });
  assert.equal(owned.status, 200);
  const text = await owned.text();
  assert.ok(!text.includes(author.email));
  assert.ok(!text.includes("Fictional HTTP report source"));
  await db.platformPost.update({
    where: { id: body.targetId },
    data: { status: "WITHDRAWN", withdrawnAt: new Date() }
  });
  assert.deepEqual(await (await send(raw)).json(), receipt);
  assert.equal(
    (await send(JSON.stringify({ ...body, mutationId: randomUUID() }))).status,
    404
  );
});
test("report endpoint quota sends Retry-After when enabled and retains honest disabled intake", async () => {
  const bodies = await Promise.all(Array.from({ length: 6 }, () => input()));
  for (const body of bodies.slice(0, 5)) await prepare(body);
  const response = await send(JSON.stringify(bodies[5]));
  assert.equal(response.status, enabled ? 429 : 503);
  if (enabled) assert.ok(Number(response.headers.get("retry-after")) >= 1);
  const count = await db.communityReport.count({
    where: { reporterId: reporter.id }
  });
  assert.equal((await send(JSON.stringify(bodies[0]))).status, 200);
  assert.equal(
    await db.communityReport.count({ where: { reporterId: reporter.id } }),
    count
  );
});
test("current report-review authority and credentials govern privileged replay over HTTPS", async () => {
  const receipt = await prepare(await input());
  const decision = JSON.stringify({
    operation: "resolve",
    mutationId: randomUUID(),
    id: receipt.id,
    expectedVersion: 1,
    resolution: "CLOSED",
    decisionReason: "Fixture review recorded"
  });
  assert.equal((await send(decision, author)).status, 404);
  assert.equal((await send(decision, reviewer)).status, 200);
  await db.platformOperatorGrant.updateMany({
    where: { userId: reviewer.id },
    data: { revokedAt: new Date() }
  });
  assert.equal(
    (await get({ view: "review", id: receipt.id }, reviewer.token)).status,
    404
  );
  assert.equal((await send(decision, reviewer)).status, 404);
  await db.platformSession.deleteMany({ where: { userId: reporter.id } });
  assert.equal((await get({ view: "receipt", id: receipt.id })).status, 401);
});
