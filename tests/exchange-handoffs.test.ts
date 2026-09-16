import {
  communityReportCommand,
  readCommunityReports
} from "../lib/platform/community-reports";
import {
  inspectMessagingRetention,
  runMessagingRetention,
  DAY
} from "../lib/platform/messaging-retention";
import {
  prepareAccountExport,
  downloadAccountExport
} from "../lib/platform/account-export";
import { requestPermanentAccountDeletion } from "../lib/platform/account-deletion";
import { eraseRequestedAccountData } from "../lib/platform/account-erasure";
import { createSessionToken } from "../lib/platform/auth";
import {
  dispatchExchangeHandoffs,
  advanceExchangeHandoff
} from "../lib/platform/exchange-handoff-queue";
import { notificationSources } from "../lib/platform/notification-source";
import {
  notificationPreferenceCommand,
  notificationPushAllowed,
  projectNotificationPreferences
} from "../lib/platform/notification-preferences";
import { handleExchangeRequest } from "../lib/platform/exchange-boundary";
import { SESSION_COOKIE } from "../lib/platform/account-boundary";
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
import {
  exchangeHandoffCommand as command,
  readExchangeHandoffs as read
} from "../lib/platform/exchange-handoffs";
import {
  exchangeDefaultsCommand,
  readExchangeDefaults
} from "../lib/platform/exchange-defaults";
import { exchangeListingCommand } from "../lib/platform/exchange-listings";
import { adultContactCommand } from "../lib/platform/adult-contact";
import { relationshipCommand } from "../lib/platform/relationships";
import { PortalError } from "../lib/platform/portal-policy";
import { EXCHANGE_ITEM_POLICY } from "../lib/platform/exchange-options";
import {
  replayRetentionControls,
  type RetentionControlEntry
} from "../lib/platform/retention-controls";

const db = new PrismaClient();
let reviewer: PortalActor;
const prior = process.env.COMMUNITY_REPORTS_ENABLED;
before(async () => {
  await assertPortalTestDatabase(db);
  process.env.COMMUNITY_REPORTS_ENABLED = "true";
  reviewer = await createPortalActor(db, "handoffreview");
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
const denied = (promise: Promise<unknown>, status: number) =>
  assert.rejects(
    promise,
    (e: unknown) => e instanceof PortalError && e.status === status
  );
const plan = (pickupDetails = "Fictional private blue gate instructions") => {
  const start = new Date(Date.now() + 3 * 86400000);
  start.setUTCSeconds(0, 0);
  return {
    startLocal: start.toISOString().slice(0, 16),
    endLocal: new Date(start.getTime() + 3600000).toISOString().slice(0, 16),
    timeZone: "UTC",
    pickupDetails
  };
};
async function setup() {
  const owner = await createPortalActor(db, "handowner"),
    requester = await createPortalActor(db, "handrequest");
  await db.socialPreferences.create({
    data: { ownerId: owner.id, contactRequests: "EVERYONE" }
  });
  const listing = await db.exchangeListing.create({
    data: {
      ownerId: owner.id,
      creatorId: owner.id,
      state: "ACTIVE",
      title: "Fictional spare table",
      description: "An isolated handoff fixture",
      category: "FURNITURE",
      condition: "GOOD",
      country: "US",
      placeId: 4887398,
      placeLabel: "Chicago",
      itemPolicy: EXCHANGE_ITEM_POLICY,
      confirmedAt: new Date(),
      publishedAt: new Date()
    }
  });
  return { owner, requester, listing };
}
async function enable(owner: PortalActor, listingId: string) {
  const row = await db.exchangeListing.findUniqueOrThrow({
    where: { id: listingId }
  });
  await command(
    db,
    owner.token,
    input("contact", {
      listingId,
      expectedVersion: row.inquiryContactVersion,
      listingVersion: row.version,
      enabled: true
    })
  );
}
async function inquire(requester: PortalActor, listingId: string) {
  const target = (
    await read(db, requester.token, { view: "target", listingId })
  ).target!;
  const body = input("inquire", {
    id: randomUUID(),
    expectedVersion: 0,
    listingId,
    listingVersion: target.listingVersion,
    contactVersion: target.contactVersion,
    purpose: "Fictional purpose for this table"
  });
  return { body, receipt: await command(db, requester.token, body) };
}

test("entry needs separate listing and adult contact consent; neither another account nor a stale listing can send", async () => {
  const { owner, requester, listing } = await setup();
  assert.equal(
    (await read(db, requester.token, { view: "target", listingId: listing.id }))
      .target,
    null
  );
  await enable(owner, listing.id);
  const { body, receipt } = await inquire(requester, listing.id);
  assert.deepEqual(await command(db, requester.token, body), receipt);
  assert.equal(
    await db.exchangeInquiry.count({ where: { listingId: listing.id } }),
    1
  );
  assert.equal(
    await db.exchangeInquiryAudit.count({ where: { inquiryId: receipt.id } }),
    1
  );
  await denied(
    command(db, requester.token, { ...body, purpose: "Different purpose" }),
    409
  );
  await denied(
    command(db, requester.token, {
      ...body,
      id: randomUUID(),
      mutationId: randomUUID(),
      listingVersion: 1
    }),
    409
  );
  const stranger = await createPortalActor(db, "handstranger");
  await denied(
    read(db, stranger.token, { view: "detail", id: receipt.id }),
    404
  );
  await denied(
    command(
      db,
      stranger.token,
      input("select", {
        id: receipt.id,
        expectedVersion: 1,
        schema: 1,
        plan: plan()
      })
    ),
    404
  );
  const pending = await db.socialPreferences.findUniqueOrThrow({
    where: { ownerId: owner.id }
  });
  await adultContactCommand(
    db,
    owner.token,
    input("preferences", {
      expectedVersion: pending.version,
      audience: "NOBODY"
    })
  );
  assert.equal(
    (await db.exchangeInquiry.findUniqueOrThrow({ where: { id: receipt.id } }))
      .state,
    "REVOKED"
  );
  await denied(command(db, requester.token, body), 404);
  const after = await db.socialPreferences.findUniqueOrThrow({
    where: { ownerId: owner.id }
  });
  await adultContactCommand(
    db,
    owner.token,
    input("preferences", {
      expectedVersion: after.version,
      audience: "EVERYONE"
    })
  );
  assert.equal(
    (await read(db, requester.token, { view: "detail", id: receipt.id }))
      .inquiry?.state,
    "REVOKED"
  );
});

test("simultaneous selections claim only one hold; exact confirmation gates private text and stale plans cannot consent", async () => {
  const { owner, requester, listing } = await setup();
  await enable(owner, listing.id);
  const other = await createPortalActor(db, "handother");
  const a = await inquire(requester, listing.id),
    b = await inquire(other, listing.id);
  const results = await Promise.allSettled(
    [a, b].map((x) =>
      command(
        db,
        owner.token,
        input("select", {
          id: x.receipt.id,
          expectedVersion: 1,
          schema: 1,
          plan: plan()
        })
      )
    )
  );
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  const held = await db.exchangeInquiry.findFirstOrThrow({
    where: { listingId: listing.id, state: "SELECTED" }
  });
  const selected = held.requesterId === requester.id ? requester : other;
  assert.equal(
    (await read(db, selected.token, { view: "detail", id: held.id })).inquiry
      ?.pickupDetails,
    ""
  );
  const update = await command(
    db,
    owner.token,
    input("plan", {
      id: held.id,
      expectedVersion: held.version,
      schema: 1,
      plan: plan("Replacement private instructions")
    })
  );
  await denied(
    command(
      db,
      selected.token,
      input("confirm", {
        id: held.id,
        expectedVersion: update.version,
        planVersion: 1
      })
    ),
    409
  );
  const body = input("confirm", {
    id: held.id,
    expectedVersion: update.version,
    planVersion: 2
  });
  const confirmed = await command(db, selected.token, body);
  assert.deepEqual(await command(db, selected.token, body), confirmed);
  const view = (await read(db, selected.token, { view: "detail", id: held.id }))
    .inquiry!;
  assert.equal(view.state, "RESERVED");
  assert.equal(view.pickupDetails, "Replacement private instructions");
  await denied(
    command(
      db,
      owner.token,
      input("plan", {
        id: held.id,
        expectedVersion: confirmed.version,
        schema: 1,
        plan: plan()
      })
    ),
    409
  );
  const list = await db.exchangeListing.findUniqueOrThrow({
    where: { id: listing.id }
  });
  await denied(
    exchangeListingCommand(
      db,
      owner.token,
      input("status", {
        listingId: listing.id,
        expectedVersion: list.version,
        state: "ACTIVE",
        itemPolicy: EXCHANGE_ITEM_POLICY,
        itemConfirmed: true
      })
    ),
    409
  );
  const completeBody = input("complete", {
    id: held.id,
    expectedVersion: confirmed.version
  });
  const done = await command(db, selected.token, completeBody);
  assert.deepEqual(await command(db, selected.token, completeBody), done);
  assert.equal(
    (await db.exchangeListing.findUniqueOrThrow({ where: { id: listing.id } }))
      .state,
    "CLOSED"
  );
  assert.equal(
    (await db.exchangeInquiry.findUniqueOrThrow({ where: { id: held.id } }))
      .pickupDetails,
    ""
  );
  assert.equal(
    await db.exchangeInquiry.count({
      where: { listingId: listing.id, state: { in: ["SELECTED", "RESERVED"] } }
    }),
    0
  );
});

test("block then unblock irreversibly ends a confirmed handoff and removes operational pickup text", async () => {
  const { owner, requester, listing } = await setup();
  await enable(owner, listing.id);
  const { receipt } = await inquire(requester, listing.id);
  const selected = await command(
    db,
    owner.token,
    input("select", {
      id: receipt.id,
      expectedVersion: 1,
      schema: 1,
      plan: plan()
    })
  );
  await command(
    db,
    requester.token,
    input("confirm", {
      id: receipt.id,
      expectedVersion: selected.version,
      planVersion: 1
    })
  );
  const muted = await relationshipCommand(db, requester.token, input("mute", { kind: "person", targetId: owner.id, expectedVersion: 0, desired: true }));
  assert.equal((await read(db, requester.token, { view: "detail", id: receipt.id })).inquiry?.state, "RESERVED");
  assert.ok((await read(db, requester.token, { view: "detail", id: receipt.id })).inquiry?.pickupDetails);
  const blocked = await relationshipCommand(
    db,
    requester.token,
    input("block", {
      kind: "person",
      targetId: owner.id,
      expectedVersion: muted.version,
      desired: true
    })
  );
  const hidden = (
    await read(db, requester.token, { view: "detail", id: receipt.id })
  ).inquiry!;
  assert.equal(hidden.pickupDetails, "");
  assert.equal(hidden.listing, null);
  assert.equal(hidden.state, "REVOKED");
  await relationshipCommand(
    db,
    requester.token,
    input("block", {
      kind: "person",
      targetId: owner.id,
      expectedVersion: blocked.version,
      desired: false
    })
  );
  assert.equal(
    (await read(db, requester.token, { view: "detail", id: receipt.id }))
      .inquiry?.state,
    "REVOKED"
  );
  assert.equal(
    (await db.exchangeListing.findUniqueOrThrow({ where: { id: listing.id } }))
      .state,
    "CLOSED"
  );
});

test("deadline settlement survives a rejected stale command; canceled holds require explicit owner reopening", async () => {
  const { owner, requester, listing } = await setup();
  await enable(owner, listing.id);
  const { receipt } = await inquire(requester, listing.id);
  const selected = await command(
    db,
    owner.token,
    input("select", {
      id: receipt.id,
      expectedVersion: 1,
      schema: 1,
      plan: plan()
    })
  );
  await db.exchangeInquiry.update({
    where: { id: receipt.id },
    data: { expiresAt: new Date(Date.now() - 1000) }
  });
  assert.equal(
    (await read(db, requester.token, { view: "detail", id: receipt.id }))
      .inquiry?.state,
    "EXPIRED"
  );
  await denied(
    command(
      db,
      requester.token,
      input("confirm", {
        id: receipt.id,
        expectedVersion: selected.version,
        planVersion: 1
      })
    ),
    409
  );
  const ended = await db.exchangeInquiry.findUniqueOrThrow({
    where: { id: receipt.id }
  });
  assert.equal(ended.state, "EXPIRED");
  assert.equal(ended.pickupDetails, "");
  const closed = await db.exchangeListing.findUniqueOrThrow({
    where: { id: listing.id }
  });
  assert.equal(closed.state, "CLOSED");
  const reopen = await exchangeListingCommand(
    db,
    owner.token,
    input("status", {
      listingId: listing.id,
      expectedVersion: closed.version,
      state: "ACTIVE",
      itemPolicy: EXCHANGE_ITEM_POLICY,
      itemConfirmed: true
    })
  );
  assert.ok(reopen.version > closed.version);
  assert.equal(
    (await db.exchangeInquiry.findUniqueOrThrow({ where: { id: receipt.id } }))
      .state,
    "EXPIRED"
  );
  assert.equal(
    (await read(db, requester.token, { view: "target", listingId: listing.id }))
      .target,
    null
  );
  const clear = input("clear", {
    id: receipt.id,
    expectedVersion: ended.version
  });
  const cleared = await command(db, requester.token, clear);
  assert.deepEqual(await command(db, requester.token, clear), cleared);
  await denied(
    read(db, requester.token, { view: "detail", id: receipt.id }),
    404
  );
  assert.ok(
    (await read(db, owner.token, { view: "detail", id: receipt.id })).inquiry
  );
});

test("database independently rejects a second active inquiry and a second selected hold", async () => {
  const { owner, requester, listing } = await setup();
  await enable(owner, listing.id);
  const { receipt } = await inquire(requester, listing.id);
  const row = await db.exchangeInquiry.findUniqueOrThrow({
    where: { id: receipt.id }
  });
  await assert.rejects(
    db.exchangeInquiry.create({ data: { ...row, id: randomUUID() } }),
    /Unique constraint/
  );
  const chosen = await command(
    db,
    owner.token,
    input("select", { id: row.id, expectedVersion: 1, schema: 1, plan: plan() })
  );
  const held = await db.exchangeInquiry.findUniqueOrThrow({
    where: { id: chosen.id }
  });
  const other = await createPortalActor(db, "handconstraint");
  await assert.rejects(
    db.exchangeInquiry.create({
      data: { ...held, id: randomUUID(), requesterId: other.id }
    }),
    /Unique constraint/
  );
});

test("private defaults are owner-only, cannot seed pickup into public drafts, and restrictive recovery rejects old writes", async () => {
  const owner = await createPortalActor(db, "handdefaults"),
    other = await createPortalActor(db, "handdefaultother");
  const fields = {
    intent: "FREE",
    audience: "PUBLIC",
    audienceChurchId: null,
    country: "US",
    placeId: 4887398,
    pickupDetails: "Fictional reusable private door code"
  };
  const body = input("defaults-save", {
    expectedVersion: 0,
    schema: 1,
    fields
  });
  const saved = await exchangeDefaultsCommand(db, owner.token, body);
  assert.deepEqual(await exchangeDefaultsCommand(db, owner.token, body), saved);
  const view = await readExchangeDefaults(db, owner.token);
  assert.equal(view.fields.pickupDetails, fields.pickupDetails);
  assert.equal(JSON.stringify(view.draftFields).includes("door code"), false);
  assert.equal(
    (await readExchangeDefaults(db, other.token)).fields.pickupDetails,
    ""
  );
  const control = await db.retentionControl.findFirstOrThrow({
    where: { kind: "EXCHANGE_DEFAULTS", sourceId: owner.id }
  });
  await db.exchangeDefaults.delete({ where: { ownerId: owner.id } });
  await replayRetentionControls(db, [
    control.payload as unknown as RetentionControlEntry
  ]);
  const recovered = await readExchangeDefaults(db, owner.token);
  assert.equal(recovered.recoveryRequired, true);
  assert.equal(recovered.draftFields, null);
  assert.equal(recovered.fields.pickupDetails, "");
  await denied(
    exchangeDefaultsCommand(db, owner.token, {
      ...body,
      mutationId: randomUUID()
    }),
    409
  );
});

test("only deliberately selected agreed evidence survives cancellation; cleared history purges after its case closes", async () => {
  const { owner, requester, listing } = await setup();
  await enable(owner, listing.id);
  const { receipt } = await inquire(requester, listing.id);
  const selected = await command(
    db,
    owner.token,
    input("select", {
      id: receipt.id,
      expectedVersion: 1,
      schema: 1,
      plan: plan()
    })
  );
  await denied(
    readCommunityReports(db, requester.token, {
      view: "target",
      targetType: "EXCHANGE_HANDOFF",
      targetId: receipt.id
    }),
    404
  );
  const confirmed = await command(
    db,
    requester.token,
    input("confirm", {
      id: receipt.id,
      expectedVersion: selected.version,
      planVersion: 1
    })
  );
  const preview = await readCommunityReports(db, requester.token, {
    view: "target",
    targetType: "EXCHANGE_HANDOFF",
    targetId: receipt.id
  });
  assert.ok(
    "target" in preview &&
      preview.target?.evidencePreview?.includes("blue gate")
  );
  const reported = await communityReportCommand(
    db,
    requester.token,
    input("create", {
      targetType: "EXCHANGE_HANDOFF",
      targetId: receipt.id,
      expectedTargetVersion: confirmed.version,
      expectedContextVersion: 1,
      reason: "PRIVACY",
      details: "Fictional selected pickup privacy concern"
    })
  );
  const canceled = await command(
    db,
    requester.token,
    input("cancel", {
      id: receipt.id,
      expectedVersion: confirmed.version,
      reason: "CHANGED_PLANS",
      note: "A separate private explanation"
    })
  );
  assert.equal(
    (await read(db, owner.token, { view: "detail", id: receipt.id })).inquiry
      ?.pickupDetails,
    ""
  );
  const evidence = await readCommunityReports(db, reviewer.token, {
    view: "review",
    id: reported.id
  });
  assert.ok(
    "evidence" in evidence && evidence.evidence?.content?.includes("blue gate")
  );
  assert.ok(
    "evidence" in evidence &&
      !evidence.evidence?.content?.includes("separate private explanation")
  );
  const first = await command(
    db,
    owner.token,
    input("clear", { id: receipt.id, expectedVersion: canceled.version })
  );
  await command(
    db,
    requester.token,
    input("clear", { id: receipt.id, expectedVersion: first.version })
  );
  assert.equal(
    (await inspectMessagingRetention(db)).candidates.some(
      (c) => c.id === receipt.id
    ),
    false
  );
  await communityReportCommand(
    db,
    reviewer.token,
    input("resolve", {
      id: reported.id,
      expectedVersion: reported.version,
      resolution: "CLOSED",
      decisionReason: "Fictional review complete"
    })
  );
  const future = new Date(Date.now() + 179 * DAY);
  const reports = (
    await inspectMessagingRetention(db, future)
  ).candidates.filter((c) => c.id === reported.id);
  assert.equal(reports.length, 1);
  await runMessagingRetention(
    db,
    reports,
    { async record() {}, async complete() {} },
    future
  );
  assert.equal(
    (await db.exchangeInquiry.findUniqueOrThrow({ where: { id: receipt.id } }))
      .pickupDetails,
    ""
  );
  const candidates = (
    await inspectMessagingRetention(db, future)
  ).candidates.filter((c) => c.id === receipt.id);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].target, "EXCHANGE_INQUIRY");
  const journal = { async record() {}, async complete() {} };
  await runMessagingRetention(db, candidates, journal, future);
  const purged = await db.exchangeInquiry.findUniqueOrThrow({
    where: { id: receipt.id }
  });
  assert.equal(purged.purpose, "");
  assert.equal(purged.cancelNote, "");
  assert.ok(purged.bodyPurgedAt);
  assert.ok(
    await db.retentionPurge.findUnique({
      where: {
        target_targetId: { target: "EXCHANGE_INQUIRY", targetId: receipt.id }
      }
    })
  );
});

test("missing and older inquiry recovery quarantine consent and cannot resurrect a private plan or held availability", async () => {
  const { owner, requester, listing } = await setup();
  await enable(owner, listing.id);
  const { receipt } = await inquire(requester, listing.id);
  const original = await db.exchangeInquiry.findUniqueOrThrow({
    where: { id: receipt.id }
  });
  const selected = await command(
    db,
    owner.token,
    input("select", {
      id: receipt.id,
      expectedVersion: 1,
      schema: 1,
      plan: plan()
    })
  );
  const confirmed = await command(
    db,
    requester.token,
    input("confirm", {
      id: receipt.id,
      expectedVersion: selected.version,
      planVersion: 1
    })
  );
  const canceled = await command(
    db,
    requester.token,
    input("cancel", {
      id: receipt.id,
      expectedVersion: confirmed.version,
      reason: "CHANGED_PLANS",
      note: ""
    })
  );
  const control = await db.retentionControl.findFirstOrThrow({
    where: {
      kind: "EXCHANGE_INQUIRY",
      sourceId: receipt.id,
      version: canceled.version
    }
  });
  await db.exchangeInquiry.update({
    where: { id: receipt.id },
    data: original
  });
  await db.exchangeListing.update({
    where: { id: listing.id },
    data: { state: "ACTIVE" }
  });
  await replayRetentionControls(db, [
    control.payload as unknown as RetentionControlEntry
  ]);
  const quarantine = await db.exchangeInquiry.findUniqueOrThrow({
    where: { id: receipt.id }
  });
  assert.equal(quarantine.recoveryRequired, true);
  assert.equal(quarantine.purpose, "");
  assert.equal(quarantine.state, "REVOKED");
  assert.equal(
    (await db.exchangeListing.findUniqueOrThrow({ where: { id: listing.id } }))
      .state,
    "DRAFT"
  );
  await db.exchangeInquiry.delete({ where: { id: receipt.id } });
  await replayRetentionControls(db, [
    control.payload as unknown as RetentionControlEntry
  ]);
  const tombstone = await db.exchangeInquiry.findUniqueOrThrow({
    where: { id: receipt.id }
  });
  assert.equal(tombstone.requesterId, null);
  assert.equal(tombstone.listingId, null);
  assert.equal(tombstone.version, canceled.version);
  await denied(
    read(db, requester.token, { view: "detail", id: receipt.id }),
    404
  );
});

test("a church receiver is a named adult; other managers cannot see the inquiry and reappointment never revives consent", async () => {
  const owner = await createPortalActor(db, "handchurchowner"),
    manager = await createPortalActor(db, "handchurchmanager"),
    requester = await createPortalActor(db, "handchurchrequest");
  const church = await db.church.create({
    data: {
      slug: "handoff-" + randomUUID(),
      name: "Fictional handoff church",
      summary: "Isolated fixture",
      communityListed: true
    }
  });
  await db.churchConnection.createMany({
    data: [owner, manager].map((a) => ({
      userId: a.id,
      churchId: church.id,
      state: "APPROVED"
    }))
  });
  await db.socialPreferences.createMany({
    data: [owner, manager].map((a) => ({
      ownerId: a.id,
      contactRequests: "EVERYONE"
    }))
  });
  const grant = await db.churchCapabilityGrant.create({
    data: {
      userId: owner.id,
      churchId: church.id,
      capability: "MANAGE_EXCHANGE_LISTINGS"
    }
  });
  await db.churchCapabilityGrant.create({
    data: {
      userId: manager.id,
      churchId: church.id,
      capability: "MANAGE_EXCHANGE_LISTINGS"
    }
  });
  const listing = await db.exchangeListing.create({
    data: {
      ownerChurchId: church.id,
      creatorId: owner.id,
      state: "ACTIVE",
      title: "Fictional church table",
      description: "Isolated church-owned item",
      category: "FURNITURE",
      condition: "GOOD",
      country: "US",
      placeId: 4887398,
      placeLabel: "Chicago",
      itemPolicy: EXCHANGE_ITEM_POLICY,
      confirmedAt: new Date(),
      publishedAt: new Date()
    }
  });
  await enable(owner, listing.id);
  const { receipt } = await inquire(requester, listing.id);
  await denied(
    read(db, manager.token, { view: "detail", id: receipt.id }),
    404
  );
  assert.equal(
    (await read(db, manager.token, { view: "incoming" })).inquiries?.length,
    0
  );
  await db.churchCapabilityGrant.update({
    where: { id: grant.id },
    data: { revokedAt: new Date(), version: { increment: 1 } }
  });
  assert.equal(
    (await read(db, requester.token, { view: "target", listingId: listing.id }))
      .target,
    null
  );
  await db.churchCapabilityGrant.update({
    where: { id: grant.id },
    data: { revokedAt: null, version: { increment: 1 } }
  });
  assert.equal(
    (await read(db, requester.token, { view: "detail", id: receipt.id }))
      .inquiry?.available,
    false
  );
  await enable(manager, listing.id);
  assert.equal(
    (await db.exchangeInquiry.findUniqueOrThrow({ where: { id: receipt.id } }))
      .state,
    "REVOKED"
  );
  await denied(
    read(db, manager.token, { view: "detail", id: receipt.id }),
    404
  );
  assert.equal(
    (await read(db, requester.token, { view: "target", listingId: listing.id }))
      .target?.receiver.id,
    manager.id
  );
});

test("account export rechecks pickup agreement and permanent deletion deidentifies retained history and deletes private defaults", async () => {
  const { owner, requester, listing } = await setup();
  await enable(owner, listing.id);
  const { receipt } = await inquire(requester, listing.id);
  const selected = await command(
    db,
    owner.token,
    input("select", {
      id: receipt.id,
      expectedVersion: 1,
      schema: 1,
      plan: plan()
    })
  );
  const secret = process.env.AUTH_RATE_LIMIT_SECRET!;
  async function exported() {
    const auth = await prepareAccountExport(
      db,
      requester.token,
      requester.password,
      secret
    );
    return JSON.stringify(
      await downloadAccountExport(
        db,
        requester.token,
        auth.authorization,
        secret
      )
    );
  }
  assert.equal((await exported()).includes("blue gate"), false);
  await command(
    db,
    requester.token,
    input("confirm", {
      id: receipt.id,
      expectedVersion: selected.version,
      planVersion: 1
    })
  );
  assert.equal((await exported()).includes("blue gate"), true);
  await exchangeDefaultsCommand(
    db,
    requester.token,
    input("defaults-save", {
      expectedVersion: 0,
      schema: 1,
      fields: {
        intent: "FREE",
        audience: "PUBLIC",
        audienceChurchId: null,
        country: null,
        placeId: null,
        pickupDetails: "A reusable private address"
      }
    })
  );
  const journal = { async recordAccount() {}, async completeAccount() {} };
  await requestPermanentAccountDeletion(
    db,
    requester.token,
    requester.password,
    true,
    createSessionToken(),
    journal
  );
  assert.equal(
    (await db.exchangeInquiry.findUniqueOrThrow({ where: { id: receipt.id } }))
      .state,
    "REVOKED"
  );
  const deletion = await db.accountDeletion.findUniqueOrThrow({
    where: { userId: requester.id }
  });
  await eraseRequestedAccountData(db, deletion.id, journal);
  const row = await db.exchangeInquiry.findUniqueOrThrow({
    where: { id: receipt.id }
  });
  assert.equal(row.requesterId, null);
  assert.equal(row.pickupDetails, "");
  assert.equal(
    await db.exchangeDefaults.count({ where: { ownerId: requester.id } }),
    0
  );
  assert.equal(
    await db.exchangeInquiryAudit.count({ where: { actorId: requester.id } }),
    0
  );
  assert.equal(
    (await read(db, owner.token, { view: "detail", id: receipt.id })).inquiry
      ?.person,
    null
  );
});

test("queue failures preserve the plan, retries create one reminder per participant and stale work cannot remind after cancellation", async () => {
  const { owner, requester, listing } = await setup();
  await enable(owner, listing.id);
  const { receipt } = await inquire(requester, listing.id);
  const selected = await command(
    db,
    owner.token,
    input("select", {
      id: receipt.id,
      expectedVersion: 1,
      schema: 1,
      plan: plan()
    })
  );
  const confirmed = await command(
    db,
    requester.token,
    input("confirm", {
      id: receipt.id,
      expectedVersion: selected.version,
      planVersion: 1
    })
  );
  const row = await db.exchangeInquiry.findUniqueOrThrow({
    where: { id: receipt.id }
  });
  const failed = await dispatchExchangeHandoffs(db, row.id, async () => {
    throw Error("Fictional queue outage");
  });
  assert.deepEqual(failed, { queued: 0, failed: 1 });
  const preserved = await db.exchangeInquiry.findUniqueOrThrow({
    where: { id: row.id }
  });
  assert.equal(preserved.version, row.version);
  assert.equal(preserved.state, "RESERVED");
  assert.equal(preserved.dispatchedAt, null);
  assert.ok(preserved.lastDispatchErrorAt);
  const sent: unknown[] = [];
  assert.deepEqual(
    await dispatchExchangeHandoffs(db, row.id, async (value, seconds) => {
      sent.push({ value, seconds });
    }),
    { queued: 1, failed: 0 }
  );
  assert.equal(sent.length, 1);
  assert.equal(JSON.stringify(sent).includes("blue gate"), false);
  assert.equal(
    (
      await advanceExchangeHandoff(
        db,
        row.id,
        row.version,
        row.wakeAt!,
        async () => ({ failed: 1 })
      )
    ).failed,
    1
  );
  assert.equal(
    (
      await advanceExchangeHandoff(
        db,
        row.id,
        row.version,
        row.wakeAt!,
        async () => ({ failed: 0 })
      )
    ).failed,
    0
  );
  const reminders = await db.socialEvent.findMany({
    where: { sourceId: row.id, kind: "EXCHANGE_REMINDER" }
  });
  assert.equal(reminders.length, 2);
  assert.deepEqual(
    new Set(reminders.map((r) => r.recipientId)),
    new Set([owner.id, requester.id])
  );
  const event = reminders.find((r) => r.recipientId === requester.id)!;
  const sources = await db.$transaction((tx) =>
    notificationSources(tx, [event], false, row.wakeAt!)
  );
  assert.equal(sources.get(event.id)?.category, "handoffs");
  assert.equal(
    JSON.stringify([...sources.values()]).includes("blue gate"),
    false
  );
  assert.equal(
    (
      await db.$transaction((tx) =>
        notificationSources(tx, [event], "EMAIL", row.wakeAt!)
      )
    ).size,
    0
  );
  await command(
    db,
    requester.token,
    input("cancel", {
      id: row.id,
      expectedVersion: confirmed.version,
      reason: "CHANGED_PLANS",
      note: ""
    })
  );
  await advanceExchangeHandoff(
    db,
    row.id,
    row.version,
    row.wakeAt!,
    async () => ({ failed: 0 })
  );
  assert.equal(
    await db.socialEvent.count({
      where: { sourceId: row.id, kind: "EXCHANGE_REMINDER" }
    }),
    2
  );
  assert.equal(
    (
      await db.$transaction((tx) =>
        notificationSources(tx, [event], false, row.wakeAt!)
      )
    ).size,
    0
  );
});

test("handoff phone consent is separate and dated; an old preferences form preserves newer choices", async () => {
  const owner = await createPortalActor(db, "handphonechoice");
  let row = await db.socialPreferences.create({
    data: { ownerId: owner.id, pushCategories: ["exchange"] }
  });
  assert.equal(notificationPushAllowed(row, "handoffs", new Date()), false);
  row = await db.socialPreferences.update({
    where: { ownerId: owner.id },
    data: { pushCategories: ["handoffs"] }
  });
  assert.equal(notificationPushAllowed(row, "handoffs", new Date()), false);
  const since = new Date(Date.now() - 2000);
  row = await db.socialPreferences.update({
    where: { ownerId: owner.id },
    data: { notificationPushSince: { handoffs: since.toISOString() } }
  });
  assert.equal(
    notificationPushAllowed(row, "handoffs", new Date(since.getTime() - 1)),
    false
  );
  assert.equal(notificationPushAllowed(row, "handoffs", new Date()), true);
  const { handoffs: unused, ...oldChoices } =
    projectNotificationPreferences(row).inApp;
  void unused;
  await notificationPreferenceCommand(
    db,
    owner.token,
    input("preferences", {
      ownerId: owner.id,
      expectedVersion: row.version,
      inApp: oldChoices,
      pushCategories: [],
      quietHours: null,
      feedbackEmail: false
    })
  );
  row = await db.socialPreferences.findUniqueOrThrow({
    where: { ownerId: owner.id }
  });
  assert.ok(row.pushCategories.includes("handoffs"));
  assert.equal(notificationPushAllowed(row, "handoffs", new Date()), true);
});

test("handoff HTTP boundary rejects cross-site writes, switched accounts and guessed identifiers with private cache headers", async () => {
  const { owner, requester, listing } = await setup();
  await enable(owner, listing.id);
  const { receipt } = await inquire(requester, listing.id);
  const origin = process.env.ACCOUNT_ORIGIN!;
  const headers = {
    cookie: `${SESSION_COOKIE}=${requester.token}`,
    origin,
    "content-type": "application/json",
    "x-expected-account": requester.id
  };
  const response = await handleExchangeRequest(
    db,
    new Request(
      `${origin}/api/platform/exchange?view=handoff-detail&id=${receipt.id}`,
      { headers }
    )
  );
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control")!, /no-store/);
  const switchResult = await handleExchangeRequest(
    db,
    new Request(
      `${origin}/api/platform/exchange?view=handoff-detail&id=${receipt.id}`,
      { headers: { ...headers, "x-expected-account": owner.id } }
    )
  );
  assert.equal(switchResult.status, 401);
  const guessed = await handleExchangeRequest(
    db,
    new Request(
      `${origin}/api/platform/exchange?view=handoff-detail&id=unknown-inquiry`,
      { headers }
    )
  );
  assert.equal(guessed.status, 404);
  const crossSite = await handleExchangeRequest(
    db,
    new Request(`${origin}/api/platform/exchange`, {
      method: "POST",
      headers: { ...headers, origin: "https://other.example.test" },
      body: JSON.stringify(
        input("handoff-withdraw", { id: receipt.id, expectedVersion: 1 })
      )
    })
  );
  assert.equal(crossSite.status, 403);
  assert.equal(
    (await db.exchangeInquiry.findUniqueOrThrow({ where: { id: receipt.id } }))
      .state,
    "INQUIRED"
  );
});
