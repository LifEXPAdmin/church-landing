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
import { revokeAccountContact } from "../lib/platform/adult-contact-policy";
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
test("public request versions do not reveal private offer, selection or contact activity", async () => {
  const f = await setup();
  const snapshot = async (token: unknown) => {
    const detail = await read(db, token, { view: "request", id: f.id });
    let after: string | undefined;
    for (;;) {
      const page = await read(db, token, { view: "list", after });
      assert.equal(page.view, "list");
      if (page.view !== "list") throw new Error("Expected request list");
      const request = page.requests.find((row) => row.id === f.id);
      if (request) return JSON.stringify({ detail, request });
      assert.ok(page.next, "Published request remains discoverable");
      after = page.next;
    }
  };
  const anonymous = await snapshot(null), responder = await snapshot(f.b.token);
  const before = await read(db, f.manager.token, { view: "request", id: f.id });
  const offer = await f.offer();
  const agreement = await confirmed(f, offer.id);
  await command(db, f.a.token, input("contact", {
    offerId: offer.id,
    expectedVersion: agreement.version,
    termsVersion: agreement.termsVersion,
    contact: "Private chosen contact",
    consent: true
  }));
  assert.equal(await snapshot(null), anonymous);
  assert.equal(await snapshot(f.b.token), responder);
  const after = await read(db, f.manager.token, { view: "request", id: f.id });
  assert.equal(before.view, "request");
  assert.equal(after.view, "request");
  if (before.view === "request" && after.view === "request") {
    assert.ok(after.request.version > before.request.version);
    assert.equal(after.request.termsVersion, before.request.termsVersion);
  }
});
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
  const receipt = await command(db, f.manager.token, body);
  assert.deepEqual(await command(db, f.manager.token, body), receipt);
  assert.equal(
    (await db.interchurchHelpRequest.findUniqueOrThrow({ where: { id: f.id } }))
      .coordinatorKey,
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
  console.log(
    `Two-pair current authority projection used ${queryCount} queries.`
  );
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

test("account contact revocation never revives coordinator consent for a new offer", async () => {
  const f = await setup();
  await db.$transaction((tx) => revokeAccountContact(tx, f.manager.id));
  const row = await db.interchurchHelpRequest.findUniqueOrThrow({
    where: { id: f.id }
  });
  assert.equal(row.coordinatorKey, null);
  await denied(f.offer(), 404);
  await command(
    db,
    f.manager.token,
    input("coordinator", {
      requestId: f.id,
      expectedVersion: row.version,
      acceptCoordinator: true,
      coordinatorDisplay: "Fresh consenting coordinator"
    })
  );
  await f.offer();
});

test("two selected named pairs keep chosen contacts separate and stale request edits cannot confirm obsolete terms", async () => {
  const f = await setup(),
    first = await f.offer(),
    second = await f.offer(f.b);
  await confirmed(f, first.id);
  const secondAgreement = await select(f, second.id);
  await command(
    db,
    f.b.token,
    input("acknowledge", {
      offerId: second.id,
      expectedVersion: secondAgreement.version,
      termsVersion: secondAgreement.termsVersion,
      requestTermsVersion: secondAgreement.requestTermsVersion,
      acceptTerms: true,
      externalNotices: false
    })
  );
  let a = await db.interchurchHelpAgreement.findUniqueOrThrow({
    where: { offerId: first.id }
  });
  await command(
    db,
    f.a.token,
    input("contact", {
      offerId: first.id,
      expectedVersion: a.version,
      termsVersion: a.termsVersion,
      contact: "Only first pair chosen contact",
      consent: true
    })
  );
  const secondView = await read(db, f.b.token, {
    view: "offer",
    id: second.id
  });
  assert.ok(!JSON.stringify(secondView).includes("Only first pair"));
  await denied(read(db, f.a.token, { view: "offer", id: second.id }), 404);
  const request = await db.interchurchHelpRequest.findUniqueOrThrow({
    where: { id: f.id }
  });
  a = await db.interchurchHelpAgreement.findUniqueOrThrow({
    where: { offerId: first.id }
  });
  const race = await Promise.allSettled([
    command(
      db,
      f.manager.token,
      input("save", {
        requestId: f.id,
        expectedVersion: request.version,
        schema: 1,
        fields: {
          ...f.fields,
          terms: { ...terms(), duties: "Revised public adult logistics" }
        },
        itemPolicy: EXCHANGE_ITEM_POLICY,
        itemConfirmed: true
      })
    ),
    command(
      db,
      f.a.token,
      input("acknowledge", {
        offerId: first.id,
        expectedVersion: a.version,
        termsVersion: a.termsVersion,
        requestTermsVersion: request.termsVersion,
        acceptTerms: true,
        externalNotices: false
      })
    )
  ]);
  assert.equal(race.filter((r) => r.status === "fulfilled").length, 1);
  const current = await db.interchurchHelpRequest.findUniqueOrThrow({
    where: { id: f.id }
  });
  a = await db.interchurchHelpAgreement.findUniqueOrThrow({
    where: { offerId: first.id }
  });
  if (a.state === "CONFIRMED")
    assert.equal(a.requestTermsVersion, current.termsVersion);
  else {
    assert.equal(a.state, "NEEDS_REVIEW");
    assert.equal(a.responderContact, "");
    assert.equal(a.responderAcknowledged, null);
  }
});
test("cross-church delegation and archived appointment cannot authorize an organization offer", async () => {
  const f = await setup();
  const other = await db.church.create({
    data: {
      slug: "otherhelp-" + randomUUID(),
      name: "Other fictional church",
      summary: "Separate authority boundary"
    }
  });
  await db.churchCapabilityGrant.create({
    data: {
      userId: f.a.id,
      churchId: other.id,
      capability: "COMMIT_INTERCHURCH_HELP"
    }
  });
  await denied(f.offer(f.a, "ORGANIZATION", f.church.id), 404);
  const connection = await db.churchConnection.findUniqueOrThrow({
    where: { userId_churchId: { userId: f.a.id, churchId: f.church.id } }
  });
  const position = await db.churchPosition.create({
    data: {
      churchId: f.church.id,
      name: "Fictional scoped delegate",
      requestKey: randomUUID()
    }
  });
  const assignment = await db.churchPositionAssignment.create({
    data: {
      churchId: f.church.id,
      positionId: position.id,
      connectionId: connection.id
    }
  });
  const role = await db.churchRoleGrant.create({
    data: {
      churchId: f.church.id,
      assignmentId: assignment.id,
      connectionId: connection.id,
      grantedById: f.manager.id,
      capability: "COMMIT_INTERCHURCH_HELP"
    }
  });
  const offered = await f.offer(f.a, "ORGANIZATION", f.church.id);
  await db.churchPosition.update({
    where: { id: position.id },
    data: { archivedAt: new Date() }
  });
  assert.equal(
    await currentHelpOffer(
      db,
      await db.interchurchHelpOffer.findUniqueOrThrow({
        where: { id: offered.id }
      })
    ),
    null
  );
  await db.churchRoleGrant.update({
    where: { id: role.id },
    data: { revokedAt: new Date(), version: { increment: 1 } }
  });
  await db.churchPositionAssignment.update({
    where: { id: assignment.id },
    data: { revokedAt: new Date(), version: { increment: 1 } }
  });
  await db.churchPosition.update({
    where: { id: position.id },
    data: { archivedAt: null }
  });
  await denied(f.offer(f.a, "ORGANIZATION", f.church.id), 404);
});

test("canceling a commitment retains its receipt and permits a fresh explicit offer", async () => {
  const f = await setup(),
    o = await f.offer();
  await confirmed(f, o.id);
  const agreement = await db.interchurchHelpAgreement.findUniqueOrThrow({
    where: { offerId: o.id }
  });
  const cancel = input("cancel", {
    offerId: o.id,
    expectedVersion: agreement.version,
    reason: "The original proposed date no longer works"
  });
  const receipt = await command(db, f.a.token, cancel);
  assert.deepEqual(await command(db, f.a.token, cancel), receipt);
  assert.equal(
    (await db.interchurchHelpOffer.findUniqueOrThrow({ where: { id: o.id } }))
      .state,
    "WITHDRAWN"
  );
  assert.equal(
    (
      await db.interchurchHelpAgreement.findUniqueOrThrow({
        where: { offerId: o.id }
      })
    ).state,
    "CANCELED"
  );
  assert.ok(
    JSON.stringify(
      await read(db, f.a.token, { view: "offer", id: o.id })
    ).includes("CANCELED")
  );
  const fresh = await f.offer();
  assert.notEqual(fresh.id, o.id);
  assert.equal(
    await db.interchurchHelpAgreement.count({ where: { offerId: fresh.id } }),
    0
  );
});

test("agreement push opt-out never falls back to an older offer opt-in", async () => {
  const f = await setup(),
    offer = await f.offer();
  await db.interchurchHelpOffer.update({
    where: { id: offer.id },
    data: { noticeSince: new Date(Date.now() - 60000) }
  });
  const agreement = await select(f, offer.id);
  await command(
    db,
    f.a.token,
    input("acknowledge", {
      offerId: offer.id,
      expectedVersion: agreement.version,
      termsVersion: agreement.termsVersion,
      requestTermsVersion: agreement.requestTermsVersion,
      acceptTerms: true,
      externalNotices: false
    })
  );
  const row = await db.interchurchHelpOffer.findUniqueOrThrow({
    where: { id: offer.id },
    include: { agreement: true }
  });
  assert.ok(row.noticeSince);
  assert.equal(row.agreement!.responderNoticeSince, null);
  const event = await db.socialEvent.findFirstOrThrow({
    where: { kind: "INTERCHURCH_HELP", sourceId: offer.id, recipientId: f.a.id }
  });
  const current = {
    ...event,
    sourceVersion: row.version,
    createdAt: new Date()
  };
  const context = await postContext(db, f.a.id);
  assert.equal(
    (
      await interchurchHelpNotificationSources(
        db,
        [current],
        context,
        "ACTIVITY"
      )
    ).size,
    1
  );
  assert.equal(
    (await interchurchHelpNotificationSources(db, [current], context, "PUSH"))
      .size,
    0
  );
});

test("completed receipts do not reserve a fresh deliberate offer slot", async () => {
  const f = await setup(),
    o = await f.offer();
  await confirmed(f, o.id);
  const a = await db.interchurchHelpAgreement.findUniqueOrThrow({
    where: { offerId: o.id }
  });
  await command(
    db,
    f.manager.token,
    input("complete", {
      offerId: o.id,
      expectedVersion: a.version,
      reason: "The original adult setup was delivered"
    })
  );
  const fresh = await f.offer();
  assert.notEqual(fresh.id, o.id);
  assert.equal(
    (
      await db.interchurchHelpAgreement.findUniqueOrThrow({
        where: { offerId: o.id }
      })
    ).state,
    "COMPLETED"
  );
  assert.equal(
    await db.interchurchHelpAgreement.count({ where: { offerId: fresh.id } }),
    0
  );
});

test("a canceled agreement can be replaced and delivered without making terminal history required work", async () => {
  const f = await setup(),
    original = await f.offer();
  await confirmed(f, original.id);
  let a = await db.interchurchHelpAgreement.findUniqueOrThrow({
    where: { offerId: original.id }
  });
  await command(
    db,
    f.a.token,
    input("cancel", {
      offerId: original.id,
      expectedVersion: a.version,
      reason: "Replace the original arrangement"
    })
  );
  const replacement = await f.offer();
  await confirmed(f, replacement.id);
  a = await db.interchurchHelpAgreement.findUniqueOrThrow({
    where: { offerId: replacement.id }
  });
  await command(
    db,
    f.manager.token,
    input("complete", {
      offerId: replacement.id,
      expectedVersion: a.version,
      reason: "All replacement adult setup delivered"
    })
  );
  const request = await db.interchurchHelpRequest.findUniqueOrThrow({
    where: { id: f.id }
  });
  await command(
    db,
    f.manager.token,
    input("close", {
      requestId: f.id,
      expectedVersion: request.version,
      outcome: "FULFILLED",
      reason: "All requested scope delivered by the replacement agreement"
    })
  );
  assert.equal(
    (await db.interchurchHelpRequest.findUniqueOrThrow({ where: { id: f.id } }))
      .outcome,
    "FULFILLED"
  );
  assert.equal(
    (
      await db.interchurchHelpAgreement.findUniqueOrThrow({
        where: { offerId: original.id }
      })
    ).state,
    "CANCELED"
  );
});
test("request cancellation ends unfinished consent and cannot be relabeled to revive acceptance", async () => {
  const f = await setup(),
    o = await f.offer();
  await confirmed(f, o.id);
  let a = await db.interchurchHelpAgreement.findUniqueOrThrow({
    where: { offerId: o.id }
  });
  await command(
    db,
    f.a.token,
    input("contact", {
      offerId: o.id,
      expectedVersion: a.version,
      termsVersion: a.termsVersion,
      contact: "Chosen contact to withdraw",
      consent: true
    })
  );
  let request = await db.interchurchHelpRequest.findUniqueOrThrow({
    where: { id: f.id }
  });
  const cancel = input("close", {
    requestId: f.id,
    expectedVersion: request.version,
    outcome: "CANCELED",
    reason: "The requesting church canceled the planned work"
  });
  const receipt = await command(db, f.manager.token, cancel);
  assert.deepEqual(await command(db, f.manager.token, cancel), receipt);
  a = await db.interchurchHelpAgreement.findUniqueOrThrow({
    where: { offerId: o.id }
  });
  assert.equal(a.state, "CANCELED");
  assert.equal(a.responderContact, "");
  assert.equal(a.responderAcknowledged, null);
  request = await db.interchurchHelpRequest.findUniqueOrThrow({
    where: { id: f.id }
  });
  await denied(
    command(
      db,
      f.manager.token,
      input("close", {
        requestId: f.id,
        expectedVersion: request.version,
        outcome: "CLOSED",
        reason: "Cannot remove the cancellation guard"
      })
    ),
    409
  );
  await denied(
    command(
      db,
      f.a.token,
      input("acknowledge", {
        offerId: o.id,
        expectedVersion: a.version,
        termsVersion: a.termsVersion,
        requestTermsVersion: request.termsVersion,
        acceptTerms: true,
        externalNotices: false
      })
    ),
    409
  );
});
