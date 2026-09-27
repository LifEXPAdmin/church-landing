import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { assertPortalTestDatabase, createPortalActor } from "./seed-portal";
import { interchurchHelpCommand as command } from "../lib/platform/interchurch-help-commands";
import { readInterchurchHelp as read } from "../lib/platform/interchurch-help-reads";
import { parseHelpTerms } from "../lib/platform/interchurch-help-input";
import { EXCHANGE_ITEM_POLICY } from "../lib/platform/exchange-options";
import { exchangeListingCommand } from "../lib/platform/exchange-listings";
import { exchangeNeedCommand } from "../lib/platform/exchange-need-commands";
import { PortalError } from "../lib/platform/portal-policy";
import {
  replayRetentionControls,
  type RetentionControlEntry
} from "../lib/platform/retention-controls";
import {
  exportHelp,
  eraseHelp
} from "../lib/platform/interchurch-help-retention";
import { readCommunityReports } from "../lib/platform/community-reports";
import { interchurchHelpNotificationSources } from "../lib/platform/interchurch-help-notifications";
import { postContext } from "../lib/platform/post-access";
import { currentHelpOffers } from "../lib/platform/interchurch-help-policy";
import { relationshipCommand } from "../lib/platform/relationships";
import { currentHelpOffer } from "../lib/platform/interchurch-help-policy";
let queryCount = 0;
const db = new PrismaClient({ log: [{ emit: "event", level: "query" }] });
db.$on("query", () => queryCount++);
before(() => assertPortalTestDatabase(db));
after(() => db.$disconnect());
const input = (operation: string, v: Record<string, unknown> = {}) => ({
  operation,
  mutationId: randomUUID(),
  ...v
});
const denied = (p: Promise<unknown>, status: number) =>
  assert.rejects(
    p,
    (e: unknown) => e instanceof PortalError && e.status === status
  );
const time = (days: number) =>
  new Date(Date.now() + days * 86400000).toISOString().slice(0, 16);
export const terms = () => ({
  duties: "Prepare adult worship microphones. No child contact or supervision.",
  dutyClass: "ADULT_LOGISTICS",
  equipmentMode: "NONE",
  startLocal: time(3),
  endLocal: time(4),
  timeZone: "UTC",
  compensation: "VOLUNTARY",
  price: "",
  currency: "",
  rateUnit: "",
  reimbursement: "No expense reimbursement proposed."
});
async function setup(audience = "PUBLIC") {
  const manager = await createPortalActor(db, "helpmgr"),
    a = await createPortalActor(db, "helpa"),
    b = await createPortalActor(db, "helpb");
  await db.socialPreferences.create({
    data: { ownerId: manager.id, contactRequests: "EVERYONE" }
  });
  const church = await db.church.create({
    data: {
      slug: "help-" + randomUUID(),
      name: "Fictional Ministry Church",
      summary: "Isolated help acceptance",
      communityListed: true
    }
  });
  await db.churchConnection.createMany({
    data: [manager, a].map((x) => ({
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
  const fields = {
    title: "Fictional ministry help",
    category: "AV",
    terms: terms(),
    country: "US",
    placeId: 4887398,
    audience,
    acceptCoordinator: true,
    coordinatorDisplay: "Consenting worship coordinator"
  };
  const created = await command(
    db,
    manager.token,
    input("create", {
      expectedVersion: 0,
      ownerChurchId: church.id,
      schema: 1,
      fields
    })
  );
  await command(
    db,
    manager.token,
    input("publish", {
      requestId: created.id,
      expectedVersion: created.version,
      itemPolicy: EXCHANGE_ITEM_POLICY,
      itemConfirmed: true
    })
  );
  const offer = async (
    actor = a,
    kind = "PERSONAL",
    respondingChurchId: string | null = null
  ) => {
    const r = await db.interchurchHelpRequest.findUniqueOrThrow({
      where: { id: created.id }
    });
    return command(
      db,
      actor.token,
      input("offer", {
        requestId: r.id,
        expectedVersion: r.termsVersion,
        kind,
        respondingChurchId,
        schema: 1,
        terms: terms(),
        acceptResponsibility: true,
        externalNotices: false
      })
    );
  };
  return { manager, a, b, church, grant, id: created.id, fields, offer };
}
async function select(f: Awaited<ReturnType<typeof setup>>, offerId: string) {
  const o = await db.interchurchHelpOffer.findUniqueOrThrow({
      where: { id: offerId }
    }),
    r = await db.interchurchHelpRequest.findUniqueOrThrow({
      where: { id: f.id }
    });
  await command(
    db,
    f.manager.token,
    input("select", {
      offerId,
      expectedVersion: o.version,
      requestTermsVersion: r.termsVersion,
      acceptTerms: true,
      externalNotices: false
    })
  );
  return db.interchurchHelpAgreement.findUniqueOrThrow({ where: { offerId } });
}
test("typed fields reject missing duty classification, unsupported loan, ambiguous time and unrounded currency", () => {
  assert.throws(() => parseHelpTerms(1, { ...terms(), dutyClass: "" }));
  assert.throws(() => parseHelpTerms(1, { ...terms(), equipmentMode: "LOAN" }));
  assert.throws(() =>
    parseHelpTerms(1, {
      ...terms(),
      startLocal: "2026-11-01T01:30",
      endLocal: "2026-11-01T03:30",
      timeZone: "America/Chicago"
    })
  );
  assert.throws(() =>
    parseHelpTerms(1, {
      ...terms(),
      compensation: "PAID",
      price: "1.001",
      currency: "USD",
      rateUnit: "TASK"
    })
  );
  assert.equal(
    parseHelpTerms(1, {
      ...terms(),
      compensation: "PAID",
      price: "12.34",
      currency: "USD",
      rateUnit: "TASK"
    }).amountMinor,
    1234
  );
});
test("request publication keeps typed fields canonical; generic quantity, copy and close cannot bypass", async () => {
  const f = await setup(),
    l = await db.exchangeListing.findUniqueOrThrow({ where: { id: f.id } });
  assert.equal(l.description, "");
  assert.equal(l.category, null);
  assert.equal(l.neededBy, null);
  const page = await read(db, undefined, { view: "request", id: f.id });
  assert.equal(page.view, "request");
  assert.ok(JSON.stringify(page).includes("Consenting worship coordinator"));
  assert.ok(!JSON.stringify(page).includes(f.manager.email));
  for (const operation of ["duplicate", "status"])
    await denied(
      exchangeListingCommand(
        db,
        f.manager.token,
        input(operation, {
          listingId: f.id,
          expectedVersion: l.version,
          ...(operation === "status"
            ? {
                state: "CLOSED",
                itemPolicy: EXCHANGE_ITEM_POLICY,
                itemConfirmed: true
              }
            : {})
        })
      ),
      409
    );
  await denied(
    exchangeNeedCommand(
      db,
      f.manager.token,
      input("configure", {
        listingId: f.id,
        listingVersion: l.version,
        expectedVersion: 0,
        deadlineLocal: time(2),
        timeZone: "UTC",
        acceptCoordinator: true
      })
    ),
    409
  );
  await assert.rejects(
    db.exchangeListing.update({
      where: { id: f.id },
      data: { helpPurpose: null }
    })
  );
  await assert.rejects(
    db.exchangeNeed.create({ data: { id: randomUUID(), listingId: f.id } })
  );
});
test("membership and Exchange management never grant organization commitment; cross-church and revoked retries deny", async () => {
  const f = await setup();
  await denied(f.offer(f.a, "ORGANIZATION", f.church.id), 404);
  await db.churchCapabilityGrant.create({
    data: {
      userId: f.a.id,
      churchId: f.church.id,
      capability: "MANAGE_EXCHANGE_LISTINGS"
    }
  });
  await denied(f.offer(f.a, "ORGANIZATION", f.church.id), 404);
  const g = await db.churchCapabilityGrant.create({
    data: {
      userId: f.a.id,
      churchId: f.church.id,
      capability: "COMMIT_INTERCHURCH_HELP"
    }
  });
  const body = input("offer", {
    requestId: f.id,
    expectedVersion: 1,
    kind: "ORGANIZATION",
    respondingChurchId: f.church.id,
    schema: 1,
    terms: terms(),
    acceptResponsibility: true,
    externalNotices: false
  });
  const result = await command(db, f.a.token, body);
  assert.deepEqual(await command(db, f.a.token, body), result);
  await denied(
    command(db, f.a.token, {
      ...body,
      terms: { ...terms(), duties: "Changed body must conflict" }
    }),
    409
  );
  await db.churchCapabilityGrant.update({
    where: { id: g.id },
    data: { revokedAt: new Date(), version: { increment: 1 } }
  });
  await denied(command(db, f.a.token, body), 404);
  await db.churchCapabilityGrant.update({
    where: { id: g.id },
    data: { revokedAt: null, version: { increment: 1 } }
  });
  assert.equal(
    await currentHelpOffer(
      db,
      await db.interchurchHelpOffer.findUniqueOrThrow({
        where: { id: result.id }
      })
    ),
    null
  );
});
test("private pairs never disclose to other responders or replacement managers and church audiences stay local", async () => {
  const f = await setup("CHURCH");
  await denied(f.offer(f.b), 404);
  const o = await f.offer();
  await denied(read(db, f.b.token, { view: "offer", id: o.id }), 404);
  await db.churchConnection.create({
    data: { userId: f.b.id, churchId: f.church.id, state: "APPROVED" }
  });
  await db.churchCapabilityGrant.create({
    data: {
      userId: f.b.id,
      churchId: f.church.id,
      capability: "MANAGE_EXCHANGE_LISTINGS"
    }
  });
  await denied(read(db, f.b.token, { view: "offer", id: o.id }), 404);
  const r = await db.interchurchHelpRequest.findUniqueOrThrow({
    where: { id: f.id }
  });
  await command(
    db,
    f.b.token,
    input("coordinator", {
      requestId: f.id,
      expectedVersion: r.version,
      acceptCoordinator: true,
      coordinatorDisplay: "New consenting coordinator"
    })
  );
  await denied(read(db, f.b.token, { view: "offer", id: o.id }), 404);
  const own = await read(db, f.a.token, { view: "offer", id: o.id });
  assert.equal(own.view, "offers");
  if (own.view === "offers") assert.equal(own.offers[0].available, false);
});
test("selection is not confirmation or fulfillment; bilateral acknowledgment, amendments and explicit completion", async () => {
  const f = await setup(),
    o = await f.offer();
  let a = await select(f, o.id);
  assert.equal(a.state, "NEEDS_REVIEW");
  const r = await db.interchurchHelpRequest.findUniqueOrThrow({
    where: { id: f.id }
  });
  await denied(
    command(
      db,
      f.manager.token,
      input("close", {
        requestId: f.id,
        expectedVersion: r.version,
        outcome: "FULFILLED",
        reason: "Cannot infer delivery from selection"
      })
    ),
    409
  );
  await command(
    db,
    f.a.token,
    input("acknowledge", {
      offerId: o.id,
      expectedVersion: a.version,
      termsVersion: 1,
      requestTermsVersion: 1,
      acceptTerms: true,
      externalNotices: false
    })
  );
  a = await db.interchurchHelpAgreement.findUniqueOrThrow({
    where: { offerId: o.id }
  });
  assert.equal(a.state, "CONFIRMED");
  await command(
    db,
    f.a.token,
    input("contact", {
      offerId: o.id,
      expectedVersion: a.version,
      termsVersion: 1,
      contact: "Purpose-specific chosen contact",
      consent: true
    })
  );
  a = await db.interchurchHelpAgreement.findUniqueOrThrow({
    where: { offerId: o.id }
  });
  await command(
    db,
    f.manager.token,
    input("amend", {
      offerId: o.id,
      expectedVersion: a.version,
      schema: 1,
      terms: { ...terms(), duties: "Revised adult microphone setup" },
      requestTermsVersion: 1,
      acceptTerms: true
    })
  );
  a = await db.interchurchHelpAgreement.findUniqueOrThrow({
    where: { offerId: o.id }
  });
  assert.equal(a.state, "NEEDS_REVIEW");
  assert.equal(a.responderContact, "");
  assert.equal(a.responderAcknowledged, null);
  await denied(
    command(
      db,
      f.a.token,
      input("acknowledge", {
        offerId: o.id,
        expectedVersion: a.version,
        termsVersion: 1,
        requestTermsVersion: 1,
        acceptTerms: true,
        externalNotices: false
      })
    ),
    409
  );
  await command(
    db,
    f.a.token,
    input("acknowledge", {
      offerId: o.id,
      expectedVersion: a.version,
      termsVersion: 2,
      requestTermsVersion: 1,
      acceptTerms: true,
      externalNotices: false
    })
  );
  a = await db.interchurchHelpAgreement.findUniqueOrThrow({
    where: { offerId: o.id }
  });
  await denied(
    command(
      db,
      f.a.token,
      input("complete", {
        offerId: o.id,
        expectedVersion: a.version,
        reason: "Responder cannot attest receipt"
      })
    ),
    404
  );
  await command(
    db,
    f.manager.token,
    input("complete", {
      offerId: o.id,
      expectedVersion: a.version,
      reason:
        "Current coordinator confirms all agreed adult equipment setup delivered"
    })
  );
  const ready = await db.interchurchHelpRequest.findUniqueOrThrow({
    where: { id: f.id }
  });
  await command(
    db,
    f.manager.token,
    input("close", {
      requestId: f.id,
      expectedVersion: ready.version,
      outcome: "FULFILLED",
      reason:
        "All requested scope was delivered and all selected agreements completed"
    })
  );
  assert.equal(
    (await db.interchurchHelpRequest.findUniqueOrThrow({ where: { id: f.id } }))
      .outcome,
    "FULFILLED"
  );
});
test("child duties under Other remain unavailable and concurrent selection cannot duplicate agreements", async () => {
  const f = await setup();
  let r = await db.interchurchHelpRequest.findUniqueOrThrow({
    where: { id: f.id }
  });
  await command(
    db,
    f.manager.token,
    input("save", {
      requestId: f.id,
      expectedVersion: r.version,
      schema: 1,
      fields: {
        ...f.fields,
        category: "OTHER",
        terms: { ...terms(), dutyClass: "CHILD_FACING" }
      },
      itemPolicy: EXCHANGE_ITEM_POLICY,
      itemConfirmed: true
    })
  );
  await denied(f.offer(), 409);
  r = await db.interchurchHelpRequest.findUniqueOrThrow({
    where: { id: f.id }
  });
  await command(
    db,
    f.manager.token,
    input("save", {
      requestId: f.id,
      expectedVersion: r.version,
      schema: 1,
      fields: f.fields,
      itemPolicy: EXCHANGE_ITEM_POLICY,
      itemConfirmed: true
    })
  );
  const o = await f.offer();
  const outcomes = await Promise.allSettled([select(f, o.id), select(f, o.id)]);
  assert.equal(outcomes.filter((o) => o.status === "fulfilled").length, 1);
  assert.equal(
    await db.interchurchHelpAgreement.count({ where: { offerId: o.id } }),
    1
  );
});

async function confirmed(
  f: Awaited<ReturnType<typeof setup>>,
  offerId: string
) {
  const a = await select(f, offerId);
  await command(
    db,
    f.a.token,
    input("acknowledge", {
      offerId,
      expectedVersion: a.version,
      termsVersion: a.termsVersion,
      requestTermsVersion: a.requestTermsVersion,
      acceptTerms: true,
      externalNotices: false
    })
  );
  return db.interchurchHelpAgreement.findUniqueOrThrow({ where: { offerId } });
}
test("blocking a confirmed pair clears contact, preserves completion facts and never revives on unblock", async () => {
  const f = await setup(),
    o = await f.offer();
  let a = await confirmed(f, o.id);
  await command(
    db,
    f.a.token,
    input("contact", {
      offerId: o.id,
      expectedVersion: a.version,
      termsVersion: a.termsVersion,
      contact: "private synthetic contact",
      consent: true
    })
  );
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
  a = await db.interchurchHelpAgreement.findUniqueOrThrow({
    where: { offerId: o.id }
  });
  assert.equal(a.state, "REVOKED");
  assert.equal(a.responderContact, "");
  const blocked = await read(db, f.a.token, { view: "offer", id: o.id });
  assert.ok(!JSON.stringify(blocked).includes("microphones"));
  const r = await db.socialRelationship.findFirstOrThrow({
    where: { ownerId: f.a.id, targetUserId: f.manager.id }
  });
  await relationshipCommand(
    db,
    f.a.token,
    input("block", {
      kind: "person",
      targetId: f.manager.id,
      expectedVersion: r.version,
      desired: false
    })
  );
  assert.equal(
    await currentHelpOffer(
      db,
      await db.interchurchHelpOffer.findUniqueOrThrow({ where: { id: o.id } })
    ),
    null
  );
  await command(
    db,
    f.a.token,
    input("withdraw-contact", { offerId: o.id, expectedVersion: a.version })
  );
  a = await db.interchurchHelpAgreement.findUniqueOrThrow({
    where: { offerId: o.id }
  });
  await command(
    db,
    f.a.token,
    input("cancel", {
      offerId: o.id,
      expectedVersion: a.version,
      reason: "I withdraw my remaining responsibility after access ended"
    })
  );
  assert.equal(
    (
      await db.interchurchHelpAgreement.findUniqueOrThrow({
        where: { offerId: o.id }
      })
    ).state,
    "CANCELED"
  );
});
test("private report and export select one pair; erasure revokes unfinished responsibility", async () => {
  const f = await setup(),
    o = await f.offer(),
    other = await f.offer(f.b);
  await confirmed(f, o.id);
  const preview = await readCommunityReports(db, f.a.token, {
    view: "target",
    targetType: "INTERCHURCH_OFFER",
    targetId: o.id
  });
  assert.ok(JSON.stringify(preview).includes("microphones"));
  assert.ok(!JSON.stringify(preview).includes(other.id));
  await denied(
    readCommunityReports(db, f.a.token, {
      view: "target",
      targetType: "INTERCHURCH_OFFER",
      targetId: other.id
    }),
    404
  );
  const exported = await exportHelp(db, f.a.id, 100);
  assert.equal(exported.length, 1);
  assert.equal(exported[0].id, o.id);
  assert.ok(!JSON.stringify(exported).includes(f.manager.email));
  await db.$transaction((tx) => eraseHelp(tx, f.a.id));
  const erased = await db.interchurchHelpOffer.findUniqueOrThrow({
    where: { id: o.id },
    include: { agreement: true }
  });
  assert.equal(erased.responderId, null);
  assert.deepEqual(erased.terms, {});
  assert.equal(erased.agreement!.state, "REVOKED");
  assert.notDeepEqual(erased.agreement!.terms, {});
  assert.equal(
    (
      await db.interchurchHelpOffer.findUniqueOrThrow({
        where: { id: other.id }
      })
    ).responderId,
    f.b.id
  );
});
test("older restored confirmed agreements are quarantined and opaque controls cannot revive consent", async () => {
  const f = await setup(),
    o = await f.offer();
  let a = await confirmed(f, o.id);
  const old = await db.interchurchHelpRequest.findUniqueOrThrow({
    where: { id: f.id }
  });
  await command(
    db,
    f.a.token,
    input("cancel", {
      offerId: o.id,
      expectedVersion: a.version,
      reason: "No remaining commitment"
    })
  );
  const control = await db.retentionControl.findFirstOrThrow({
    where: { kind: "INTERCHURCH_HELP", sourceId: f.id },
    orderBy: { version: "desc" }
  });
  assert.ok(!JSON.stringify(control.payload).includes("microphones"));
  await db.interchurchHelpRequest.update({
    where: { id: f.id },
    data: { version: old.version }
  });
  await db.interchurchHelpAgreement.update({
    where: { id: a.id },
    data: {
      state: "CONFIRMED",
      responderContact: "restored stale contact",
      requesterAcknowledged: a.termsVersion,
      responderAcknowledged: a.termsVersion
    }
  });
  await replayRetentionControls(db, [
    control.payload as unknown as RetentionControlEntry
  ]);
  a = await db.interchurchHelpAgreement.findUniqueOrThrow({
    where: { id: a.id }
  });
  assert.equal(a.state, "REVOKED");
  assert.equal(a.responderContact, "");
  assert.equal(
    (await db.interchurchHelpRequest.findUniqueOrThrow({ where: { id: f.id } }))
      .recoveryRequired,
    true
  );
  await denied(read(db, undefined, { view: "request", id: f.id }), 404);
});
test("coordinator withdrawal after grant revocation remains possible and never transfers private pairs", async () => {
  const f = await setup(),
    o = await f.offer();
  await confirmed(f, o.id);
  await db.churchCapabilityGrant.update({
    where: { id: f.grant.id },
    data: { revokedAt: new Date(), version: { increment: 1 } }
  });
  const r = await db.interchurchHelpRequest.findUniqueOrThrow({
    where: { id: f.id }
  });
  const body = input("withdraw-coordinator", {
    requestId: f.id,
    expectedVersion: r.version
  });
  await command(db, f.manager.token, body);
  assert.equal(
    (await db.interchurchHelpRequest.findUniqueOrThrow({ where: { id: f.id } }))
      .coordinatorId,
    null
  );
  assert.equal(
    (
      await db.interchurchHelpAgreement.findUniqueOrThrow({
        where: { offerId: o.id }
      })
    ).state,
    "REVOKED"
  );
});
test("notification projection is generic, optional push consent stays separate and batched authority is bounded", async () => {
  const f = await setup(),
    first = await f.offer(),
    second = await f.offer(f.b);
  const rows = await db.interchurchHelpOffer.findMany({
    where: { id: { in: [first.id, second.id] } }
  });
  queryCount = 0;
  const pairs = await currentHelpOffers(db, rows);
  assert.equal(pairs.size, 2);
  assert.ok(queryCount <= 16, `batch used ${queryCount} queries`);
  const events = await db.socialEvent.findMany({
    where: {
      kind: "INTERCHURCH_HELP",
      sourceId: first.id,
      recipientId: f.manager.id
    }
  });
  assert.ok(events.length);
  const context = await postContext(db, f.manager.id);
  const activity = await interchurchHelpNotificationSources(
    db,
    events,
    context,
    "ACTIVITY"
  );
  assert.equal(activity.size, 1);
  assert.ok(!JSON.stringify([...activity.values()]).includes("microphones"));
  assert.equal(
    (await interchurchHelpNotificationSources(db, events, context, "PUSH"))
      .size,
    0
  );
  assert.equal(
    (await interchurchHelpNotificationSources(db, events, context, "EMAIL"))
      .size,
    0
  );
});
