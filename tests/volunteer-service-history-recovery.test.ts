import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  assertPortalTestDatabase,
  createPortalActor,
  seedOperatorGrants
} from "./seed-portal";
import {
  seedVolunteerApplications,
  volunteerAction as action
} from "./seed-volunteer-applications";
import { volunteerCommand } from "../lib/platform/volunteer-commands";
import { readVolunteerServiceHistory } from "../lib/platform/volunteer-service-history";
import {
  replayRetentionControls,
  journalRetentionControls,
  type RetentionControlEntry
} from "../lib/platform/retention-controls";
import { exportVolunteerApplications } from "../lib/platform/volunteer-privacy";
import {
  downloadAccountExport,
  prepareAccountExport
} from "../lib/platform/account-export";
import { accountConfig } from "../lib/platform/account-config";
import { requestPermanentAccountDeletion } from "../lib/platform/account-deletion";
import { eraseRequestedAccountData } from "../lib/platform/account-erasure";
import { createSessionToken } from "../lib/platform/auth";
import { readVolunteerApplications } from "../lib/platform/volunteer-reads";
import { exchangeNeedCommand } from "../lib/platform/exchange-need-commands";
import { exchangeListingCommand } from "../lib/platform/exchange-listings";
import { readExchangeNeeds } from "../lib/platform/exchange-need-reads";
import { NEED_SCHEMA } from "../lib/platform/exchange-need-options";
import { EXCHANGE_ITEM_POLICY } from "../lib/platform/exchange-options";

const db = new PrismaClient();
before(async () => {
  await assertPortalTestDatabase(db);
  await seedOperatorGrants(
    db,
    await createPortalActor(db, "servicerecoveryreview"),
    ["REVIEW_COMMUNITY_REPORTS"]
  );
});
after(() => db.$disconnect());

async function confirmed(timed: boolean) {
  const f = await seedVolunteerApplications(db, timed, 3);
  const applied = await volunteerCommand(db, f.lee.token, f.application());
  await volunteerCommand(
    db,
    f.ada.token,
    action("accept", {
      id: applied.id,
      expectedVersion: applied.version,
      ...f.snapshot
    })
  );
  const application = await db.volunteerApplication.findUniqueOrThrow({
    where: { id: applied.id }
  });
  const target = timed
    ? { targetKind: "signup", targetId: application.signupId! }
    : { targetKind: "application", targetId: application.id };
  const row = () =>
    timed
      ? db.postVolunteerSignup.findUniqueOrThrow({
          where: { id: target.targetId }
        })
      : db.volunteerApplication.findUniqueOrThrow({
          where: { id: target.targetId }
        });
  await volunteerCommand(
    db,
    f.ada.token,
    action("complete", {
      ...target,
      expectedVersion: (await row()).version,
      completed: true,
      reason: "Fictional private completion confirmation"
    })
  );
  let current = await row();
  await volunteerCommand(
    db,
    f.lee.token,
    action("service-visibility", {
      ...target,
      expectedVersion: current.serviceVersion,
      completionVersion: current.completionVersion,
      shared: true
    })
  );
  current = await row();
  const kind = timed
    ? "VOLUNTEER_SERVICE_SIGNUP"
    : "VOLUNTEER_SERVICE_APPLICATION";
  const controls = (
    await db.retentionControl.findMany({
      where: { kind, sourceId: target.targetId },
      orderBy: { version: "asc" }
    })
  ).map((entry) => entry.payload as unknown as RetentionControlEntry);
  return {
    ...f,
    applicationInput: f.application,
    application,
    target,
    row,
    current,
    controls,
    kind
  };
}

for (const timed of [true, false]) {
  test(`${timed ? "timed" : "untimed"} service replay quarantines disclosure without changing completion, assignment or capacity`, async () => {
    const f = await confirmed(timed);
    assert.equal(f.controls.length, 2);
    for (const entry of f.controls) {
      assert.equal(entry.targetId, f.lee.id);
      assert.equal(entry.operatorId, f.lee.id);
      assert.equal(entry.sourceId, f.target.targetId);
      assert.equal(entry.kind, f.kind);
      assert.ok(!JSON.stringify(entry).includes("Fictional private"));
      assert.ok(!JSON.stringify(entry).includes("completedAt"));
      assert.ok(!JSON.stringify(entry).includes("shared"));
    }
    // Model an older source snapshot plus a later protected journal entry.
    // No schema constraint/trigger is disabled to rewind a live service row.
    const protectedEntry = {
      ...f.controls.at(-1)!,
      id: randomUUID(),
      version: f.current.serviceVersion + 2
    };
    const effects = async () => ({
      signupCount: await db.postVolunteerSignup.count({
        where: { userId: f.lee.id }
      }),
      events: await db.volunteerApplicationEvent.count({
        where: { applicationId: f.application.id }
      }),
      audit: await db.postAudit.count({
        where: { targetId: f.target.targetId }
      }),
      notices: await db.socialEvent.count({ where: { recipientId: f.lee.id } })
    });
    const before = await effects();
    await replayRetentionControls(db, [protectedEntry, ...f.controls]);
    const restored = await f.row();
    assert.equal(restored.serviceVersion, protectedEntry.version);
    assert.equal(restored.serviceRecoveryRequired, true);
    assert.equal(restored.serviceSharedAt, null);
    assert.equal(restored.serviceSharedCompletionVersion, null);
    assert.equal(restored.completionNote, "");
    assert.equal(restored.version, f.current.version);
    assert.equal(restored.state, f.current.state);
    assert.equal(restored.completionVersion, f.current.completionVersion);
    assert.equal(
      restored.completedAt?.toISOString(),
      f.current.completedAt?.toISOString()
    );
    assert.deepEqual(await effects(), before);
    const history = await readVolunteerServiceHistory(db, f.lee.token);
    const shown = history.items.find(
      (item) => item.target.id === f.target.targetId
    )!;
    assert.equal(shown.completed, false);
    assert.equal(shown.completedAt, null);
    assert.equal(shown.shared, false);
    assert.equal(shown.recoveryRequired, true);
    const exported = await db.$transaction((tx) =>
      exportVolunteerApplications(tx, f.lee.id, 2000)
    );
    if (!timed)
      assert.ok(
        !JSON.stringify(exported).includes(
          "Fictional private completion confirmation"
        )
      );
    await replayRetentionControls(db, [protectedEntry, ...f.controls]);
    assert.deepEqual(await f.row(), restored);
    assert.deepEqual(await effects(), before);

    await volunteerCommand(
      db,
      f.ada.token,
      action("complete", {
        ...f.target,
        expectedVersion: restored.version,
        completed: true,
        reason: "Fictional deliberate fresh confirmation"
      })
    );
    const rechecked = await f.row();
    assert.equal(rechecked.serviceRecoveryRequired, false);
    assert.equal(rechecked.serviceSharedAt, null);
    assert.equal(rechecked.completionVersion, restored.completionVersion + 1);
    await volunteerCommand(
      db,
      f.lee.token,
      action("service-visibility", {
        ...f.target,
        expectedVersion: rechecked.serviceVersion,
        completionVersion: rechecked.completionVersion,
        shared: true
      })
    );
    const chosen = await f.row();
    await replayRetentionControls(db, [protectedEntry, ...f.controls]);
    assert.deepEqual(await f.row(), chosen);
  });
}

test("absent service sources retain only opaque fences; forged ownership cannot change an existing assignment", async () => {
  const f = await confirmed(true);
  const seed = f.controls.at(-1)!;
  const entries: RetentionControlEntry[] = [
    "VOLUNTEER_SERVICE_SIGNUP",
    "VOLUNTEER_SERVICE_APPLICATION"
  ].map((kind) => ({
    ...seed,
    kind: kind as RetentionControlEntry["kind"],
    id: randomUUID(),
    sourceId: randomUUID(),
    version: 5
  }));
  await replayRetentionControls(db, entries);
  await replayRetentionControls(db, entries);
  for (const entry of entries) {
    assert.equal(
      await db.postVolunteerSignup.count({ where: { id: entry.sourceId } }),
      0
    );
    assert.equal(
      await db.volunteerApplication.count({ where: { id: entry.sourceId } }),
      0
    );
    assert.equal(
      await db.retentionControl.count({
        where: {
          kind: entry.kind,
          sourceId: entry.sourceId,
          version: entry.version
        }
      }),
      1
    );
  }
  await assert.rejects(
    replayRetentionControls(db, [
      { ...seed, id: randomUUID(), version: 9, targetId: f.val.id }
    ])
  );
  assert.deepEqual(await f.row(), f.current);
});

test("legacy completion correction creates a journalable owner-bound control and revokes existing disclosure", async () => {
  const f = await confirmed(true);
  await db.postVolunteerSignup.update({
    where: { id: f.target.targetId },
    data: { completedAt: null, version: { increment: 1 } }
  });
  const corrected = await f.row();
  assert.equal(corrected.completedAt, null);
  assert.equal(corrected.serviceSharedAt, null);
  assert.equal(corrected.serviceRecoveryRequired, true);
  assert.equal(corrected.serviceVersion, f.current.serviceVersion + 1);
  const control = await db.retentionControl.findFirstOrThrow({
    where: {
      kind: f.kind,
      sourceId: f.target.targetId,
      version: corrected.serviceVersion
    }
  });
  const entry = control.payload as unknown as RetentionControlEntry;
  assert.equal(entry.targetId, f.lee.id);
  assert.equal(entry.operatorId, f.lee.id);
  const stored: RetentionControlEntry[] = [];
  const published = await journalRetentionControls(
    db,
    {
      async record(value) {
        stored.push(value);
      }
    },
    f.lee.id
  );
  assert.equal(published.failed, 0);
  assert.equal(published.pending, 0);
  assert.ok(stored.some((value) => value.id === entry.id));
  assert.ok(
    !JSON.stringify(stored).includes(
      "Fictional private completion confirmation"
    )
  );
});

test("account export explicitly includes own completion and consent revisions, with no source/organizer fields or another volunteer's choices", async () => {
  const f = await confirmed(false);
  const other = await volunteerCommand(
    db,
    f.val.token,
    f.applicationInput("Other volunteer private answer")
  );
  const secret = accountConfig().rateSecret;
  const proof = await prepareAccountExport(
    db,
    f.lee.token,
    f.lee.password,
    secret
  );
  const content = await downloadAccountExport(
    db,
    f.lee.token,
    proof.authorization,
    secret
  );
  const exported = JSON.parse(content) as {
    volunteerApplications: Record<string, unknown>[];
  };
  const own = exported.volunteerApplications.find(
    (row) => row.id === f.application.id
  )!;
  assert.equal(own.completedAt, f.current.completedAt!.toISOString());
  assert.equal(own.completionVersion, f.current.completionVersion);
  assert.equal(own.serviceVersion, f.current.serviceVersion);
  assert.equal(own.serviceSharedAt, f.current.serviceSharedAt!.toISOString());
  assert.equal(own.serviceSharedCompletionVersion, f.current.completionVersion);
  assert.equal(own.serviceRecoveryRequired, false);
  assert.equal(own.completionNote, "Fictional private completion confirmation");
  assert.ok(!exported.volunteerApplications.some((row) => row.id === other.id));
  for (const forbidden of [
    "userId",
    "opportunityId",
    "signupId",
    "actorId",
    "coordinatorId",
    "postId"
  ])
    assert.ok(!(forbidden in own));
  assert.ok(
    !JSON.stringify(exported.volunteerApplications).includes(
      "Other volunteer private answer"
    )
  );
  await db.platformPost.update({
    where: { id: f.opportunityPost.id },
    data: { status: "WITHDRAWN", withdrawnAt: new Date() }
  });
  const hidden = await db.$transaction((tx) =>
    exportVolunteerApplications(tx, f.lee.id, 2000)
  );
  assert.equal(hidden[0].current, false);
  assert.equal(hidden[0].completionNote, "");
  assert.deepEqual(hidden[0].history, []);
});

test("timed export retains its one canonical signup receipt rather than copying completion to the application", async () => {
  const f = await confirmed(true);
  const secret = accountConfig().rateSecret;
  const proof = await prepareAccountExport(
    db,
    f.lee.token,
    f.lee.password,
    secret
  );
  const exported = JSON.parse(
    await downloadAccountExport(db, f.lee.token, proof.authorization, secret)
  ) as {
    volunteerSignups: Record<string, unknown>[];
    volunteerApplications: Record<string, unknown>[];
  };
  const signup = exported.volunteerSignups.find(
    (row) => row.id === f.target.targetId
  )!;
  assert.deepEqual(
    Object.keys(signup).sort(),
    [
      "id",
      "slotId",
      "state",
      "completedAt",
      "version",
      "eventVersion",
      "occurrenceVersion",
      "updatedAt",
      "completionVersion",
      "serviceVersion",
      "serviceSharedAt",
      "serviceSharedCompletionVersion",
      "serviceRecoveryRequired"
    ].sort()
  );
  assert.equal(signup.completedAt, f.current.completedAt!.toISOString());
  assert.equal(signup.serviceVersion, f.current.serviceVersion);
  assert.equal(
    signup.serviceSharedCompletionVersion,
    f.current.completionVersion
  );
  assert.equal(
    exported.volunteerApplications.find((row) => row.id === f.application.id)!
      .completedAt,
    null
  );
});

for (const timed of [true, false]) {
  test(`permanent erasure retains anonymous completed ${timed ? "timed" : "untimed"} service, removes consent and releases only unfinished assignments`, async () => {
    const f = await confirmed(timed);
    const unfinished = await volunteerCommand(
      db,
      f.val.token,
      f.applicationInput("Erase unfinished private answer")
    );
    await volunteerCommand(
      db,
      f.ada.token,
      action("accept", {
        id: unfinished.id,
        expectedVersion: unfinished.version,
        ...f.snapshot
      })
    );
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
      await eraseRequestedAccountData(db, deletion.id, journal);
    }
    const completed = await db.volunteerApplication.findUniqueOrThrow({
      where: { id: f.application.id },
      include: { signup: true, events: true }
    });
    const ended = await db.volunteerApplication.findUniqueOrThrow({
      where: { id: unfinished.id }
    });
    assert.equal(completed.state, "ACCEPTED");
    assert.equal(ended.state, "WITHDRAWN");
    for (const row of [completed, ended]) {
      assert.equal(row.userId, null);
      assert.equal(row.statement, "");
      assert.equal(row.availability, "");
      assert.equal(row.decisionNote, "");
      assert.equal(row.completionNote, "");
      assert.equal(row.serviceSharedAt, null);
      assert.equal(row.serviceSharedCompletionVersion, null);
      assert.equal(row.serviceRecoveryRequired, true);
      assert.equal(row.recoveryRequired, true);
    }
    assert.ok(
      completed.events.every(
        (entry) => entry.actorId === null && entry.note === ""
      )
    );
    const receipt = timed ? completed.signup! : completed;
    assert.equal(
      receipt.completedAt?.toISOString(),
      f.current.completedAt!.toISOString()
    );
    assert.equal(receipt.serviceSharedAt, null);
    assert.equal(receipt.serviceRecoveryRequired, true);
    if (timed) {
      assert.equal(receipt.state, "ACTIVE");
      assert.equal(
        await db.postVolunteerSignup.count({
          where: {
            slotId: f.opportunity.slotId!,
            OR: [{ state: "ACTIVE" }, { completedAt: { not: null } }]
          }
        }),
        1
      );
    }
  });
}

test("erasure also preserves a completed church signup without an application and clears its profile consent", async () => {
  const f = await seedVolunteerApplications(db);
  const slot = await f.slot({ role: "Fictional instant volunteer service" });
  const joined = await f.command(f.lee, {
    operation: "volunteer",
    slotId: slot.id,
    slotVersion: slot.version,
    expectedVersion: 0
  });
  const target = { targetKind: "signup", targetId: joined.id };
  await volunteerCommand(
    db,
    f.ada.token,
    action("complete", {
      ...target,
      expectedVersion: joined.version,
      completed: true,
      reason: ""
    })
  );
  const current = await db.postVolunteerSignup.findUniqueOrThrow({
    where: { id: joined.id }
  });
  await volunteerCommand(
    db,
    f.lee.token,
    action("service-visibility", {
      ...target,
      expectedVersion: current.serviceVersion,
      completionVersion: current.completionVersion,
      shared: true
    })
  );
  const journal = { async recordAccount() {}, async completeAccount() {} };
  await requestPermanentAccountDeletion(
    db,
    f.lee.token,
    f.lee.password,
    true,
    createSessionToken(),
    journal
  );
  const deletion = await db.accountDeletion.findUniqueOrThrow({
    where: { userId: f.lee.id }
  });
  await eraseRequestedAccountData(db, deletion.id, journal);
  const row = await db.postVolunteerSignup.findUniqueOrThrow({
    where: { id: joined.id },
    include: { application: true }
  });
  assert.equal(row.application, null);
  assert.equal(
    row.completedAt?.toISOString(),
    current.completedAt!.toISOString()
  );
  assert.equal(row.state, "ACTIVE");
  assert.equal(row.serviceSharedAt, null);
  assert.equal(row.serviceRecoveryRequired, true);
});

test("reconfirmation after service replay cannot re-expose restored completion or correction notes in reads and export", async () => {
  const f = await confirmed(false);
  const oldNotes = [
    "Fictional private completion confirmation",
    "Fictional restored correction note that must not return",
    "Fictional restored reconfirmation note that must not return"
  ];
  for (const [completed, reason] of [
    [false, oldNotes[1]],
    [true, oldNotes[2]]
  ] as const) {
    await volunteerCommand(
      db,
      f.ada.token,
      action("complete", {
        ...f.target,
        expectedVersion: (await f.row()).version,
        completed,
        reason
      })
    );
  }
  const before = await f.row();
  const latestControl = await db.retentionControl.findFirstOrThrow({
    where: { kind: f.kind, sourceId: f.target.targetId },
    orderBy: { version: "desc" }
  });
  const protectedEntry = {
    ...(latestControl.payload as unknown as RetentionControlEntry),
    id: randomUUID(),
    version: before.serviceVersion + 2
  };
  // The database is the older snapshot; the distinct higher entry is the
  // protected journal restored alongside it. No triggers are bypassed.
  await replayRetentionControls(db, [protectedEntry]);
  const restored = await f.row();
  assert.equal(restored.serviceRecoveryRequired, true);
  const freshNote = "Fictional new explicit confirmation remains available";
  await volunteerCommand(
    db,
    f.ada.token,
    action("complete", {
      ...f.target,
      expectedVersion: restored.version,
      completed: true,
      reason: freshNote
    })
  );
  const newlyConfirmed = await f.row();
  await replayRetentionControls(db, [protectedEntry]);
  assert.deepEqual(await f.row(), newlyConfirmed);
  const read = await readVolunteerApplications(db, f.lee.token, {});
  const own = read.items.find((item) => item.id === f.application.id)!;
  const exported = await db.$transaction((tx) =>
    exportVolunteerApplications(tx, f.lee.id, 2000)
  );
  assert.ok(JSON.stringify(own).includes(freshNote));
  assert.ok(JSON.stringify(exported).includes(freshNote));
  assert.deepEqual(
    {
      read: oldNotes.filter((note) => JSON.stringify(own).includes(note)),
      export: oldNotes.filter((note) => JSON.stringify(exported).includes(note))
    },
    { read: [], export: [] },
    "Old protected service notes must not reappear when a new confirmation lifts quarantine"
  );
});

async function linkedNeedService() {
  const f = await seedVolunteerApplications(db, true, 3);
  for (const [userId, capability] of [
    [f.ada.id, "MANAGE_EXCHANGE_LISTINGS"],
    [f.val.id, "MODERATE_EXCHANGE_LISTINGS"]
  ] as const) {
    await db.churchCapabilityGrant.create({
      data: { churchId: f.churchA.id, userId, capability }
    });
  }
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
      title: "Fictional retained volunteer service need",
      description: "One canonical volunteer assignment pool.",
      requestedItems: "Three helpers",
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
      listingVersion: listing.version,
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
        label: "Fictional linked service",
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
  const signups = [];
  for (const actor of [f.lee, f.val]) {
    const applied = await volunteerCommand(db, actor.token, f.application());
    await volunteerCommand(
      db,
      f.ada.token,
      action("accept", {
        id: applied.id,
        expectedVersion: applied.version,
        ...f.snapshot
      })
    );
    const application = await db.volunteerApplication.findUniqueOrThrow({
      where: { id: applied.id }
    });
    signups.push(
      await db.postVolunteerSignup.findUniqueOrThrow({
        where: { id: application.signupId! }
      })
    );
  }
  const [subject, other] = signups;
  const completionNotes = [
    "Fictional subject completion note for protected removal",
    "Fictional subject correction note for protected removal",
    "Fictional subject reconfirmation note for protected removal"
  ];
  let version = subject.version;
  for (const [completed, reason] of [
    [true, completionNotes[0]],
    [false, completionNotes[1]],
    [true, completionNotes[2]]
  ] as const) {
    const receipt = await exchangeNeedCommand(
      db,
      f.ada.token,
      action("complete-volunteer", {
        needId: need.id,
        signupId: subject.id,
        expectedVersion: version,
        completed,
        reason
      })
    );
    version = receipt.version;
  }
  const otherNote = "Fictional different volunteer service note remains";
  await exchangeNeedCommand(
    db,
    f.ada.token,
    action("complete-volunteer", {
      needId: need.id,
      signupId: other.id,
      expectedVersion: other.version,
      completed: true,
      reason: otherNote
    })
  );
  const unrelated = "Fictional general Need update remains";
  const currentNeed = await db.exchangeNeed.findUniqueOrThrow({
    where: { id: need.id }
  });
  await exchangeNeedCommand(
    db,
    f.ada.token,
    action("update", {
      needId: need.id,
      expectedVersion: currentNeed.version,
      text: unrelated
    })
  );
  const events = await db.exchangeNeedEvent.findMany({
    where: { needId: need.id },
    orderBy: { version: "asc" }
  });
  const privateEvents = events.filter(
    (entry) =>
      entry.targetId === subject.id && completionNotes.includes(entry.text)
  );
  assert.equal(
    privateEvents.length,
    3,
    "The real linked completion/correction path must seed the private copied notes"
  );
  assert.ok(privateEvents.every((entry) => entry.actorId === f.ada.id));
  const unaffected = events.filter(
    (entry) => entry.text === otherNote || entry.text === unrelated
  );
  assert.equal(unaffected.length, 2);
  return {
    ...f,
    listing,
    need,
    subject,
    other,
    completionNotes,
    privateEvents,
    unaffected
  };
}

test("linked Need completion notes are scrubbed during service replay without touching unrelated Need history", async () => {
  const f = await linkedNeedService();
  // The public Need update DTO already excludes completion-event actions. This
  // assertion concerns retained private text, not a claimed public-feed leak.
  const detail = await readExchangeNeeds(db, f.val.token, {
    view: "need",
    listingId: f.listing.id
  });
  assert.ok("need" in detail && detail.need);
  assert.ok(
    !f.completionNotes.some((note) => JSON.stringify(detail).includes(note))
  );
  const source = await db.postVolunteerSignup.findUniqueOrThrow({
    where: { id: f.subject.id }
  });
  const control = await db.retentionControl.findFirstOrThrow({
    where: { kind: "VOLUNTEER_SERVICE_SIGNUP", sourceId: source.id },
    orderBy: { version: "desc" }
  });
  const protectedEntry = {
    ...(control.payload as unknown as RetentionControlEntry),
    id: randomUUID(),
    version: source.serviceVersion + 2
  };
  await replayRetentionControls(db, [protectedEntry]);
  const restored = await db.postVolunteerSignup.findUniqueOrThrow({
    where: { id: source.id }
  });
  assert.equal(
    restored.completedAt?.toISOString(),
    source.completedAt?.toISOString()
  );
  assert.equal(restored.state, source.state);
  assert.equal(restored.serviceRecoveryRequired, true);
  const retained = await db.exchangeNeedEvent.findMany({
    where: { id: { in: f.privateEvents.map((entry) => entry.id) } },
    orderBy: { version: "asc" }
  });
  const unaffected = await db.exchangeNeedEvent.findMany({
    where: { id: { in: f.unaffected.map((entry) => entry.id) } },
    orderBy: { version: "asc" }
  });
  assert.deepEqual(unaffected, f.unaffected);
  assert.deepEqual(
    retained.map((entry) => entry.text),
    ["", "", ""],
    "Quarantine must scrub copied service notes, not merely the canonical signup field"
  );
  const freshNote = "Fictional new linked confirmation survives older replay";
  await volunteerCommand(
    db,
    f.ada.token,
    action("complete", {
      targetKind: "signup",
      targetId: source.id,
      expectedVersion: restored.version,
      completed: true,
      reason: freshNote
    })
  );
  const newlyConfirmed = await db.postVolunteerSignup.findUniqueOrThrow({
    where: { id: source.id }
  });
  await replayRetentionControls(db, [protectedEntry]);
  assert.deepEqual(
    await db.postVolunteerSignup.findUniqueOrThrow({
      where: { id: source.id }
    }),
    newlyConfirmed
  );
  assert.equal(
    await db.exchangeNeedEvent.count({
      where: { targetId: source.id, text: freshNote }
    }),
    1
  );
});

test("account erasure scrubs organizer-authored linked service notes and preserves unrelated Need events", async () => {
  const f = await linkedNeedService();
  const journal = { async recordAccount() {}, async completeAccount() {} };
  await requestPermanentAccountDeletion(
    db,
    f.lee.token,
    f.lee.password,
    true,
    createSessionToken(),
    journal
  );
  const deletion = await db.accountDeletion.findUniqueOrThrow({
    where: { userId: f.lee.id }
  });
  await eraseRequestedAccountData(db, deletion.id, journal);
  const receipt = await db.postVolunteerSignup.findUniqueOrThrow({
    where: { id: f.subject.id }
  });
  assert.ok(receipt.completedAt);
  assert.equal(receipt.serviceRecoveryRequired, true);
  assert.equal(receipt.completionNote, "");
  const retained = await db.exchangeNeedEvent.findMany({
    where: { id: { in: f.privateEvents.map((entry) => entry.id) } },
    orderBy: { version: "asc" }
  });
  const unaffected = await db.exchangeNeedEvent.findMany({
    where: { id: { in: f.unaffected.map((entry) => entry.id) } },
    orderBy: { version: "asc" }
  });
  assert.deepEqual(unaffected, f.unaffected);
  assert.deepEqual(
    retained.map((entry) => entry.text),
    ["", "", ""],
    "Deleting the volunteer must clear service notes even when their actor is the organizer"
  );
});
