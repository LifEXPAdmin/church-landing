import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { sessionCookieFixtureName } from "../scripts/session-cookie-fixture.mjs";
import { accountConfig } from "../lib/platform/account-config";
import {
  activityCommand,
  openActivity,
  readActivity
} from "../lib/platform/activity";
import { handleActivityRequest } from "../lib/platform/activity-boundary";
import { interchurchHelpCommand } from "../lib/platform/interchurch-help-commands";
import {
  notificationPreferenceCommand,
  readNotificationPreferences
} from "../lib/platform/notification-preferences";
import { PortalError } from "../lib/platform/portal-policy";
import { seedInterchurchHelp, helpAction } from "./seed-interchurch-help";
import {
  assertPortalTestDatabase,
  createPortalActor,
  seedOperatorGrants,
  type PortalActor
} from "./seed-portal";

const db = new PrismaClient();
const priorReports = process.env.COMMUNITY_REPORTS_ENABLED;
before(async () => {
  await assertPortalTestDatabase(db);
  process.env.COMMUNITY_REPORTS_ENABLED = "true";
  await seedOperatorGrants(db, await createPortalActor(db, "actreview"), [
    "REVIEW_COMMUNITY_REPORTS"
  ]);
});
after(async () => {
  await db.$disconnect();
  if (priorReports === undefined) delete process.env.COMMUNITY_REPORTS_ENABLED;
  else process.env.COMMUNITY_REPORTS_ENABLED = priorReports;
});
const change = (operation: string, fields: Record<string, unknown>) => ({
  operation,
  mutationId: randomUUID(),
  ...fields
});
const denied = (promise: Promise<unknown>, status: number) =>
  assert.rejects(
    promise,
    (error: unknown) => error instanceof PortalError && error.status === status
  );
type Fixture = Awaited<ReturnType<typeof seedInterchurchHelp>>;
async function anotherOffer(f: Fixture) {
  const actor = await createPortalActor(db, "actsecond");
  const request = await db.interchurchHelpRequest.findUniqueOrThrow({
    where: { id: f.request.id }
  });
  const offer = await interchurchHelpCommand(
    db,
    actor.token,
    helpAction("offer", {
      requestId: request.id,
      expectedVersion: request.termsVersion,
      kind: "PERSONAL",
      respondingChurchId: null,
      schema: 1,
      terms: f.terms,
      acceptResponsibility: true,
      externalNotices: false
    })
  );
  await interchurchHelpCommand(
    db,
    f.manager.token,
    helpAction("select", {
      offerId: offer.id,
      expectedVersion: offer.version,
      requestTermsVersion: request.termsVersion,
      acceptTerms: true,
      externalNotices: false
    })
  );
  await f.acknowledge(offer.id, actor);
  return offer.id;
}
const eventRows = (recipientId: string, sourceId?: string) =>
  db.socialEvent.findMany({
    where: {
      recipientId,
      kind: "INTERCHURCH_HELP",
      ...(sourceId ? { sourceId } : {})
    },
    orderBy: { activitySequence: "asc" }
  });
const request = (
  actor: PortalActor,
  body?: Record<string, unknown>,
  query = ""
) =>
  new Request(accountConfig().origin + "/api/platform/activity" + query, {
    method: body ? "POST" : "GET",
    headers: {
      cookie: `${sessionCookieFixtureName()}=${actor.token}`,
      "x-expected-account": actor.id,
      ...(body
        ? { origin: accountConfig().origin, "content-type": "application/json" }
        : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });

test("canonical interchurch updates appear in Church Needs, grouped by offer and excluded from Reports", async () => {
  const f = await seedInterchurchHelp(db),
    first = await f.offer(),
    second = await anotherOffer(f);
  const rows = await eventRows(f.manager.id);
  assert.equal(
    rows.length,
    4,
    "Each offer emits its proposal and final responder acknowledgment through the canonical producer"
  );
  const page = await readActivity(db, f.manager.token, { category: "needs" });
  assert.equal(
    page.items.length,
    2,
    "SQL category and grouping must expose exactly one Needs group per private offer"
  );
  assert.equal(page.unread, 4);
  assert.equal(page.nextCursor, null);
  assert.deepEqual(
    new Set(page.items.map((item) => item.href)),
    new Set(
      [first, second].map((id) => `/platform/exchange/help/offers?id=${id}`)
    )
  );
  for (const item of page.items) {
    assert.equal(item.category, "needs");
    assert.equal(item.count, 2);
    assert.equal(item.unread, 2);
    assert.equal(item.available, true);
    assert.equal(item.summary, "Your private ministry help has an update.");
  }
  assert.equal(
    (await readActivity(db, f.manager.token, { category: "reports" })).items
      .length,
    0
  );
  assert.deepEqual((await readActivity(db, f.manager.token)).items, page.items);
  assert.doesNotMatch(
    JSON.stringify(page),
    /microphones|ADULT_LOGISTICS|authorityKey|coordinatorId|responderId|groupKey/
  );
  const firstGroup = page.items.find((item) => item.href?.endsWith(first))!;
  await activityCommand(
    db,
    f.manager.token,
    change("read", {
      ownerId: f.manager.id,
      boundary: page.boundary,
      id: firstGroup.id
    })
  );
  const afterRead = await readActivity(db, f.manager.token, {
    category: "needs"
  });
  assert.equal(afterRead.unread, 2);
  assert.equal(
    afterRead.items.find((item) => item.href?.endsWith(second))!.unread,
    2
  );
  assert.equal(
    afterRead.items.find((item) => item.href?.endsWith(first))!.unread,
    0
  );
});

test("in-process Activity request boundary keeps later arrivals unread across exact retries and preserves manual-unread delivery history", async () => {
  const f = await seedInterchurchHelp(db),
    offerId = await f.offer();
  const before = await readActivity(db, f.manager.token, { category: "needs" });
  assert.equal(before.items.length, 1);
  const body = change("read", {
    ownerId: f.manager.id,
    boundary: before.boundary,
    id: before.items[0].id
  });
  const a = await f.agreement(offerId);
  await interchurchHelpCommand(
    db,
    f.responder.token,
    helpAction("contact", {
      offerId,
      expectedVersion: a.version,
      termsVersion: a.termsVersion,
      contact: "Fictional private Activity contact",
      consent: true
    })
  );
  const latest = (await eventRows(f.manager.id, offerId)).at(-1)!;
  await db.socialEvent.update({
    where: { id: latest.id },
    data: { createdAt: new Date("2000-01-01T00:00:00Z") }
  });
  const response = await handleActivityRequest(db, request(f.manager, body));
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control")!, /no-store/);
  const receipt = await response.json();
  const current = await readActivity(db, f.manager.token, {
    category: "needs",
    filter: "unread"
  });
  assert.equal(current.items.length, 1);
  assert.equal(current.items[0].count, 3);
  assert.equal(current.items[0].unread, 1);
  assert.equal(current.items[0].id, latest.id);
  assert.equal(current.items[0].createdAt, "2000-01-01T00:00:00.000Z");
  const retry = await handleActivityRequest(db, request(f.manager, body));
  assert.equal(retry.status, 200);
  assert.deepEqual(await retry.json(), receipt);
  assert.equal((await readActivity(db, f.manager.token)).unread, 1);
  assert.equal(
    (
      await handleActivityRequest(
        db,
        request(f.manager, { ...body, boundary: current.boundary })
      )
    ).status,
    409
  );
  assert.equal(
    (await handleActivityRequest(db, request(f.outsider, body))).status,
    401
  );
  const readEvidence = (await eventRows(f.manager.id)).map((row) => [
    row.id,
    row.activityReadAt
  ]);
  const outboxCount = await db.notificationDelivery.count({
    where: { ownerId: f.manager.id }
  });
  await activityCommand(
    db,
    f.manager.token,
    change("unread", {
      ownerId: f.manager.id,
      boundary: current.boundary,
      id: latest.id
    })
  );
  const reminded = await readActivity(db, f.manager.token, {
    category: "needs",
    filter: "unread"
  });
  assert.equal(reminded.items[0].unread, 3);
  assert.deepEqual(
    (await eventRows(f.manager.id)).map((row) => [row.id, row.activityReadAt]),
    readEvidence
  );
  assert.equal(
    await db.notificationDelivery.count({ where: { ownerId: f.manager.id } }),
    outboxCount
  );
  assert.equal((await eventRows(f.manager.id)).length, 3);
  await activityCommand(
    db,
    f.manager.token,
    change("read", {
      ownerId: f.manager.id,
      boundary: reminded.boundary,
      id: latest.id
    })
  );
  assert.equal(
    (
      await readActivity(db, f.manager.token, {
        category: "needs",
        filter: "unread"
      })
    ).items.length,
    0
  );
});

test("current pair loss leaves a grouped unavailable Needs receipt without private metadata or navigation", async () => {
  const f = await seedInterchurchHelp(db),
    offerId = await f.offer();
  const before = await readActivity(db, f.manager.token, { category: "needs" });
  assert.equal(before.items.length, 1);
  const requestRow = await db.interchurchHelpRequest.findUniqueOrThrow({
    where: { id: f.request.id }
  });
  await interchurchHelpCommand(
    db,
    f.manager.token,
    helpAction("withdraw-coordinator", {
      requestId: requestRow.id,
      expectedVersion: requestRow.version
    })
  );
  const after = await readActivity(db, f.manager.token, { category: "needs" });
  assert.equal(after.items.length, 1);
  assert.equal(after.items[0].count, 2);
  assert.equal(after.items[0].category, "needs");
  assert.equal(after.items[0].available, false);
  assert.equal(after.items[0].summary, null);
  assert.equal(after.items[0].href, null);
  assert.ok(!JSON.stringify(after).includes(offerId));
  assert.deepEqual(await openActivity(db, f.manager.token, after.items[0].id), {
    ownerId: f.manager.id,
    available: false,
    href: null
  });
  await denied(openActivity(db, f.outsider.token, after.items[0].id), 404);
  await activityCommand(
    db,
    f.manager.token,
    change("read", {
      ownerId: f.manager.id,
      boundary: after.boundary,
      id: after.items[0].id
    })
  );
  assert.equal((await readActivity(db, f.manager.token)).unread, 0);
});

test("the existing Church Needs preference suppresses interchurch groups and totals without deleting history", async () => {
  const f = await seedInterchurchHelp(db),
    offerId = await f.offer();
  // The responder's preference is independent of the coordinator's authority
  // epoch. A fresh manager action makes the responder's latest source current.
  await f.acknowledge(offerId, f.manager);
  const before = await readActivity(db, f.responder.token, {
    category: "needs"
  });
  assert.equal(before.items.length, 1);
  assert.equal(before.items[0].available, true);
  const rows = await eventRows(f.responder.id);
  for (const enabled of [false, true]) {
    const { preferences } = await readNotificationPreferences(
      db,
      f.responder.token
    );
    await notificationPreferenceCommand(
      db,
      f.responder.token,
      change("preferences", {
        ownerId: f.responder.id,
        expectedVersion: preferences.version,
        inApp: { ...preferences.inApp, needs: enabled },
        pushCategories: preferences.pushCategories,
        quietHours: preferences.quietHours
      })
    );
    const page = await readActivity(db, f.responder.token, {
      category: "needs"
    });
    assert.equal(page.items.length, enabled ? 1 : 0);
    assert.equal(page.unread, enabled ? rows.length : 0);
    if (enabled) assert.equal(page.items[0].available, true);
    assert.deepEqual(
      (await eventRows(f.responder.id)).map((row) => row.id),
      rows.map((row) => row.id)
    );
  }
});
