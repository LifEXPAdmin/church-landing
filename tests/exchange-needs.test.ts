import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  assertPortalTestDatabase,
  createPortalActor,
  seedOperatorGrants,
  type PortalActor
} from "./seed-portal";
import { exchangeNeedCommand as command } from "../lib/platform/exchange-need-commands";
import { readExchangeNeeds as read } from "../lib/platform/exchange-need-reads";
import { relationshipCommand } from "../lib/platform/relationships";
import { PortalError } from "../lib/platform/portal-policy";
import { NEED_SCHEMA } from "../lib/platform/exchange-need-options";
import {
  parseNeedSlot,
  needDeadline,
  needQuantity
} from "../lib/platform/exchange-need-input";
import { EXCHANGE_ITEM_POLICY } from "../lib/platform/exchange-options";
import { exchangeListingCommand } from "../lib/platform/exchange-listings";
import { processNotificationFanoutBatch } from "../lib/platform/notification-fanout";
import { consumeNotificationWork } from "../lib/platform/notification-consumer";
import {
  NOTIFICATION_WORK_TOPIC,
  notificationFanoutMessage
} from "../lib/platform/notification-work-message";
import {
  prepareAccountExport,
  downloadAccountExport
} from "../lib/platform/account-export";
import { requestPermanentAccountDeletion } from "../lib/platform/account-deletion";
import { eraseRequestedAccountData } from "../lib/platform/account-erasure";
import { createSessionToken } from "../lib/platform/auth";
import { notificationSources } from "../lib/platform/notification-source";
import {
  notificationPushAllowed,
  notificationPreferenceCommand,
  projectNotificationPreferences
} from "../lib/platform/notification-preferences";
import { advanceNeedDeadlines } from "../lib/platform/exchange-need-maintenance";
import {
  replayRetentionControls,
  type RetentionControlEntry
} from "../lib/platform/retention-controls";
import {
  communityReportCommand,
  readCommunityReports
} from "../lib/platform/community-reports";
import { handleExchangeRequest } from "../lib/platform/exchange-boundary";
import { SESSION_COOKIE } from "../lib/platform/account-boundary";
import { accountConfig } from "../lib/platform/account-config";
import { seedParticipation } from "./seed-post-participation";

async function volunteerNeed() {
  const f = await seedParticipation(db);
  await db.churchCapabilityGrant.create({
    data: {
      churchId: f.churchA.id,
      userId: f.val.id,
      capability: "MODERATE_EXCHANGE_LISTINGS"
    }
  });
  await db.socialPreferences.upsert({
    where: { ownerId: f.ada.id },
    create: { ownerId: f.ada.id, contactRequests: "EVERYONE" },
    update: { contactRequests: "EVERYONE" }
  });
  await db.churchCapabilityGrant.create({
    data: {
      churchId: f.churchA.id,
      userId: f.ada.id,
      capability: "MANAGE_EXCHANGE_LISTINGS"
    }
  });
  const listing = await db.exchangeListing.create({
    data: {
      ownerChurchId: f.churchA.id,
      creatorId: f.ada.id,
      intent: "CHURCH_NEED",
      category: "HOUSEHOLD",
      title: "Fictional event help",
      description: "Isolated shared volunteer capacity",
      requestedItems: "One helper",
      audience: "CHURCH",
      audienceChurchId: f.churchA.id,
      country: "US",
      placeId: 4887398,
      placeLabel: "Chicago"
    }
  });
  const need = await command(
    db,
    f.ada.token,
    input("configure", {
      listingId: listing.id,
      listingVersion: listing.version,
      expectedVersion: 0,
      deadlineLocal: deadline(),
      timeZone: "UTC",
      acceptCoordinator: true
    })
  );
  const role = await f.slot();
  const slot = await command(
    db,
    f.ada.token,
    input("slot", {
      needId: need.id,
      slotId: randomUUID(),
      expectedVersion: 0,
      schema: NEED_SCHEMA,
      fields: {
        ...slotFields("VOLUNTEER"),
        unit: "places",
        target: 1,
        volunteerSlotId: role.id
      }
    })
  );
  const ready = await db.exchangeListing.findUniqueOrThrow({
    where: { id: listing.id }
  });
  await exchangeListingCommand(
    db,
    f.ada.token,
    input("status", {
      listingId: listing.id,
      expectedVersion: ready.version,
      state: "ACTIVE",
      itemPolicy: EXCHANGE_ITEM_POLICY,
      itemConfirmed: true
    })
  );
  return { ...f, listing, need, role, needSlot: slot };
}

const db = new PrismaClient();
let reviewer: PortalActor;
const prior = process.env.COMMUNITY_REPORTS_ENABLED;
before(async () => {
  await assertPortalTestDatabase(db);
  process.env.COMMUNITY_REPORTS_ENABLED = "true";
  reviewer = await createPortalActor(db, "needreview");
  await seedOperatorGrants(db, reviewer, ["REVIEW_COMMUNITY_REPORTS"]);
});
after(async () => {
  await db.$disconnect();
  if (prior === undefined) delete process.env.COMMUNITY_REPORTS_ENABLED;
  else process.env.COMMUNITY_REPORTS_ENABLED = prior;
});
const input = (operation: string, data: Record<string, unknown>) => ({
  operation,
  mutationId: randomUUID(),
  ...data
});
const denied = (value: Promise<unknown>, status: number) =>
  assert.rejects(
    value,
    (e: unknown) => e instanceof PortalError && e.status === status
  );
const deadline = (days = 3) =>
  new Date(Date.now() + days * 86400000).toISOString().slice(0, 16);
const slotFields = (action = "DONATE", loan = false) => ({
  action,
  label: "Fictional food parcels",
  unit: "parcels",
  target: 10,
  loan,
  returnLocal: loan ? deadline(7) : null,
  returnTimeZone: loan ? "UTC" : null,
  returnResponsibility: loan
    ? "Church coordinator returns the equipment to its lender."
    : "",
  volunteerSlotId: null
});
async function setup(action = "DONATE", loan = false) {
  const manager = await createPortalActor(db, "needmgr"),
    a = await createPortalActor(db, "needa"),
    b = await createPortalActor(db, "needb");
  await db.socialPreferences.create({
    data: { ownerId: manager.id, contactRequests: "EVERYONE" }
  });
  const church = await db.church.create({
    data: {
      slug: "fixture-need-" + randomUUID(),
      name: "Fictional Needs church",
      summary: "Isolated acceptance",
      communityListed: true
    }
  });
  await db.churchConnection.createMany({
    data: [manager, a, b].map((x) => ({
      userId: x.id,
      churchId: church.id,
      state: "APPROVED"
    }))
  });
  const grant = await db.churchCapabilityGrant.create({
    data: {
      churchId: church.id,
      userId: manager.id,
      capability: "MANAGE_EXCHANGE_LISTINGS"
    }
  });
  await db.churchCapabilityGrant.create({
    data: {
      churchId: church.id,
      userId: manager.id,
      capability: "MODERATE_EXCHANGE_LISTINGS"
    }
  });
  const listing = await db.exchangeListing.create({
    data: {
      ownerChurchId: church.id,
      creatorId: manager.id,
      intent: "CHURCH_NEED",
      category: "HOUSEHOLD",
      title: "Fictional food need",
      description: "Isolated contribution acceptance",
      requestedItems: "Ten fictional parcels",
      country: "US",
      placeId: 4887398,
      placeLabel: "Chicago",
      itemPolicy: EXCHANGE_ITEM_POLICY
    }
  });
  const configured = await command(
    db,
    manager.token,
    input("configure", {
      listingId: listing.id,
      listingVersion: listing.version,
      expectedVersion: 0,
      deadlineLocal: deadline(),
      timeZone: "UTC",
      acceptCoordinator: true
    })
  );
  const slot = await command(
    db,
    manager.token,
    input("slot", {
      needId: configured.id,
      slotId: randomUUID(),
      expectedVersion: 0,
      schema: NEED_SCHEMA,
      fields: slotFields(action, loan)
    })
  );
  const ready = await db.exchangeListing.findUniqueOrThrow({
    where: { id: listing.id }
  });
  await exchangeListingCommand(
    db,
    manager.token,
    input("status", {
      listingId: listing.id,
      expectedVersion: ready.version,
      state: "ACTIVE",
      itemPolicy: EXCHANGE_ITEM_POLICY,
      itemConfirmed: true
    })
  );
  return {
    manager,
    a,
    b,
    church,
    grant,
    listing,
    needId: configured.id,
    slotId: slot.id,
    loan
  };
}
async function claim(
  f: Awaited<ReturnType<typeof setup>>,
  actor: PortalActor,
  quantity: number,
  extra = {}
) {
  const need = await db.exchangeNeed.findUniqueOrThrow({
    where: { id: f.needId }
  });
  const slot = await db.exchangeNeedSlot.findUniqueOrThrow({
    where: { id: f.slotId }
  });
  const body = input("claim", {
    needId: f.needId,
    slotId: f.slotId,
    slotVersion: slot.version,
    consentVersion: need.consentVersion,
    id: randomUUID(),
    expectedVersion: 0,
    quantity,
    note: "Fictional private contribution note",
    price: null,
    currency: null,
    shareName: false,
    loanAccepted: f.loan,
    waitlist: false,
    ...extra
  });
  return { body, receipt: await command(db, actor.token, body) };
}
async function view(f: Awaited<ReturnType<typeof setup>>, actor?: PortalActor) {
  const result = await read(db, actor?.token, {
    view: "need",
    listingId: f.listing.id
  });
  assert.ok("need" in result && result.need);
  return result.need;
}
test("whole quantities and deadlines reject silent rounding, calendar overflow and ambiguous DST", () => {
  for (const x of [0, -1, 1.5, "6", 10001, Infinity])
    assert.throws(() => needQuantity(x));
  assert.throws(() =>
    needDeadline("2027-02-31T12:00", "UTC", new Date("2026-09-17"))
  );
  assert.throws(() =>
    needDeadline("2026-11-01T01:30", "America/Chicago", new Date("2026-09-17"))
  );
  assert.throws(() =>
    parseNeedSlot(
      1,
      { ...slotFields(), action: "VOLUNTEER" },
      new Date(deadline())
    )
  );
});
test("six and four claims reserve exactly ten; partial receipt and repeated cancellation never invent completion", async () => {
  const f = await setup();
  const [six, four] = await Promise.all([claim(f, f.a, 6), claim(f, f.b, 4)]);
  assert.equal((await view(f)).slots[0].committed, 10);
  assert.equal((await view(f)).slots[0].received, 0);
  assert.deepEqual(await command(db, f.a.token, six.body), six.receipt);
  await denied(command(db, f.a.token, { ...six.body, quantity: 7 }), 409);
  const received = await command(
    db,
    f.manager.token,
    input("receive", {
      id: six.receipt.id,
      expectedVersion: 1,
      quantity: 5,
      reason: ""
    })
  );
  const cancelBody = input("withdraw", {
    id: four.receipt.id,
    expectedVersion: 1
  });
  const canceled = await command(db, f.b.token, cancelBody);
  assert.deepEqual(await command(db, f.b.token, cancelBody), canceled);
  const progress = (await view(f)).slots[0];
  assert.equal(progress.committed, 6);
  assert.equal(progress.received, 5);
  await denied(
    command(
      db,
      f.manager.token,
      input("receive", {
        id: six.receipt.id,
        expectedVersion: received.version,
        quantity: 7,
        reason: ""
      })
    ),
    409
  );
  await denied(
    command(
      db,
      f.manager.token,
      input("receive", {
        id: six.receipt.id,
        expectedVersion: received.version,
        quantity: 4,
        reason: ""
      })
    ),
    400
  );
  await command(
    db,
    f.manager.token,
    input("receive", {
      id: six.receipt.id,
      expectedVersion: received.version,
      quantity: 4,
      reason: "Corrected one accidentally counted parcel."
    })
  );
  assert.equal((await view(f)).slots[0].received, 4);
});
test("simultaneous oversized claims cannot overbook and a full-slot waitlist never auto-promotes", async () => {
  const f = await setup();
  const results = await Promise.allSettled([
    claim(f, f.a, 6),
    claim(f, f.b, 6)
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  const winnerIndex = results[0].status === "fulfilled" ? 0 : 1;
  const loser = winnerIndex ? f.a : f.b;
  await claim(f, loser, 4);
  const c = await createPortalActor(db, "needwait");
  const wait = await claim(f, c, 3, { waitlist: true });
  assert.equal(wait.receipt.version, 1);
  const winner = results[winnerIndex];
  assert.equal(winner.status, "fulfilled");
  if (winner.status === "fulfilled")
    await command(
      db,
      winnerIndex ? f.b.token : f.a.token,
      input("withdraw", { id: winner.value.receipt.id, expectedVersion: 1 })
    );
  assert.equal((await view(f)).slots[0].committed, 4);
  assert.equal(
    (
      await db.exchangeNeedContribution.findUniqueOrThrow({
        where: { id: wait.receipt.id }
      })
    ).state,
    "WAITLISTED"
  );
});
test("paid quotes reserve only on explicit coordinator acceptance and remain private", async () => {
  const f = await setup("SELL");
  const offer = await claim(f, f.a, 6, { price: "12.50", currency: "USD" });
  const second = await claim(f, f.b, 6, { price: "11.25", currency: "USD" });
  assert.equal((await view(f)).slots[0].committed, 0);
  await denied(
    command(
      db,
      f.b.token,
      input("accept", { id: offer.receipt.id, expectedVersion: 1 })
    ),
    404
  );
  await command(
    db,
    f.manager.token,
    input("accept", { id: offer.receipt.id, expectedVersion: 1 })
  );
  await denied(
    command(
      db,
      f.manager.token,
      input("accept", { id: second.receipt.id, expectedVersion: 1 })
    ),
    409
  );
  const publicText = JSON.stringify(await view(f));
  assert.ok(!publicText.includes("1250"));
  assert.ok(!publicText.includes("Fictional private"));
  assert.ok(!publicText.includes(f.a.id));
  assert.equal((await view(f)).slots[0].received, 0);
});
test("equipment returns survive receipt, cancellation and partial closing", async () => {
  const f = await setup("DONATE", true);
  const promise = await claim(f, f.a, 6);
  const receipt = await command(
    db,
    f.manager.token,
    input("receive", {
      id: promise.receipt.id,
      expectedVersion: 1,
      quantity: 5,
      reason: ""
    })
  );
  await command(
    db,
    f.a.token,
    input("withdraw", {
      id: promise.receipt.id,
      expectedVersion: receipt.version
    })
  );
  let row = await db.exchangeNeedContribution.findUniqueOrThrow({
    where: { id: promise.receipt.id }
  });
  assert.equal(row.received, 5);
  assert.equal(row.returned, 0);
  assert.ok(row.loanReturnAt);
  await command(
    db,
    f.manager.token,
    input("return-loan", {
      id: row.id,
      expectedVersion: row.version,
      quantity: 3,
      reason: ""
    })
  );
  const slot = await db.exchangeNeedSlot.findUniqueOrThrow({
    where: { id: f.slotId }
  });
  await command(
    db,
    f.manager.token,
    input("close-slot", {
      needId: f.needId,
      slotId: slot.id,
      expectedVersion: slot.version,
      reason: "Closing with five of ten parcels received."
    })
  );
  const result = (await view(f)).slots[0];
  assert.equal(result.status, "Closed partly fulfilled");
  assert.equal(result.returned, 3);
  assert.equal(result.received, 5);
  row = await db.exchangeNeedContribution.findUniqueOrThrow({
    where: { id: promise.receipt.id }
  });
  await denied(
    command(
      db,
      f.manager.token,
      input("return-loan", {
        id: row.id,
        expectedVersion: row.version,
        quantity: 6,
        reason: ""
      })
    ),
    409
  );
});
test("bilateral block ends capacity and old private access without revival after unblock", async () => {
  const f = await setup();
  const promise = await claim(f, f.a, 6, { shareName: true });
  await relationshipCommand(
    db,
    f.a.token,
    input("block", {
      kind: "person",
      targetId: f.manager.id,
      expectedVersion: 0,
      desired: true
    })
  );
  const revoked = await db.exchangeNeedContribution.findUniqueOrThrow({
    where: { id: promise.receipt.id }
  });
  assert.equal(revoked.state, "REVOKED");
  assert.equal(revoked.authorityKey, null);
  assert.equal((await view(f)).slots[0].committed, 0);
  const relation = await db.socialRelationship.findUniqueOrThrow({
    where: {
      ownerId_targetUserId: { ownerId: f.a.id, targetUserId: f.manager.id }
    }
  });
  await relationshipCommand(
    db,
    f.a.token,
    input("block", {
      kind: "person",
      targetId: f.manager.id,
      expectedVersion: relation.version,
      desired: false
    })
  );
  const own = await read(db, f.a.token, {
    view: "contribution",
    id: revoked.id
  });
  assert.ok("contributions" in own);
  assert.equal(own.contributions?.[0]?.current, false);
  assert.equal(own.contributions?.[0]?.note, "");
  const managed = await read(db, f.manager.token, {
    view: "contributors",
    id: f.needId
  });
  assert.ok("contributions" in managed);
  assert.equal(managed.contributions?.length, 0);
});
test("a new church duty epoch cannot read or accept the former coordinator's entries", async () => {
  const f = await setup("SELL");
  const promise = await claim(f, f.a, 6, { price: "2.00", currency: "USD" });
  await db.churchCapabilityGrant.update({
    where: { id: f.grant.id },
    data: { version: { increment: 1 }, revokedAt: new Date() }
  });
  await denied(
    command(
      db,
      f.manager.token,
      input("accept", { id: promise.receipt.id, expectedVersion: 1 })
    ),
    404
  );
  await db.churchCapabilityGrant.update({
    where: { id: f.grant.id },
    data: { version: { increment: 1 }, revokedAt: null }
  });
  await denied(
    command(
      db,
      f.manager.token,
      input("accept", { id: promise.receipt.id, expectedVersion: 1 })
    ),
    404
  );
  const own = await read(db, f.a.token, {
    view: "contribution",
    id: promise.receipt.id
  });
  assert.ok("contributions" in own);
  assert.equal(own.contributions?.[0]?.current, false);
});
test("repeat keeps only reusable structure and publication requires fresh coordinator and deadline", async () => {
  const f = await setup("DONATE", true);
  await claim(f, f.a, 3);
  const listing = await db.exchangeListing.findUniqueOrThrow({
    where: { id: f.listing.id }
  });
  const copy = await exchangeListingCommand(
    db,
    f.manager.token,
    input("duplicate", {
      listingId: listing.id,
      expectedVersion: listing.version
    })
  );
  const repeated = await db.exchangeNeed.findUniqueOrThrow({
    where: { listingId: copy.id },
    include: { slots: true, contributions: true }
  });
  assert.equal(repeated.coordinatorId, null);
  assert.equal(repeated.deadlineAt, null);
  assert.equal(repeated.contributions.length, 0);
  assert.equal(repeated.slots.length, 1);
  assert.equal(repeated.slots[0].target, 10);
  assert.equal(repeated.slots[0].returnAt, null);
  await denied(
    exchangeListingCommand(
      db,
      f.manager.token,
      input("status", {
        listingId: copy.id,
        expectedVersion: copy.version,
        state: "ACTIVE",
        itemPolicy: EXCHANGE_ITEM_POLICY,
        itemConfirmed: true
      })
    ),
    409
  );
});
test("current contributions receive durable deduplicated updates; late contributors do not receive old notices", async () => {
  const f = await setup();
  await claim(f, f.a, 2);
  const need = await db.exchangeNeed.findUniqueOrThrow({
    where: { id: f.needId }
  });
  await command(
    db,
    f.manager.token,
    input("update", {
      needId: need.id,
      expectedVersion: need.version,
      text: "Fictional organizer update."
    })
  );
  const update = await db.exchangeNeedEvent.findFirstOrThrow({
    where: { needId: need.id, action: "UPDATE" }
  });
  await claim(f, f.b, 2);
  const job = await db.notificationFanoutJob.findFirstOrThrow({
    where: { kind: "NEED_UPDATE", sourceId: update.id }
  });
  for (let i = 0; i < 3; i++)
    await consumeNotificationWork(
      db,
      NOTIFICATION_WORK_TOPIC,
      notificationFanoutMessage(job.id)
    );
  const events = await db.socialEvent.findMany({
    where: { kind: "NEED_UPDATE", sourceId: update.id }
  });
  assert.equal(events.length, 1);
  assert.equal(events[0].recipientId, f.a.id);
  const sources = await db.$transaction((tx) =>
    notificationSources(tx, events, false)
  );
  assert.equal(sources.size, 1);
  assert.equal(notificationPushAllowed(null, "needs", new Date()), false);
  await relationshipCommand(
    db,
    f.a.token,
    input("block", {
      kind: "person",
      targetId: f.manager.id,
      expectedVersion: 0,
      desired: true
    })
  );
  assert.equal(
    (await db.$transaction((tx) => notificationSources(tx, events, true))).size,
    0
  );
});
test("Needs alerts require dated phone consent and older settings forms preserve the new choice", async () => {
  const actor = await createPortalActor(db, "needprefs");
  const raw = await db.socialPreferences.create({
    data: {
      ownerId: actor.id,
      pushCategories: ["needs"],
      notificationPushSince: {
        needs: new Date(Date.now() - 5000).toISOString()
      }
    }
  });
  assert.equal(
    notificationPushAllowed(
      { ...raw, notificationPushSince: null },
      "needs",
      new Date()
    ),
    false
  );
  const old = projectNotificationPreferences(raw);
  const inApp = Object.fromEntries(
    Object.entries(old.inApp).filter(([k]) => k !== "needs")
  );
  await notificationPreferenceCommand(
    db,
    actor.token,
    input("preferences", {
      ownerId: actor.id,
      expectedVersion: old.version,
      inApp,
      pushCategories: [],
      quietHours: null
    })
  );
  const saved = await db.socialPreferences.findUniqueOrThrow({
    where: { ownerId: actor.id }
  });
  assert.ok(saved.pushCategories.includes("needs"));
  assert.equal(notificationPushAllowed(saved, "needs", new Date()), true);
});
test("deadlines stop new claims synchronously and record one queue-backed notice without deleting promises", async () => {
  const f = await setup();
  await claim(f, f.a, 6);
  await db.exchangeNeed.update({
    where: { id: f.needId },
    data: { deadlineAt: new Date(Date.now() - 1000) }
  });
  await denied(claim(f, f.b, 4), 409);
  await advanceNeedDeadlines(db);
  await advanceNeedDeadlines(db);
  assert.equal(
    await db.exchangeNeedEvent.count({
      where: { needId: f.needId, action: "DEADLINE_REACHED" }
    }),
    1
  );
  assert.equal((await view(f)).slots[0].committed, 6);
  const notice = await db.exchangeNeedEvent.findFirstOrThrow({
    where: { needId: f.needId, action: "DEADLINE_REACHED" }
  });
  const job = await db.notificationFanoutJob.findFirstOrThrow({
    where: { sourceId: notice.id, kind: "NEED_UPDATE" }
  });
  await processNotificationFanoutBatch(db, job.id);
  assert.equal(
    await db.socialEvent.count({
      where: { kind: "NEED_UPDATE", sourceId: notice.id, recipientId: f.a.id }
    }),
    1
  );
});
test("opaque recovery quarantines an older contribution restore and cannot replay the original claim", async () => {
  const f = await setup();
  const promised = await claim(f, f.a, 6);
  const oldNeed = await db.exchangeNeed.findUniqueOrThrow({
    where: { id: f.needId }
  });
  await command(
    db,
    f.a.token,
    input("withdraw", { id: promised.receipt.id, expectedVersion: 1 })
  );
  const control = await db.retentionControl.findFirstOrThrow({
    where: { kind: "EXCHANGE_NEED", sourceId: f.needId },
    orderBy: { version: "desc" }
  });
  assert.ok(!JSON.stringify(control.payload).includes("Fictional private"));
  await db.exchangeNeed.update({
    where: { id: f.needId },
    data: { version: oldNeed.version }
  });
  await db.exchangeNeedContribution.update({
    where: { id: promised.receipt.id },
    data: { version: 1, state: "COMMITTED", endedAt: null }
  });
  await replayRetentionControls(db, [
    control.payload as unknown as RetentionControlEntry
  ]);
  assert.equal(
    (await db.exchangeNeed.findUniqueOrThrow({ where: { id: f.needId } }))
      .recoveryRequired,
    true
  );
  await denied(view(f), 404);
  await denied(command(db, f.a.token, promised.body), 404);
});
test("a report previews exactly one selected private contribution and excludes another contributor", async () => {
  const f = await setup();
  const first = await claim(f, f.a, 2),
    second = await claim(f, f.b, 2, { note: "Different secret contribution" });
  const preview = await readCommunityReports(db, f.a.token, {
    view: "target",
    targetType: "NEED_CONTRIBUTION",
    targetId: first.receipt.id
  });
  assert.ok(
    "target" in preview &&
      preview.target?.evidencePreview?.includes(
        "Fictional private contribution"
      )
  );
  await denied(
    readCommunityReports(db, f.a.token, {
      view: "target",
      targetType: "NEED_CONTRIBUTION",
      targetId: second.receipt.id
    }),
    404
  );
  const report = await communityReportCommand(
    db,
    f.a.token,
    input("create", {
      targetType: "NEED_CONTRIBUTION",
      targetId: first.receipt.id,
      expectedTargetVersion: 1,
      expectedContextVersion: 0,
      reason: "OTHER",
      details: "Fictional selected contribution concern"
    })
  );
  const review = await readCommunityReports(db, reviewer.token, {
    view: "review",
    id: report.id
  });
  assert.ok(
    "evidence" in review &&
      review.evidence?.content?.includes("Fictional private contribution")
  );
  assert.ok(!JSON.stringify(review).includes("Different secret contribution"));
});
test("HTTP commands require the exact current account pin and same-origin request", async () => {
  const f = await setup();
  const need = await db.exchangeNeed.findUniqueOrThrow({
    where: { id: f.needId }
  });
  const body = input("need-update", {
    needId: need.id,
    expectedVersion: need.version,
    text: "Fictional pinned update."
  });
  const request = (owner: string, origin = accountConfig().origin) =>
    new Request(accountConfig().origin + "/api/platform/exchange", {
      method: "POST",
      headers: {
        cookie: `${SESSION_COOKIE}=${f.manager.token}`,
        "content-type": "application/json",
        origin,
        "x-expected-account": owner
      },
      body: JSON.stringify(body)
    });
  assert.equal((await handleExchangeRequest(db, request(f.a.id))).status, 401);
  assert.equal(
    (
      await handleExchangeRequest(
        db,
        request(f.manager.id, "https://other.example.test")
      )
    ).status,
    403
  );
  assert.equal(
    (await handleExchangeRequest(db, request(f.manager.id))).status,
    200
  );
  assert.equal(
    (await handleExchangeRequest(db, request(f.manager.id))).status,
    200
  );
  assert.equal(
    await db.exchangeNeedEvent.count({
      where: { needId: need.id, action: "UPDATE" }
    }),
    1
  );
});

test("Needs and the canonical event role race for one capacity pool; receipts require both current duties", async () => {
  const f = await volunteerNeed();
  const need = await db.exchangeNeed.findUniqueOrThrow({
    where: { id: f.need.id }
  });
  const throughNeed = input("volunteer", {
    needId: need.id,
    slotId: f.needSlot.id,
    slotVersion: f.needSlot.version,
    expectedVersion: need.consentVersion,
    signupVersion: 0
  });
  const results = await Promise.allSettled([
    command(db, f.val.token, throughNeed),
    f.command(f.morgan, {
      operation: "volunteer",
      slotId: f.role.id,
      slotVersion: 1,
      expectedVersion: 0
    })
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(
    results.filter((r) => r.status === "rejected" && r.reason.status === 409)
      .length,
    1
  );
  assert.equal(
    await db.exchangeNeedContribution.count({ where: { needId: need.id } }),
    0,
    "No mirrored volunteer promises"
  );
  const signup = await db.postVolunteerSignup.findFirstOrThrow({
    where: { slotId: f.role.id, state: "ACTIVE" }
  });
  const before = await read(db, f.val.token, {
    view: "need",
    listingId: f.listing.id
  });
  assert.ok("need" in before && before.need);
  assert.equal(before.need.slots[0].committed, 1);
  assert.equal(before.need.slots[0].received, 0);
  const receipt = input("complete-volunteer", {
    needId: need.id,
    signupId: signup.id,
    expectedVersion: signup.version,
    completed: true,
    reason: ""
  });
  await denied(command(db, f.val.token, receipt), 404);
  await db.churchCapabilityGrant.update({
    where: {
      userId_churchId_capability: {
        churchId: f.churchA.id,
        userId: f.ada.id,
        capability: "MANAGE_CHURCH_VOLUNTEERS"
      }
    },
    data: { revokedAt: new Date(), version: { increment: 1 } }
  });
  await denied(command(db, f.ada.token, receipt), 403);
  await db.churchCapabilityGrant.update({
    where: {
      userId_churchId_capability: {
        churchId: f.churchA.id,
        userId: f.ada.id,
        capability: "MANAGE_CHURCH_VOLUNTEERS"
      }
    },
    data: { revokedAt: null, version: { increment: 1 } }
  });
  const saved = await command(db, f.ada.token, receipt);
  assert.deepEqual(await command(db, f.ada.token, receipt), saved);
  const finished = await read(db, f.val.token, {
    view: "need",
    listingId: f.listing.id
  });
  assert.ok("need" in finished && finished.need);
  assert.equal(finished.need.slots[0].received, 1);
  const winner = signup.userId === f.val.id ? f.val : f.morgan;
  await denied(
    f.command(winner, {
      operation: "cancel-volunteer",
      signupId: signup.id,
      expectedVersion: saved.version
    }),
    409
  );
  await denied(
    command(
      db,
      f.ada.token,
      input("complete-volunteer", {
        needId: need.id,
        signupId: signup.id,
        expectedVersion: saved.version,
        completed: false,
        reason: ""
      })
    ),
    400
  );
  await command(
    db,
    f.ada.token,
    input("complete-volunteer", {
      needId: need.id,
      signupId: signup.id,
      expectedVersion: saved.version,
      completed: false,
      reason: "Fictional correction: work has not finished."
    })
  );
  const corrected = await db.postVolunteerSignup.findUniqueOrThrow({
    where: { id: signup.id }
  });
  await f.command(winner, {
    operation: "cancel-volunteer",
    signupId: signup.id,
    expectedVersion: corrected.version
  });
  assert.equal(
    await db.postVolunteerSignup.count({
      where: { slotId: f.role.id, state: "ACTIVE" }
    }),
    0
  );
});

test("Need event projections follow rescheduling and cancellation, and unavailable roles cannot accept through either entry", async () => {
  const f = await volunteerNeed();
  const later = new Date(Date.now() + 9 * 86400000);
  await db.calendarOccurrence.update({
    where: { id: f.occurrence.id },
    data: { startAt: later, endAt: new Date(later.getTime() + 3600000) }
  });
  const changed = await read(db, f.val.token, {
    view: "need",
    listingId: f.listing.id
  });
  assert.ok("need" in changed && changed.need);
  assert.equal(
    changed.need.slots[0].volunteer?.event?.startAt,
    later.toISOString()
  );
  await db.calendarOccurrence.update({
    where: { id: f.occurrence.id },
    data: { canceledAt: new Date() }
  });
  const canceled = await read(db, f.val.token, {
    view: "need",
    listingId: f.listing.id
  });
  assert.ok("need" in canceled && canceled.need);
  assert.equal(canceled.need.slots[0].volunteer?.event?.canceled, true);
  assert.equal(canceled.need.slots[0].volunteer?.open, false);
  await denied(
    f.command(f.val, {
      operation: "volunteer",
      slotId: f.role.id,
      slotVersion: 1,
      expectedVersion: 0
    }),
    409
  );
  await denied(
    command(
      db,
      f.val.token,
      input("volunteer", {
        needId: f.need.id,
        slotId: f.needSlot.id,
        slotVersion: 1,
        expectedVersion: canceled.need.consentVersion,
        signupVersion: 0
      })
    ),
    409
  );
  await denied(
    read(db, f.blake.token, { view: "need", listingId: f.listing.id }),
    404
  );
});

test("account export isolates private contributions and erasure preserves only opaque fulfillment history", async () => {
  const f = await setup("DONATE", true);
  const mine = await claim(f, f.a, 6, {
    note: "Only Alice exports this fictional note",
    shareName: true
  });
  await claim(f, f.b, 4, {
    note: "Only Bob exports this other fictional note"
  });
  await command(
    db,
    f.manager.token,
    input("receive", {
      id: mine.receipt.id,
      expectedVersion: mine.receipt.version,
      quantity: 5,
      reason: ""
    })
  );
  const secret = process.env.AUTH_RATE_LIMIT_SECRET!;
  const auth = await prepareAccountExport(db, f.a.token, f.a.password, secret);
  const exported = JSON.stringify(
    await downloadAccountExport(db, f.a.token, auth.authorization, secret)
  );
  assert.ok(exported.includes("Only Alice exports this fictional note"));
  assert.equal(
    exported.includes("Only Bob exports this other fictional note"),
    false
  );
  const journal = { async recordAccount() {}, async completeAccount() {} };
  await requestPermanentAccountDeletion(
    db,
    f.a.token,
    f.a.password,
    true,
    createSessionToken(),
    journal
  );
  const deletion = await db.accountDeletion.findUniqueOrThrow({
    where: { userId: f.a.id }
  });
  await eraseRequestedAccountData(db, deletion.id, journal);
  const row = await db.exchangeNeedContribution.findUniqueOrThrow({
    where: { id: mine.receipt.id }
  });
  assert.equal(row.contributorId, null);
  assert.equal(row.shareName, false);
  assert.equal(row.note, "");
  assert.equal(row.disputeNote, "");
  assert.equal(row.loanResponsibility, "");
  assert.equal(row.authorityKey, null);
  assert.equal(row.received, 5);
  assert.equal(row.returned, 0);
  assert.ok(row.loanReturnAt);
  assert.equal(
    await db.exchangeNeedEvent.count({ where: { actorId: f.a.id } }),
    0
  );
  assert.equal((await view(f)).slots[0].received, 5);
});
