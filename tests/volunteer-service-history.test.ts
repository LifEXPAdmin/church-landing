import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  assertPortalTestDatabase,
  createPortalActor,
  seedOperatorGrants
} from "./seed-portal";
import { seedParticipation } from "./seed-post-participation";
import {
  seedVolunteerApplications,
  volunteerAction as action
} from "./seed-volunteer-applications";
import { volunteerCommand } from "../lib/platform/volunteer-commands";
import { readVolunteers } from "../lib/platform/volunteer-reads";
import {
  readVolunteerServiceHistory,
  type VolunteerServiceRecord
} from "../lib/platform/volunteer-service-history";
import { getMemberProfile } from "../lib/platform/profiles";
import { PortalError } from "../lib/platform/portal-policy";
import { AccountError } from "../lib/platform/account-error";
import { hashSessionToken } from "../lib/platform/auth";
import { exchangeNeedCommand } from "../lib/platform/exchange-need-commands";
import { exchangeListingCommand } from "../lib/platform/exchange-listings";
import { EXCHANGE_ITEM_POLICY } from "../lib/platform/exchange-options";
import { NEED_SCHEMA } from "../lib/platform/exchange-need-options";

const db = new PrismaClient();
const previousReports = process.env.COMMUNITY_REPORTS_ENABLED;
before(async () => {
  await assertPortalTestDatabase(db);
  process.env.COMMUNITY_REPORTS_ENABLED = "true";
  await seedOperatorGrants(db, await createPortalActor(db, "servicereview"), [
    "REVIEW_COMMUNITY_REPORTS"
  ]);
});
after(async () => {
  await db.$disconnect();
  if (previousReports === undefined)
    delete process.env.COMMUNITY_REPORTS_ENABLED;
  else process.env.COMMUNITY_REPORTS_ENABLED = previousReports;
});
const denied = (request: Promise<unknown>, status: number) =>
  assert.rejects(
    request,
    (error) => error instanceof PortalError && error.status === status
  );
const confirm = (record: VolunteerServiceRecord, completed = true) =>
  action("complete", {
    targetKind: record.target.kind,
    targetId: record.target.id,
    expectedVersion: record.version,
    completed,
    reason: completed
      ? "Fictional completion note"
      : "Corrected fictional confirmation"
  });
const consent = (record: VolunteerServiceRecord, shared = true) =>
  action("service-visibility", {
    targetKind: record.target.kind,
    targetId: record.target.id,
    expectedVersion: record.serviceVersion,
    completionVersion: record.completionVersion,
    shared
  });
async function own(token: string, id: string) {
  const row = (await readVolunteerServiceHistory(db, token)).items.find(
    (item) => item.target.id === id
  );
  assert.ok(row);
  return row;
}
async function fixture(timed: boolean) {
  const f = await seedVolunteerApplications(db, timed, 3);
  const submitted = await volunteerCommand(db, f.lee.token, f.application());
  await volunteerCommand(
    db,
    f.ada.token,
    action("accept", {
      id: submitted.id,
      expectedVersion: submitted.version,
      ...f.snapshot
    })
  );
  const application = await db.volunteerApplication.findUniqueOrThrow({
    where: { id: submitted.id }
  });
  return {
    ...f,
    application,
    targetId: application.signupId ?? application.id
  };
}

for (const timed of [true, false])
  test(`${timed ? "timed" : "untimed"} service requires organizer confirmation and separate revision-bound consent`, async () => {
    const f = await fixture(timed),
      initial = await own(f.lee.token, f.targetId);
    assert.equal(initial.completed, false);
    assert.equal(initial.shared, false);
    await denied(volunteerCommand(db, f.lee.token, consent(initial)), 409);
    await denied(volunteerCommand(db, f.val.token, confirm(initial)), 404);
    const command = confirm(initial);
    const first = await volunteerCommand(db, f.ada.token, command);
    assert.deepEqual(await volunteerCommand(db, f.ada.token, command), first);
    await denied(
      volunteerCommand(db, f.ada.token, {
        ...command,
        reason: "Changed same request"
      }),
      409
    );
    const completed = await own(f.lee.token, f.targetId);
    assert.equal(completed.completed, true);
    assert.equal(completed.shared, false);
    assert.deepEqual(
      (await getMemberProfile(db, f.val.token, f.lee.username)).serviceHistory,
      []
    );
    const sharing = consent(completed);
    const receipt = await volunteerCommand(db, f.lee.token, sharing);
    assert.deepEqual(await volunteerCommand(db, f.lee.token, sharing), receipt);
    const visible = (await getMemberProfile(db, f.val.token, f.lee.username))
      .serviceHistory;
    assert.equal(visible.length, 1);
    assert.equal(visible[0].id, f.targetId);
    assert.ok(!JSON.stringify(visible).includes("Fictional completion note"));
    assert.deepEqual(
      (
        await getMemberProfile(db, f.lee.token, f.lee.username, {
          preview: "member"
        })
      ).serviceHistory,
      []
    );
    assert.equal(
      await db.postVolunteerSignup.count({ where: { userId: f.lee.id } }),
      timed ? 1 : 0
    );
    const correctedInput = confirm(await own(f.lee.token, f.targetId), false);
    await volunteerCommand(db, f.ada.token, correctedInput);
    const corrected = await own(f.lee.token, f.targetId);
    assert.equal(corrected.completed, false);
    assert.equal(corrected.shared, false);
    await denied(volunteerCommand(db, f.lee.token, sharing), 409);
    await denied(volunteerCommand(db, f.ada.token, command), 409);
    await volunteerCommand(db, f.ada.token, confirm(corrected));
    assert.equal((await own(f.lee.token, f.targetId)).shared, false);
    const application = await db.volunteerApplication.findUniqueOrThrow({
      where: { id: f.application.id }
    });
    assert.equal(application.state, "ACCEPTED");
    assert.equal(
      !!application.completedAt,
      !timed,
      "Timed application never duplicates signup completion"
    );
  });

test("instant signups use their original capacity and guarded roster, without manufacturing an application", async () => {
  const f = await seedParticipation(db),
    slot = await f.slot({ capacity: 2 });
  const signup = await f.command(f.lee, {
    operation: "volunteer",
    slotId: slot.id,
    slotVersion: slot.version,
    expectedVersion: 0
  });
  const roster = await readVolunteers(db, f.ada.token, {
    view: "service-roster",
    id: slot.id
  });
  assert.equal(roster.view, "service-roster");
  if (roster.view !== "service-roster") throw Error("Missing roster");
  assert.equal(roster.ownerId, f.ada.id);
  assert.ok(roster.people[0].service);
  assert.equal(roster.people[0].service.target.id, signup.id);
  await volunteerCommand(db, f.ada.token, confirm(roster.people[0].service));
  const current = await own(f.lee.token, signup.id);
  await volunteerCommand(db, f.lee.token, consent(current));
  await denied(
    f.command(f.lee, {
      operation: "cancel-volunteer",
      signupId: signup.id,
      expectedVersion: current.version
    }),
    409
  );
  assert.equal(
    await db.volunteerApplication.count({ where: { userId: f.lee.id } }),
    0
  );
  assert.equal(
    await db.postVolunteerSignup.count({ where: { slotId: slot.id } }),
    1
  );
});

test("source and organizer revocation hide service and deny old confirmation while owner consent removal remains retryable", async () => {
  const f = await fixture(false);
  const command = confirm(await own(f.lee.token, f.targetId));
  await volunteerCommand(db, f.ada.token, command);
  await volunteerCommand(
    db,
    f.lee.token,
    consent(await own(f.lee.token, f.targetId))
  );
  const before = await own(f.lee.token, f.targetId);
  await db.churchConnection.updateMany({
    where: { userId: f.lee.id, churchId: f.churchA.id },
    data: { state: "REMOVED" }
  });
  const unavailable = await own(f.lee.token, f.targetId);
  assert.equal(unavailable.current, false);
  assert.equal(unavailable.postId, null);
  assert.equal(unavailable.canShare, false);
  assert.equal(unavailable.canHide, true);
  assert.deepEqual(
    (await getMemberProfile(db, f.val.token, f.lee.username)).serviceHistory,
    []
  );
  const hide = consent(before, false);
  const receipt = await volunteerCommand(db, f.lee.token, hide);
  assert.deepEqual(await volunteerCommand(db, f.lee.token, hide), receipt);
  await denied(volunteerCommand(db, f.ada.token, command), 404);
  await denied(volunteerCommand(db, f.val.token, consent(before, false)), 404);
  const correction = confirm(unavailable, false);
  const corrected = await volunteerCommand(db, f.ada.token, correction);
  assert.deepEqual(
    await volunteerCommand(db, f.ada.token, correction),
    corrected
  );
  const privateRecord = await own(f.lee.token, f.targetId);
  assert.equal(privateRecord.completed, false);
  assert.equal(privateRecord.shared, false);
  await denied(volunteerCommand(db, f.ada.token, confirm(privateRecord)), 404);
  await denied(volunteerCommand(db, f.lee.token, consent(privateRecord)), 404);
});

test("a source-null untimed receipt retains owner-only consent removal without changing its assignment", async () => {
  const f = await fixture(false);
  await volunteerCommand(
    db,
    f.ada.token,
    confirm(await own(f.lee.token, f.targetId))
  );
  await volunteerCommand(
    db,
    f.lee.token,
    consent(await own(f.lee.token, f.targetId))
  );
  const before = await db.volunteerApplication.findUniqueOrThrow({
    where: { id: f.targetId }
  });
  await db.volunteerOpportunity.update({
    where: { id: f.opportunity.id },
    data: { recoveryRequired: true, postId: null }
  });
  const record = await own(f.lee.token, f.targetId);
  assert.equal(record.current, false);
  assert.equal(record.title, "Unavailable volunteer service");
  assert.equal(record.postId, null);
  assert.equal(record.opportunityId, null);
  assert.equal(record.canHide, true);
  assert.equal(record.canShare, false);
  const hide = consent(record, false);
  const result = await volunteerCommand(db, f.lee.token, hide);
  assert.deepEqual(await volunteerCommand(db, f.lee.token, hide), result);
  const after = await db.volunteerApplication.findUniqueOrThrow({
    where: { id: f.targetId }
  });
  assert.equal(after.serviceSharedAt, null);
  assert.equal(after.state, before.state);
  assert.equal(after.version, before.version);
  assert.equal(
    after.completedAt?.toISOString(),
    before.completedAt?.toISOString()
  );
  assert.equal(
    (
      await db.volunteerOpportunity.findUniqueOrThrow({
        where: { id: f.opportunity.id }
      })
    ).capacity,
    f.opportunity.capacity
  );
});

test("pending, declined, canceled, stale-owner and malformed commands cannot assert completed service", async () => {
  const f = await seedVolunteerApplications(db, false, 1);
  const application = await volunteerCommand(db, f.lee.token, f.application());
  const input = action("complete", {
    targetKind: "application",
    targetId: application.id,
    expectedVersion: application.version,
    completed: true,
    reason: ""
  });
  await denied(volunteerCommand(db, f.ada.token, input), 409);
  assert.throws(
    () => volunteerCommand(db, f.ada.token, { ...input, userId: f.lee.id }),
    (error) => error instanceof PortalError && error.status === 400
  );
  await denied(
    volunteerCommand(db, f.ada.token, { ...input, completed: "true" }),
    400
  );
  await denied(volunteerCommand(db, f.ada.token, input, f.val.id), 401);
  await volunteerCommand(
    db,
    f.ada.token,
    action("decline", {
      id: application.id,
      expectedVersion: application.version,
      note: ""
    })
  );
  await denied(
    volunteerCommand(db, f.ada.token, {
      ...input,
      expectedVersion: application.version + 1
    }),
    409
  );
  assert.equal(
    (
      await db.volunteerApplication.findUniqueOrThrow({
        where: { id: application.id }
      })
    ).completedAt,
    null
  );
  const canceled = await volunteerCommand(db, f.morgan.token, f.application());
  const accepted = await volunteerCommand(
    db,
    f.ada.token,
    action("accept", {
      id: canceled.id,
      expectedVersion: canceled.version,
      ...f.snapshot
    })
  );
  const ended = await volunteerCommand(
    db,
    f.ada.token,
    action("cancel", { id: canceled.id, expectedVersion: accepted.version })
  );
  await denied(
    volunteerCommand(db, f.ada.token, {
      ...input,
      mutationId: randomUUID(),
      targetId: canceled.id,
      expectedVersion: ended.version
    }),
    409
  );
  assert.equal(
    (
      await db.volunteerApplication.findUniqueOrThrow({
        where: { id: canceled.id }
      })
    ).completedAt,
    null
  );
});

test("combined history pages remain bounded and continuations never select another owner", async () => {
  const f = await fixture(false);
  const ids = Array.from({ length: 26 }, () => randomUUID());
  for (const id of ids) {
    const post = await db.platformPost.create({
      data: {
        authorId: f.ada.id,
        authorChurchId: f.churchA.id,
        content: "Fictional bounded service",
        audience: "CHURCH",
        audienceChurchId: f.churchA.id,
        publishedAt: new Date()
      }
    });
    const opportunity = await db.volunteerOpportunity.create({
      data: {
        postId: post.id,
        title: "Fictional service",
        duties: "Fictional duty",
        commitment: "By arrangement",
        capacity: 1
      }
    });
    await db.volunteerApplication.create({
      data: {
        id,
        opportunityId: opportunity.id,
        userId: f.lee.id,
        state: "ACCEPTED"
      }
    });
  }
  const first = await readVolunteerServiceHistory(db, f.lee.token);
  assert.equal(first.items.length, 25);
  assert.ok(first.nextCursor);
  const next = await readVolunteerServiceHistory(
    db,
    f.lee.token,
    first.nextCursor
  );
  assert.equal(next.items.length, 2);
  assert.equal(
    new Set([...first.items, ...next.items].map((row) => row.target.id)).size,
    27
  );
  assert.deepEqual(
    (await readVolunteerServiceHistory(db, f.val.token, first.nextCursor))
      .items,
    []
  );
  await denied(
    readVolunteerServiceHistory(db, f.lee.token, "a_../unsafe"),
    400
  );
});

async function linkNeed(f: Awaited<ReturnType<typeof fixture>>) {
  await db.churchCapabilityGrant.create({
    data: {
      churchId: f.churchA.id,
      userId: f.val.id,
      capability: "MODERATE_EXCHANGE_LISTINGS"
    }
  });
  await db.churchCapabilityGrant.create({
    data: {
      churchId: f.churchA.id,
      userId: f.ada.id,
      capability: "MANAGE_EXCHANGE_LISTINGS"
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
      title: "Fictional service Need",
      description: "One canonical role",
      requestedItems: "A helper",
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
  await exchangeNeedCommand(
    db,
    f.ada.token,
    action("slot", {
      needId: need.id,
      slotId: randomUUID(),
      expectedVersion: 0,
      schema: NEED_SCHEMA,
      fields: {
        action: "VOLUNTEER",
        label: "Fictional help",
        unit: "places",
        target: 3,
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
  return need;
}

test("linked Need completion retains its designated coordinator authority at the new volunteer entry point", async () => {
  const f = await fixture(true);
  await linkNeed(f);
  await db.churchCapabilityGrant.create({
    data: {
      churchId: f.churchA.id,
      userId: f.val.id,
      capability: "MANAGE_CHURCH_VOLUNTEERS"
    }
  });
  const record = await own(f.lee.token, f.targetId);
  await denied(volunteerCommand(db, f.val.token, confirm(record)), 404);
  await volunteerCommand(db, f.ada.token, confirm(record));
  assert.equal((await own(f.lee.token, f.targetId)).completed, true);
  assert.equal(
    await db.postVolunteerSignup.count({
      where: { slotId: f.opportunity.slotId! }
    }),
    1
  );
});

test("a queued confirmation rechecks session revocation under the authorization lock", async () => {
  const f = await fixture(false),
    input = confirm(await own(f.lee.token, f.targetId));
  let entered!: () => void, release!: () => void;
  const entering = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  const gate = db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(730221, 2)`;
    entered();
    await released;
    await tx.platformSession.delete({
      where: { tokenHash: hashSessionToken(f.ada.token) }
    });
  });
  await entering;
  const attempted = volunteerCommand(db, f.ada.token, input).then(
    () => null,
    (error) => error
  );
  try {
    await delay(70);
  } finally {
    release();
    await gate;
  }
  const result = await attempted;
  assert.ok(result instanceof AccountError && result.code === "session");
  assert.equal(
    (
      await db.volunteerApplication.findUniqueOrThrow({
        where: { id: f.targetId }
      })
    ).completedAt,
    null
  );
});

function correctionOnly(
  record: VolunteerServiceRecord | null | undefined,
  kind: "signup" | "application",
  id: string
) {
  assert.ok(
    record,
    "The organizer needs a current redacted correction receipt"
  );
  assert.deepEqual(record.target, { kind, id });
  assert.equal(record.canCorrect, true);
  assert.equal(record.canComplete, false);
  assert.equal(record.canShare, false);
  assert.equal(record.canHide, false);
  assert.equal(record.shared, false);
  assert.equal(record.current, false);
  assert.equal(record.title, "Unavailable volunteer service");
  assert.equal(record.postId, null);
  assert.equal(record.opportunityId, null);
  return record;
}

async function coordinatorApplications(f: Awaited<ReturnType<typeof fixture>>) {
  const page = await readVolunteers(db, f.ada.token, {
    view: "applications",
    id: f.opportunity.id
  });
  assert.equal(page.view, "applications");
  if (page.view !== "applications") throw Error("Missing applications");
  assert.equal(page.ownerId, f.ada.id);
  return page;
}

async function coordinatorRoster(token: string, slotId: string) {
  const page = await readVolunteers(db, token, {
    view: "service-roster",
    id: slotId
  });
  assert.equal(page.view, "service-roster");
  if (page.view !== "service-roster") throw Error("Missing service roster");
  return page;
}

function omitsPrivateFields(value: unknown, forbidden: string[]) {
  const serialized = JSON.stringify(value);
  for (const text of forbidden) {
    assert.ok(
      text.length > 0,
      "The privacy assertion needs populated source data"
    );
    assert.ok(!serialized.includes(text), `Redacted receipt includes ${text}`);
  }
}

async function noCorrectionAuthority(
  request: Promise<Array<{ service: VolunteerServiceRecord | null }>>,
  id: string
) {
  await request.then(
    (rows) =>
      assert.ok(
        !rows.some(
          (row) => row.service?.target.id === id && row.service.canCorrect
        )
      ),
    (error: unknown) =>
      assert.ok(
        error instanceof PortalError && [403, 404].includes(error.status)
      )
  );
}

for (const timed of [false, true])
  test(`${timed ? "timed application and roster" : "untimed application"} provides only a correction receipt after volunteer membership loss`, async () => {
    const f = await fixture(timed);
    if (timed) await linkNeed(f);
    const statement = "Fictional former volunteer private answer",
      decision = "Fictional former volunteer private decision",
      availability = "Fictional former volunteer private availability",
      historicalNote = "Fictional former volunteer private event note",
      completionNote = "Fictional former volunteer private completion note";
    // Populate distinct sensitive fields so an accidentally widened coordinator
    // projection cannot pass merely because the original fixture was empty.
    await db.volunteerApplication.update({
      where: { id: f.application.id },
      data: { statement, decisionNote: decision, availability }
    });
    await db.volunteerApplicationEvent.updateMany({
      where: { applicationId: f.application.id },
      data: { note: historicalNote }
    });
    const before = await coordinatorApplications(f);
    const original = before.items.find((item) => item.id === f.application.id);
    assert.ok(original?.service);
    assert.equal(original.statement, statement);
    assert.equal(original.applicantName, f.lee.name);
    await volunteerCommand(db, f.ada.token, {
      ...confirm(original.service),
      reason: completionNote
    });
    await volunteerCommand(
      db,
      f.lee.token,
      consent(await own(f.lee.token, f.targetId))
    );
    await db.churchConnection.updateMany({
      where: { userId: f.lee.id, churchId: f.churchA.id },
      data: { state: "REMOVED" }
    });

    const page = await coordinatorApplications(f);
    const row = page.items.find((item) => item.id === f.application.id);
    assert.ok(
      row,
      "A retained completion must remain correctable without reopening private applicant details"
    );
    assert.equal(row.current, false);
    assert.equal(row.own, false);
    assert.equal(row.applicantName, null);
    assert.equal(row.title, "Unavailable volunteer opportunity");
    assert.equal(row.opportunityId, null);
    assert.equal(row.statement, "");
    assert.equal(row.availability, "");
    assert.equal(row.decisionNote, "");
    assert.deepEqual(row.history, []);
    assert.equal(row.canWithdraw, false);
    assert.equal(row.canEditAvailability, false);
    assert.equal(row.canClearAvailability, false);
    const receipt = correctionOnly(
      row.service,
      timed ? "signup" : "application",
      f.targetId
    );
    const privateValues = [
      f.lee.name,
      f.lee.email,
      statement,
      decision,
      availability,
      historicalNote,
      completionNote,
      f.opportunity.contact,
      f.opportunityPost.id,
      f.opportunity.id
    ];
    omitsPrivateFields(row, privateValues);
    const correction = confirm(receipt, false);
    if (timed) {
      const roster = await coordinatorRoster(
        f.ada.token,
        f.opportunity.slotId!
      );
      const person = roster.people.find((item) => item.id === f.targetId);
      assert.ok(
        person,
        "The timed roster must expose the same minimal correction path"
      );
      const rosterReceipt = correctionOnly(
        person.service,
        "signup",
        f.targetId
      );
      assert.equal(rosterReceipt.version, receipt.version);
      omitsPrivateFields(person, privateValues);

      // Volunteer organizer duty alone is insufficient for this linked Need.
      const revoked = await db.churchCapabilityGrant.updateMany({
        where: {
          churchId: f.churchA.id,
          userId: f.ada.id,
          capability: "MANAGE_EXCHANGE_LISTINGS",
          revokedAt: null
        },
        data: { revokedAt: new Date() }
      });
      assert.equal(revoked.count, 1);
      await denied(volunteerCommand(db, f.ada.token, correction), 404);
      await noCorrectionAuthority(
        coordinatorApplications(f).then((value) => value.items),
        f.targetId
      );
      await noCorrectionAuthority(
        coordinatorRoster(f.ada.token, f.opportunity.slotId!).then(
          (value) => value.people
        ),
        f.targetId
      );
      await db.churchCapabilityGrant.updateMany({
        where: {
          churchId: f.churchA.id,
          userId: f.ada.id,
          capability: "MANAGE_EXCHANGE_LISTINGS"
        },
        data: { revokedAt: null }
      });
    }
    const saved = await volunteerCommand(db, f.ada.token, correction);
    assert.equal(saved.id, receipt.target.id);
    assert.equal(saved.version, receipt.version + 1);
    assert.deepEqual(
      await volunteerCommand(db, f.ada.token, correction),
      saved
    );
    const corrected = await own(f.lee.token, f.targetId);
    assert.equal(corrected.completed, false);
    assert.equal(corrected.shared, false);
    await denied(volunteerCommand(db, f.ada.token, confirm(corrected)), 404);
    await denied(volunteerCommand(db, f.lee.token, consent(corrected)), 404);
    assert.equal(
      (
        await db.volunteerApplication.findUniqueOrThrow({
          where: { id: f.application.id }
        })
      ).state,
      "ACCEPTED"
    );
    if (timed) {
      const signup = await db.postVolunteerSignup.findUniqueOrThrow({
        where: { id: f.targetId }
      });
      assert.equal(signup.state, "ACTIVE");
      assert.equal(signup.completedAt, null);
      assert.equal(
        (
          await db.postVolunteerSlot.findUniqueOrThrow({
            where: { id: signup.slotId }
          })
        ).capacity,
        3
      );
    }
    const revoked = await db.churchCapabilityGrant.updateMany({
      where: {
        churchId: f.churchA.id,
        userId: f.ada.id,
        capability: "MANAGE_CHURCH_VOLUNTEERS",
        revokedAt: null
      },
      data: { revokedAt: new Date() }
    });
    assert.equal(revoked.count, 1);
    await denied(coordinatorApplications(f), 404);
    await denied(volunteerCommand(db, f.ada.token, correction), 404);
  });

test("a direct role retains only its organizer correction receipt after volunteer membership loss", async () => {
  const f = await seedParticipation(db),
    slot = await f.slot({ capacity: 2 });
  const signup = await f.command(f.lee, {
    operation: "volunteer",
    slotId: slot.id,
    slotVersion: slot.version,
    expectedVersion: 0
  });
  const original = (await coordinatorRoster(f.ada.token, slot.id)).people.find(
    (row) => row.id === signup.id
  );
  assert.ok(original?.service);
  await volunteerCommand(db, f.ada.token, confirm(original.service));
  await volunteerCommand(
    db,
    f.lee.token,
    consent(await own(f.lee.token, signup.id))
  );
  await db.churchConnection.updateMany({
    where: { userId: f.lee.id, churchId: f.churchA.id },
    data: { state: "REMOVED" }
  });
  const roster = await coordinatorRoster(f.ada.token, slot.id);
  const person = roster.people.find((row) => row.id === signup.id);
  assert.ok(person);
  const receipt = correctionOnly(person.service, "signup", signup.id);
  omitsPrivateFields(person, [
    f.lee.name,
    f.lee.email,
    f.post.id,
    "Fictional completion note"
  ]);
  const correction = confirm(receipt, false);
  const saved = await volunteerCommand(db, f.ada.token, correction);
  assert.equal(saved.id, receipt.target.id);
  assert.equal(saved.version, receipt.version + 1);
  assert.deepEqual(await volunteerCommand(db, f.ada.token, correction), saved);
  const corrected = await own(f.lee.token, signup.id);
  assert.equal(corrected.completed, false);
  assert.equal(corrected.shared, false);
  await denied(volunteerCommand(db, f.ada.token, confirm(corrected)), 404);
  await denied(volunteerCommand(db, f.lee.token, consent(corrected)), 404);
  assert.equal(
    await db.volunteerApplication.count({ where: { userId: f.lee.id } }),
    0
  );
  assert.equal(
    (
      await db.postVolunteerSignup.findUniqueOrThrow({
        where: { id: signup.id }
      })
    ).state,
    "ACTIVE"
  );
  assert.equal(
    (await db.postVolunteerSlot.findUniqueOrThrow({ where: { id: slot.id } }))
      .capacity,
    2
  );
  const revoked = await db.churchCapabilityGrant.updateMany({
    where: {
      churchId: f.churchA.id,
      userId: f.ada.id,
      capability: "MANAGE_CHURCH_VOLUNTEERS",
      revokedAt: null
    },
    data: { revokedAt: new Date() }
  });
  assert.equal(revoked.count, 1);
  await denied(coordinatorRoster(f.ada.token, slot.id), 403);
  await denied(volunteerCommand(db, f.ada.token, correction), 404);
});
