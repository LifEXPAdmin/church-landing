import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { assertPortalTestDatabase } from "./seed-portal";
import {
  seedVolunteerApplications,
  volunteerAction as action
} from "./seed-volunteer-applications";
import { volunteerCommand } from "../lib/platform/volunteer-commands";
import { PortalError } from "../lib/platform/portal-policy";
import {
  replayRetentionControls,
  type RetentionControlEntry
} from "../lib/platform/retention-controls";
import { readVolunteers } from "../lib/platform/volunteer-reads";
import { handleVolunteerRequest } from "../lib/platform/volunteer-boundary";
import { SESSION_COOKIE } from "../lib/platform/account-boundary";
import { accountConfig } from "../lib/platform/account-config";
import { getCalendarCommitments } from "../lib/platform/calendar-reads";
import { getPostParticipation } from "../lib/platform/post-participation-reads";
import { exportVolunteerApplications } from "../lib/platform/volunteer-privacy";
import {
  prepareAccountExport,
  downloadAccountExport
} from "../lib/platform/account-export";
import { requestPermanentAccountDeletion } from "../lib/platform/account-deletion";
import { eraseRequestedAccountData } from "../lib/platform/account-erasure";
import { createSessionToken } from "../lib/platform/auth";
import { randomUUID } from "node:crypto";
import { exchangeNeedCommand } from "../lib/platform/exchange-need-commands";
import { readExchangeNeeds } from "../lib/platform/exchange-need-reads";
import { exchangeListingCommand } from "../lib/platform/exchange-listings";
import { EXCHANGE_ITEM_POLICY } from "../lib/platform/exchange-options";
import { NEED_SCHEMA } from "../lib/platform/exchange-need-options";

const db = new PrismaClient();
before(() => assertPortalTestDatabase(db));
after(() => db.$disconnect());
const denied = (p: Promise<unknown>, status: number) =>
  assert.rejects(p, (e) => e instanceof PortalError && e.status === status);
const setup = (timed = true, capacity = 1) =>
  seedVolunteerApplications(db, timed, capacity);

async function authority() {
  return Promise.all([
    db.churchConnection.count(),
    db.churchCapabilityGrant.count(),
    db.churchPositionAssignment.count(),
    db.platformOperatorGrant.count()
  ]);
}

test("timed applications reserve nothing until approval, preserve authority and block direct instant signup", async () => {
  const f = await setup();
  const before = await authority();
  const input = f.application();
  const first = await volunteerCommand(db, f.lee.token, input);
  assert.deepEqual(await volunteerCommand(db, f.lee.token, input), first);
  assert.equal(
    await db.postVolunteerSignup.count({
      where: { slotId: f.opportunity.slotId! }
    }),
    0
  );
  await denied(
    volunteerCommand(db, f.lee.token, {
      ...input,
      statement: "Changed same request"
    }),
    409
  );
  await denied(
    f.command(f.lee, {
      operation: "volunteer",
      slotId: f.opportunity.slotId,
      slotVersion: 1,
      expectedVersion: 0,
      coordinatorId: f.ada.id
    }),
    409
  );
  const accept = action("accept", {
    id: first.id,
    expectedVersion: first.version,
    ...f.snapshot
  });
  await denied(volunteerCommand(db, f.val.token, accept), 404);
  const approved = await volunteerCommand(db, f.ada.token, accept);
  assert.deepEqual(await volunteerCommand(db, f.ada.token, accept), approved);
  const row = await db.volunteerApplication.findUniqueOrThrow({
    where: { id: first.id },
    include: { signup: true, events: true }
  });
  assert.equal(row.state, "ACCEPTED");
  assert.equal(row.signup?.state, "ACTIVE");
  assert.equal(row.events.length, 2);
  assert.equal(
    row.events.find((e) => e.action === "ACCEPTED")?.actorId,
    f.ada.id
  );
  assert.equal(
    await db.postVolunteerSignup.count({
      where: { slotId: f.opportunity.slotId! }
    }),
    1
  );
  assert.deepEqual(await authority(), before);
});

test("concurrent approvals have one last-place winner and a declined application retains history", async () => {
  const f = await setup();
  const a = await volunteerCommand(db, f.lee.token, f.application("Private A"));
  const b = await volunteerCommand(db, f.val.token, f.application("Private B"));
  const results = await Promise.allSettled(
    [a, b].map((row) =>
      volunteerCommand(
        db,
        f.ada.token,
        action("accept", { id: row.id, expectedVersion: 1, ...f.snapshot })
      )
    )
  );
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  const failed = results.find(
    (r) => r.status === "rejected"
  ) as PromiseRejectedResult;
  assert.ok(failed.reason instanceof PortalError);
  assert.equal(failed.reason.status, 409);
  assert.equal(
    await db.postVolunteerSignup.count({
      where: { slotId: f.opportunity.slotId!, state: "ACTIVE" }
    }),
    1
  );
  const pending = await db.volunteerApplication.findFirstOrThrow({
    where: { opportunityId: f.opportunity.id, state: "SUBMITTED" }
  });
  await volunteerCommand(
    db,
    f.ada.token,
    action("decline", {
      id: pending.id,
      expectedVersion: 1,
      note: "No available place for this shift."
    })
  );
  const declined = await db.volunteerApplication.findUniqueOrThrow({
    where: { id: pending.id },
    include: { events: true }
  });
  assert.equal(declined.state, "DECLINED");
  assert.equal(declined.events.length, 2);
  assert.equal(declined.statement, pending.statement);
});

test("withdrawal through the legacy signup path synchronizes applications and old receipts cannot revive a new attempt", async () => {
  const f = await setup();
  const submitted = await volunteerCommand(db, f.lee.token, f.application());
  const accept = action("accept", {
    id: submitted.id,
    expectedVersion: 1,
    ...f.snapshot
  });
  await volunteerCommand(db, f.ada.token, accept);
  const accepted = await db.volunteerApplication.findUniqueOrThrow({
    where: { id: submitted.id },
    include: { signup: true }
  });
  await f.command(f.lee, {
    operation: "cancel-volunteer",
    signupId: accepted.signupId,
    expectedVersion: accepted.signup!.version
  });
  const canceled = await db.volunteerApplication.findUniqueOrThrow({
    where: { id: submitted.id }
  });
  assert.equal(canceled.state, "WITHDRAWN");
  assert.equal(canceled.version, 3);
  await denied(volunteerCommand(db, f.ada.token, accept), 409);
  const again = await volunteerCommand(db, f.lee.token, {
    ...f.application(),
    expectedVersion: 3
  });
  assert.equal(again.id, submitted.id);
  assert.equal(again.version, 4);
  await denied(volunteerCommand(db, f.ada.token, accept), 409);
  await volunteerCommand(
    db,
    f.ada.token,
    action("accept", { id: again.id, expectedVersion: 4, ...f.snapshot })
  );
  assert.equal(
    await db.postVolunteerSignup.count({
      where: { slotId: f.opportunity.slotId! }
    }),
    1
  );
  assert.equal(
    (
      await db.postVolunteerSignup.findUniqueOrThrow({
        where: { id: accepted.signupId! }
      })
    ).state,
    "ACTIVE"
  );
});

test("untimed ministry assignments use no fake event, calendar RSVP, staff grant or timed signup", async () => {
  const f = await setup(false);
  const before = await authority();
  const signupCount = await db.postVolunteerSignup.count();
  const occurrenceCount = await db.calendarOccurrence.count();
  const a = await volunteerCommand(db, f.lee.token, f.application());
  await volunteerCommand(
    db,
    f.ada.token,
    action("accept", { id: a.id, expectedVersion: 1, ...f.snapshot })
  );
  assert.equal(await db.postVolunteerSignup.count(), signupCount);
  assert.equal(await db.calendarOccurrence.count(), occurrenceCount);
  assert.deepEqual(await authority(), before);
  await volunteerCommand(
    db,
    f.ada.token,
    action("cancel", { id: a.id, expectedVersion: 2 })
  );
  assert.equal(
    (await db.volunteerApplication.findUniqueOrThrow({ where: { id: a.id } }))
      .state,
    "WITHDRAWN"
  );
});

test("source and coordinator revocation deny approval while the applicant keeps a minimal withdrawal path", async () => {
  const f = await setup();
  const a = await volunteerCommand(db, f.lee.token, f.application());
  await db.churchCapabilityGrant.deleteMany({
    where: {
      churchId: f.churchA.id,
      userId: f.ada.id,
      capability: "MANAGE_CHURCH_VOLUNTEERS"
    }
  });
  await denied(
    volunteerCommand(
      db,
      f.ada.token,
      action("accept", { id: a.id, expectedVersion: 1, ...f.snapshot })
    ),
    404
  );
  await db.platformPost.update({
    where: { id: f.post.id },
    data: { withdrawnAt: new Date(), status: "WITHDRAWN" }
  });
  await volunteerCommand(
    db,
    f.lee.token,
    action("withdraw", { id: a.id, expectedVersion: 1 })
  );
  assert.equal(
    (await db.volunteerApplication.findUniqueOrThrow({ where: { id: a.id } }))
      .state,
    "WITHDRAWN"
  );
});

test("protected restore quarantines an older accepted application and cancels its uncompleted canonical assignment", async () => {
  const f = await setup();
  const a = await volunteerCommand(db, f.lee.token, f.application());
  await volunteerCommand(
    db,
    f.ada.token,
    action("accept", { id: a.id, expectedVersion: 1, ...f.snapshot })
  );
  const accepted = await db.volunteerApplication.findUniqueOrThrow({
    where: { id: a.id },
    include: { signup: true }
  });
  await volunteerCommand(
    db,
    f.lee.token,
    action("withdraw", { id: a.id, expectedVersion: 2 })
  );
  const control = await db.retentionControl.findFirstOrThrow({
    where: { kind: "VOLUNTEER_APPLICATION", sourceId: a.id, version: 3 }
  });
  await db.volunteerApplication.update({
    where: { id: a.id },
    data: {
      version: 2,
      state: "ACCEPTED",
      statement: "Obsolete private answer"
    }
  });
  await db.postVolunteerSignup.update({
    where: { id: accepted.signupId! },
    data: { state: "ACTIVE", version: 1 }
  });
  await replayRetentionControls(db, [
    control.payload as unknown as RetentionControlEntry
  ]);
  const restored = await db.volunteerApplication.findUniqueOrThrow({
    where: { id: a.id },
    include: { signup: true }
  });
  assert.equal(restored.recoveryRequired, true);
  assert.equal(restored.state, "WITHDRAWN");
  assert.equal(restored.statement, "");
  assert.equal(restored.signup?.state, "CANCELED");
});

test("private reads and exports conceal other applicants and revoked source details, while owned withdrawal remains available", async () => {
  const f = await setup(false, 2);
  const a = await volunteerCommand(
    db,
    f.lee.token,
    f.application("Applicant Lee confidential note")
  );
  await volunteerCommand(
    db,
    f.val.token,
    f.application("Applicant Val confidential note")
  );
  const detail = await readVolunteers(db, f.lee.token, {
    view: "opportunity",
    id: f.opportunity.id
  });
  assert.ok(JSON.stringify(detail).includes("Applicant Lee confidential note"));
  assert.ok(
    !JSON.stringify(detail).includes("Applicant Val confidential note")
  );
  assert.ok(
    !JSON.stringify(
      await readVolunteers(db, f.lee.token, { view: "list" })
    ).includes("confidential note")
  );
  await denied(
    readVolunteers(db, f.lee.token, {
      view: "applications",
      id: f.opportunity.id
    }),
    404
  );
  const review = await readVolunteers(db, f.ada.token, {
    view: "applications",
    id: f.opportunity.id
  });
  assert.equal(review.view, "applications");
  assert.ok(!JSON.stringify(review).includes(f.lee.email));
  assert.ok(JSON.stringify(review).includes("Applicant Val confidential note"));
  const secret = process.env.AUTH_RATE_LIMIT_SECRET!;
  const proof = await prepareAccountExport(
    db,
    f.lee.token,
    f.lee.password,
    secret
  );
  const exported = JSON.stringify(
    await downloadAccountExport(db, f.lee.token, proof.authorization, secret)
  );
  assert.ok(exported.includes("Applicant Lee confidential note"));
  assert.ok(!exported.includes("Applicant Val confidential note"));
  await db.platformPost.update({
    where: { id: f.opportunityPost.id },
    data: { status: "WITHDRAWN", withdrawnAt: new Date() }
  });
  const mine = await readVolunteers(db, f.lee.token, { view: "applications" });
  assert.equal(mine.view, "applications");
  if (mine.view !== "applications") throw Error("wrong view");
  const receipt = mine.items.find((row) => row.id === a.id)!;
  assert.equal(receipt.current, false);
  assert.equal(receipt.statement, "");
  assert.equal(receipt.opportunityId, null);
  assert.equal(receipt.canWithdraw, true);
  assert.ok(
    !JSON.stringify(
      await db.$transaction((tx) =>
        exportVolunteerApplications(tx, f.lee.id, 2000)
      )
    ).includes("confidential note")
  );
  await volunteerCommand(
    db,
    f.lee.token,
    action("withdraw", { id: a.id, expectedVersion: 1 })
  );
});

test("HTTP enforces account pin, origin, bounded strict input, private cache headers and exact retry", async () => {
  const f = await setup();
  const body = f.application(),
    origin = accountConfig().origin;
  const request = (
    owner: string,
    source = origin,
    value: Record<string, unknown> = body
  ) =>
    new Request(origin + "/api/platform/volunteers", {
      method: "POST",
      headers: {
        cookie: `${SESSION_COOKIE}=${f.lee.token}`,
        "content-type": "application/json",
        origin: source,
        "x-expected-account": owner
      },
      body: JSON.stringify(value)
    });
  assert.equal(
    (await handleVolunteerRequest(db, request(f.val.id))).status,
    401
  );
  assert.equal(
    (
      await handleVolunteerRequest(
        db,
        request(f.lee.id, "https://unrelated.example.test")
      )
    ).status,
    403
  );
  assert.equal(
    (
      await handleVolunteerRequest(
        db,
        request(f.lee.id, origin, { ...body, applicantId: f.val.id })
      )
    ).status,
    400
  );
  const saved = await handleVolunteerRequest(db, request(f.lee.id));
  assert.equal(saved.status, 200);
  for (const key of [
    "cache-control",
    "cdn-cache-control",
    "vercel-cdn-cache-control"
  ])
    assert.match(saved.headers.get(key)!, /no-store/);
  assert.match(saved.headers.get("vary")!, /X-Expected-Account/);
  assert.match(saved.headers.get("x-robots-tag")!, /noindex/);
  assert.deepEqual(
    await (await handleVolunteerRequest(db, request(f.lee.id))).json(),
    await saved.json()
  );
  const get = (query: string, owner = f.lee.id) =>
    new Request(origin + "/api/platform/volunteers?" + query, {
      headers: {
        cookie: `${SESSION_COOKIE}=${f.lee.token}`,
        "x-expected-account": owner
      }
    });
  assert.equal(
    (await handleVolunteerRequest(db, get("view=applications", f.val.id)))
      .status,
    401
  );
  assert.equal(
    (await handleVolunteerRequest(db, get("view=list&view=applications")))
      .status,
    400
  );
  assert.equal(
    (await handleVolunteerRequest(db, get("view=list&q=" + "x".repeat(71))))
      .status,
    400
  );
  assert.equal(
    await db.volunteerApplication.count({
      where: { opportunityId: f.opportunity.id, userId: f.lee.id }
    }),
    1
  );
});

test("independent calendar shifts exclude unused parent time, survive moved parents as conflicts and legacy slots still inherit", async () => {
  const f = await setup();
  const a = await volunteerCommand(db, f.lee.token, f.application());
  await volunteerCommand(
    db,
    f.ada.token,
    action("accept", { id: a.id, expectedVersion: 1, ...f.snapshot })
  );
  const range = {
    from: f.occurrence.startLocal.slice(0, 10),
    until: new Date(f.occurrence.endAt.getTime() + 86400000)
      .toISOString()
      .slice(0, 10),
    timeZone: "UTC"
  };
  const first = await getCalendarCommitments(db, f.lee.token, range),
    shift = first.volunteerCommitments[0];
  assert.equal(shift.event?.startAt, f.occurrence.startAt.toISOString());
  assert.equal(
    new Date(shift.event!.endAt).getTime() -
      new Date(shift.event!.startAt).getTime(),
    30 * 60000
  );
  const legacy = await f.slot({ role: "Legacy instant role" });
  await f.command(f.val, {
    operation: "volunteer",
    slotId: legacy.id,
    slotVersion: 1,
    expectedVersion: 0
  });
  assert.equal(
    (await getCalendarCommitments(db, f.val.token, range))
      .volunteerCommitments[0].event?.endAt,
    f.occurrence.endAt.toISOString()
  );
  await db.calendarOccurrence.update({
    where: { id: f.occurrence.id },
    data: {
      startAt: new Date(f.occurrence.startAt.getTime() + 3 * 86400000),
      endAt: new Date(f.occurrence.endAt.getTime() + 3 * 86400000),
      version: { increment: 1 }
    }
  });
  const after = await getCalendarCommitments(db, f.lee.token, range);
  assert.equal(
    after.volunteerCommitments[0].event?.startAt,
    shift.event?.startAt
  );
  assert.equal(after.volunteerCommitments[0].event?.shiftConflict, true);
  assert.equal(after.volunteerCommitments[0].detailsChanged, true);
  assert.equal(
    (await getPostParticipation(db, f.lee.token, f.post.id)).slots.find(
      (row) => row.id === f.opportunity.slotId
    )?.approvalRequired,
    true
  );
});

test("account erasure clears private applications, releases uncompleted places and preserves anonymous completed help", async () => {
  const f = await setup(true, 2);
  const a = await volunteerCommand(
    db,
    f.lee.token,
    f.application("Erase this private volunteer answer")
  );
  const b = await volunteerCommand(db, f.val.token, f.application());
  for (const row of [a, b])
    await volunteerCommand(
      db,
      f.ada.token,
      action("accept", { id: row.id, expectedVersion: 1, ...f.snapshot })
    );
  const completed = await db.volunteerApplication.findUniqueOrThrow({
    where: { id: a.id }
  });
  await db.postVolunteerSignup.update({
    where: { id: completed.signupId! },
    data: { completedAt: new Date() }
  });
  const journal = { async recordAccount() {}, async completeAccount() {} };
  for (const actor of [f.lee, f.val]) {
    await requestPermanentAccountDeletion(
      db,
      actor.token,
      actor.password,
      true,
      createSessionToken(),
      journal
    );
    const deletion = await db.accountDeletion.findUniqueOrThrow({
      where: { userId: actor.id }
    });
    await eraseRequestedAccountData(db, deletion.id, journal);
  }
  const rows = await db.volunteerApplication.findMany({
    where: { id: { in: [a.id, b.id] } },
    include: { signup: true, events: true }
  });
  for (const row of rows) {
    assert.equal(row.userId, null);
    assert.equal(row.statement, "");
    assert.equal(row.decisionNote, "");
    assert.equal(row.recoveryRequired, true);
    assert.ok(row.events.every((event) => !event.actorId && !event.note));
  }
  assert.ok(rows.find((row) => row.id === a.id)?.signup?.completedAt);
  assert.equal(rows.find((row) => row.id === b.id)?.state, "WITHDRAWN");
  assert.equal(
    await db.postVolunteerSignup.count({
      where: {
        slotId: f.opportunity.slotId!,
        OR: [{ state: "ACTIVE" }, { completedAt: { not: null } }]
      }
    }),
    1
  );
});

test("linked Needs require approval, use the same shift and completed receipt, and redact revoked applicants in their roster", async () => {
  const f = await setup();
  await db.churchCapabilityGrant.create({
    data: {
      churchId: f.churchA.id,
      userId: f.ada.id,
      capability: "MANAGE_EXCHANGE_LISTINGS"
    }
  });
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
  const listing = await db.exchangeListing.create({
    data: {
      ownerChurchId: f.churchA.id,
      creatorId: f.ada.id,
      intent: "CHURCH_NEED",
      category: "HOUSEHOLD",
      title: "Fictional approval-required church need",
      description: "One canonical volunteer pool.",
      requestedItems: "One helper",
      audience: "CHURCH",
      audienceChurchId: f.churchA.id,
      country: "US",
      placeId: 4887398,
      placeLabel: "Chicago"
    }
  });
  const need = await exchangeNeedCommand(
    db,
    f.ada.token,
    action("configure", {
      listingId: listing.id,
      listingVersion: 1,
      expectedVersion: 0,
      deadlineLocal: new Date(Date.now() + 3 * 86400000)
        .toISOString()
        .slice(0, 16),
      timeZone: "UTC",
      acceptCoordinator: true
    })
  );
  const slot = await exchangeNeedCommand(
    db,
    f.ada.token,
    action("slot", {
      needId: need.id,
      slotId: randomUUID(),
      expectedVersion: 0,
      schema: NEED_SCHEMA,
      fields: {
        action: "VOLUNTEER",
        label: "Fictional setup help",
        unit: "places",
        target: 1,
        loan: false,
        returnLocal: null,
        returnTimeZone: null,
        returnResponsibility: "",
        volunteerSlotId: f.opportunity.slotId
      }
    })
  );
  const prepared = await db.exchangeListing.findUniqueOrThrow({
    where: { id: listing.id }
  });
  await exchangeListingCommand(
    db,
    f.ada.token,
    action("status", {
      listingId: listing.id,
      expectedVersion: prepared.version,
      state: "ACTIVE",
      itemPolicy: EXCHANGE_ITEM_POLICY,
      itemConfirmed: true
    })
  );
  const current = await db.exchangeNeed.findUniqueOrThrow({
    where: { id: need.id }
  });
  await denied(
    exchangeNeedCommand(
      db,
      f.lee.token,
      action("volunteer", {
        needId: need.id,
        slotId: slot.id,
        slotVersion: 1,
        expectedVersion: current.consentVersion,
        signupVersion: 0
      })
    ),
    409
  );
  const a = await volunteerCommand(db, f.lee.token, f.application());
  await volunteerCommand(
    db,
    f.ada.token,
    action("accept", { id: a.id, expectedVersion: 1, ...f.snapshot })
  );
  const approved = await db.volunteerApplication.findUniqueOrThrow({
    where: { id: a.id },
    include: { signup: true }
  });
  const detail = await readExchangeNeeds(db, f.lee.token, {
    view: "need",
    listingId: listing.id
  });
  assert.ok("need" in detail && detail.need);
  if (!("need" in detail && detail.need)) throw Error("Missing need");
  assert.equal(detail.need.slots[0].volunteer?.opportunityId, f.opportunity.id);
  assert.equal(detail.need.slots[0].volunteer?.approvalRequired, true);
  assert.equal(
    detail.need.slots[0].volunteer?.event?.endAt,
    f.opportunity.slot?.shiftEndAt?.toISOString()
  );
  assert.equal(detail.need.slots[0].committed, 1);
  const completed = await exchangeNeedCommand(
    db,
    f.ada.token,
    action("complete-volunteer", {
      needId: need.id,
      signupId: approved.signupId,
      expectedVersion: approved.signup!.version,
      completed: true,
      reason: ""
    })
  );
  await denied(
    volunteerCommand(
      db,
      f.lee.token,
      action("withdraw", { id: a.id, expectedVersion: 2 })
    ),
    409
  );
  await db.churchConnection.updateMany({
    where: { churchId: f.churchA.id, userId: f.lee.id },
    data: { state: "REMOVED", version: { increment: 1 } }
  });
  const roster = await readExchangeNeeds(db, f.ada.token, {
    view: "volunteers",
    id: slot.id
  });
  assert.ok("volunteers" in roster && roster.volunteers);
  if (!("volunteers" in roster && roster.volunteers))
    throw Error("Missing roster");
  assert.equal(
    roster.volunteers.find((row) => row.id === approved.signupId)?.name,
    "Unavailable account"
  );
  await exchangeNeedCommand(
    db,
    f.ada.token,
    action("complete-volunteer", {
      needId: need.id,
      signupId: approved.signupId,
      expectedVersion: completed.version,
      completed: false,
      reason: "Fictional correction: help was not completed."
    })
  );
  await volunteerCommand(
    db,
    f.lee.token,
    action("withdraw", { id: a.id, expectedVersion: 2 })
  );
  assert.equal(
    await db.exchangeNeedContribution.count({ where: { needId: need.id } }),
    0
  );
  assert.equal(
    (
      await db.postVolunteerSignup.findUniqueOrThrow({
        where: { id: approved.signupId! }
      })
    ).state,
    "CANCELED"
  );
});

test("two shifts keep distinct capacity and calendar times, with private overlap hints after a deliberate edit", async () => {
  const f = await setup();
  const secondInput = {
    ...f.saveInput,
    mutationId: randomUUID(),
    id: randomUUID(),
    title: "Fictional second shift",
    shiftStartLocal: new Date(f.occurrence.startAt.getTime() + 3600000)
      .toISOString()
      .slice(0, 16),
    shiftEndLocal: new Date(f.occurrence.startAt.getTime() + 5400000)
      .toISOString()
      .slice(0, 16)
  };
  const second = await volunteerCommand(db, f.ada.token, secondInput);
  const secondRow = await db.volunteerOpportunity.findUniqueOrThrow({
    where: { id: second.id }
  });
  assert.notEqual(secondRow.slotId, f.opportunity.slotId);
  for (const opportunityId of [f.opportunity.id, second.id]) {
    const applied = await volunteerCommand(db, f.lee.token, {
      ...f.application(),
      opportunityId
    });
    await volunteerCommand(
      db,
      f.ada.token,
      action("accept", { id: applied.id, expectedVersion: 1, ...f.snapshot })
    );
  }
  const range = {
    from: f.occurrence.startLocal.slice(0, 10),
    until: new Date(f.occurrence.endAt.getTime() + 86400000)
      .toISOString()
      .slice(0, 10),
    timeZone: "UTC"
  };
  const before = await getCalendarCommitments(db, f.lee.token, range);
  assert.equal(before.volunteerCommitments.length, 2);
  assert.equal(
    new Set(before.volunteerCommitments.map((row) => row.event?.id)).size,
    1
  );
  assert.equal(
    new Set(before.volunteerCommitments.map((row) => row.event?.startAt)).size,
    2
  );
  assert.ok(before.volunteerCommitments.every((row) => row.conflict === null));
  const ids = before.volunteerCommitments.map((row) => row.id).sort();
  await volunteerCommand(db, f.ada.token, {
    ...secondInput,
    mutationId: randomUUID(),
    expectedVersion: 1,
    slotVersion: 1,
    shiftStartLocal: new Date(f.occurrence.startAt.getTime() + 900000)
      .toISOString()
      .slice(0, 16),
    shiftEndLocal: new Date(f.occurrence.startAt.getTime() + 2700000)
      .toISOString()
      .slice(0, 16)
  });
  const after = await getCalendarCommitments(db, f.lee.token, range);
  assert.deepEqual(after.volunteerCommitments.map((row) => row.id).sort(), ids);
  assert.ok(
    after.volunteerCommitments.every(
      (row) =>
        row.conflict ===
        "You have another commitment or busy period at this time."
    )
  );
  assert.equal(
    after.volunteerCommitments.filter((row) => row.detailsChanged).length,
    1
  );
  const unrelated = await readVolunteers(db, f.val.token, {
    view: "opportunity",
    id: second.id
  });
  assert.ok(!JSON.stringify(unrelated).includes("another commitment"));
  assert.equal(
    await db.postVolunteerSignup.count({
      where: {
        slotId: { in: [f.opportunity.slotId!, secondRow.slotId!] },
        state: "ACTIVE"
      }
    }),
    2
  );
});

test("the batched coordinator queue rechecks applicant eligibility, source membership and blocks before disclosure", async () => {
  const f = await setup();
  await volunteerCommand(
    db,
    f.lee.token,
    f.application("Private queue visibility sentinel")
  );
  const queue = async () => {
    const result = await readVolunteers(db, f.ada.token, {
      view: "applications",
      id: f.opportunity.id
    });
    assert.equal(result.view, "applications");
    if (result.view !== "applications")
      throw new Error("Unexpected queue view");
    return result;
  };
  const concealed = async () =>
    assert.ok(
      !JSON.stringify(await queue()).includes(
        "Private queue visibility sentinel"
      )
    );
  assert.equal((await queue()).items.length, 1);
  await db.platformUser.update({
    where: { id: f.lee.id },
    data: { suspendedAt: new Date() }
  });
  await concealed();
  await db.platformUser.update({
    where: { id: f.lee.id },
    data: { suspendedAt: null }
  });
  await db.churchConnection.update({
    where: { userId_churchId: { userId: f.lee.id, churchId: f.churchA.id } },
    data: { state: "REMOVED" }
  });
  await concealed();
  await db.churchConnection.update({
    where: { userId_churchId: { userId: f.lee.id, churchId: f.churchA.id } },
    data: { state: "APPROVED" }
  });
  await db.socialRelationship.create({
    data: { ownerId: f.lee.id, targetUserId: f.ada.id, blocked: true }
  });
  await concealed();
  await db.socialRelationship.deleteMany({
    where: { ownerId: f.lee.id, targetUserId: f.ada.id }
  });
  assert.equal((await queue()).items.length, 1);
  await db.volunteerApplication.updateMany({
    where: { opportunityId: f.opportunity.id },
    data: { recoveryRequired: true }
  });
  await concealed();
});
