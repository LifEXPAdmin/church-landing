import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import {
  assertPortalTestDatabase,
  createPortalActor,
  seedOperatorGrants,
  type PortalActor
} from "./seed-portal";
import {
  seedVolunteerApplications,
  volunteerAction as action
} from "./seed-volunteer-applications";
import { volunteerCommand } from "../lib/platform/volunteer-commands";
import { handleVolunteerRequest } from "../lib/platform/volunteer-boundary";
import { readVolunteers } from "../lib/platform/volunteer-reads";
import { accountConfig } from "../lib/platform/account-config";
import { exportVolunteerApplications } from "../lib/platform/volunteer-privacy";
import { getCalendarCommitments } from "../lib/platform/calendar-reads";
import { PortalError } from "../lib/platform/portal-policy";
import {
  replayRetentionControls,
  type RetentionControlEntry
} from "../lib/platform/retention-controls";
import {
  prepareAccountExport,
  downloadAccountExport
} from "../lib/platform/account-export";
import { requestPermanentAccountDeletion } from "../lib/platform/account-deletion";
import { eraseRequestedAccountData } from "../lib/platform/account-erasure";
import { createSessionToken } from "../lib/platform/auth";

const db = new PrismaClient();
const priorReportsEnabled = process.env.COMMUNITY_REPORTS_ENABLED;
before(async () => {
  await assertPortalTestDatabase(db);
  process.env.COMMUNITY_REPORTS_ENABLED = "true";
  const reviewer = await createPortalActor(db, "availreview");
  await seedOperatorGrants(db, reviewer, ["REVIEW_COMMUNITY_REPORTS"]);
});
after(async () => {
  await db.$disconnect();
  if (priorReportsEnabled === undefined)
    delete process.env.COMMUNITY_REPORTS_ENABLED;
  else process.env.COMMUNITY_REPORTS_ENABLED = priorReportsEnabled;
});

const denied = (promise: Promise<unknown>, status: number) =>
  assert.rejects(
    promise,
    (error) => error instanceof PortalError && error.status === status
  );
const application = (id: string) =>
  db.volunteerApplication.findUniqueOrThrow({
    where: { id },
    include: { signup: true, events: { orderBy: { version: "asc" } } }
  });
const change = (id: string, expectedVersion: number, availability: unknown) =>
  action("availability", { id, expectedVersion, availability });
async function own(actor: PortalActor, id: string) {
  const result = await readVolunteers(db, actor.token, {
    view: "applications"
  });
  assert.equal(result.view, "applications");
  if (result.view !== "applications") throw Error("Expected applications");
  const row = result.items.find((item) => item.id === id);
  assert.ok(row);
  return row;
}
async function exported(actor: PortalActor) {
  return db.$transaction((tx) =>
    exportVolunteerApplications(tx, actor.id, 2000)
  );
}

test("availability is optional and bounded without truncation, and normalizes textarea newlines", async () => {
  const f = await seedVolunteerApplications(db, false, 2);
  for (const availability of ["x".repeat(501), 17]) {
    await denied(
      volunteerCommand(db, f.lee.token, {
        ...f.application(),
        availability
      }),
      400
    );
  }
  assert.equal(
    await db.volunteerApplication.count({
      where: { opportunityId: f.opportunity.id }
    }),
    0
  );
  const value = "x".repeat(498) + "\r\ny";
  const saved = await volunteerCommand(db, f.lee.token, {
    ...f.application(),
    availability: value
  });
  assert.equal(
    (await application(saved.id)).availability,
    "x".repeat(498) + "\ny"
  );
  const optional = await volunteerCommand(db, f.val.token, f.application());
  assert.equal((await application(optional.id)).availability, "");
  const before = await application(saved.id);
  for (const invalid of ["x".repeat(501), null]) {
    await denied(
      volunteerCommand(db, f.lee.token, change(saved.id, 1, invalid)),
      400
    );
  }
  assert.deepEqual(await application(saved.id), before);
  await volunteerCommand(db, f.lee.token, change(saved.id, 1, " \r\n "));
  assert.equal((await application(saved.id)).availability, "");
});

test("only the applicant and current coordinators receive availability, including on a public opportunity", async () => {
  const f = await seedVolunteerApplications(db, false, 2);
  await db.platformPost.update({
    where: { id: f.opportunityPost.id },
    data: { audience: "PUBLIC" }
  });
  const leeAvailability = "Fictional Lee availability: Tuesday evenings";
  const valAvailability = "Fictional Val availability: Friday mornings";
  const a = await volunteerCommand(db, f.lee.token, {
    ...f.application(),
    availability: leeAvailability
  });
  await volunteerCommand(db, f.val.token, {
    ...f.application(),
    availability: valAvailability
  });
  const mine = await own(f.lee, a.id);
  assert.equal(mine.availability, leeAvailability);
  assert.equal(mine.canEditAvailability, true);
  assert.equal(mine.canClearAvailability, true);
  assert.ok(
    !JSON.stringify(
      await readVolunteers(db, f.lee.token, {
        view: "applications"
      })
    ).includes(valAvailability)
  );
  const queue = await readVolunteers(db, f.ada.token, {
    view: "applications",
    id: f.opportunity.id
  });
  assert.equal(queue.view, "applications");
  if (queue.view !== "applications")
    throw Error("Expected coordinator applications");
  assert.deepEqual(
    queue.items.map((row) => row.availability).sort(),
    [leeAvailability, valAvailability].sort()
  );
  assert.ok(
    queue.items.every(
      (row) => !row.canEditAvailability && !row.canClearAvailability
    )
  );
  for (const token of [f.lee.token, f.ada.token, f.blake.token, undefined]) {
    const list = await readVolunteers(db, token, {
      view: "list",
      churchId: f.churchA.id
    });
    assert.equal(list.view, "list");
    if (list.view !== "list") throw Error("Expected public list");
    assert.ok(list.items.some((row) => row.id === f.opportunity.id));
    assert.ok(!JSON.stringify(list).includes(leeAvailability));
    assert.ok(!JSON.stringify(list).includes(valAvailability));
  }
  for (const token of [f.blake.token, undefined]) {
    const detail = await readVolunteers(db, token, {
      view: "opportunity",
      id: f.opportunity.id
    });
    assert.equal(detail.view, "opportunity");
    if (detail.view !== "opportunity")
      throw Error("Expected public opportunity");
    assert.equal(detail.application, null);
    assert.ok(!JSON.stringify(detail).includes(leeAvailability));
  }
  await denied(
    readVolunteers(db, f.lee.token, {
      view: "applications",
      id: f.opportunity.id
    }),
    404
  );
  await denied(readVolunteers(db, undefined, { view: "applications" }), 401);
  for (const token of [f.val.token, f.ada.token])
    await denied(
      volunteerCommand(db, token, change(a.id, 1, "Unauthorized edit")),
      404
    );
  const origin = accountConfig().origin;
  const guest = await handleVolunteerRequest(
    db,
    new Request(origin + "/api/platform/volunteers", {
      method: "POST",
      headers: {
        origin,
        "content-type": "application/json",
        "x-expected-account": f.lee.id
      },
      body: JSON.stringify(change(a.id, 1, "Guest edit"))
    })
  );
  assert.equal(guest.status, 401);
  await db.churchCapabilityGrant.deleteMany({
    where: {
      churchId: f.churchA.id,
      userId: f.ada.id,
      capability: "MANAGE_CHURCH_VOLUNTEERS"
    }
  });
  await denied(
    readVolunteers(db, f.ada.token, {
      view: "applications",
      id: f.opportunity.id
    }),
    404
  );
  assert.equal((await application(a.id)).availability, leeAvailability);
});

test("availability edits preserve canonical capacity and calendars with exact retries and stale-version rejection", async () => {
  const f = await seedVolunteerApplications(db);
  const a = await volunteerCommand(db, f.lee.token, {
    ...f.application(),
    availability: "Fictional original availability"
  });
  const accepted = await volunteerCommand(
    db,
    f.ada.token,
    action("accept", {
      id: a.id,
      expectedVersion: a.version,
      ...f.snapshot
    })
  );
  const range = {
    from: f.occurrence.startLocal.slice(0, 10),
    until: new Date(f.occurrence.endAt.getTime() + 86400000)
      .toISOString()
      .slice(0, 10),
    timeZone: "UTC"
  };
  const unchanged = async () => ({
    signups: await db.postVolunteerSignup.findMany({
      where: { slotId: f.opportunity.slotId! }
    }),
    slot: await db.postVolunteerSlot.findUniqueOrThrow({
      where: { id: f.opportunity.slotId! }
    }),
    occurrence: await db.calendarOccurrence.findUniqueOrThrow({
      where: { id: f.occurrence.id }
    }),
    commitments: await getCalendarCommitments(db, f.lee.token, range)
  });
  const before = await unchanged();
  const value = "Fictional revised availability without moving the shift";
  const input = change(a.id, accepted.version, value);
  const saved = await volunteerCommand(db, f.lee.token, input);
  assert.equal(saved.version, accepted.version + 1);
  assert.deepEqual(await volunteerCommand(db, f.lee.token, input), saved);
  await denied(
    volunteerCommand(db, f.lee.token, {
      ...input,
      availability: "Changed retry body"
    }),
    409
  );
  await denied(
    volunteerCommand(
      db,
      f.lee.token,
      change(a.id, accepted.version, "Stale form")
    ),
    409
  );
  const row = await application(a.id);
  assert.equal(row.availability, value);
  assert.equal(row.state, "ACCEPTED");
  assert.equal(
    row.events.filter((event) => event.action === "AVAILABILITY_UPDATED")
      .length,
    1
  );
  assert.ok(row.events.every((event) => event.note === ""));
  const metadata = await Promise.all([
    db.socialOperation.findMany({ where: { ownerId: f.lee.id } }),
    db.retentionControl.findMany({
      where: { kind: "VOLUNTEER_APPLICATION", sourceId: a.id }
    })
  ]);
  assert.ok(!JSON.stringify(metadata).includes(value));
  assert.equal((await own(f.lee, a.id)).canEditAvailability, true);
  await volunteerCommand(
    db,
    f.lee.token,
    change(a.id, saved.version, "Fictional latest availability")
  );
  await denied(volunteerCommand(db, f.lee.token, input), 409);
  assert.deepEqual(await unchanged(), before);
});

test("revoked source membership hides availability and denies old or new writes while allowing an exact clear retry", async () => {
  const f = await seedVolunteerApplications(db, false);
  const a = await volunteerCommand(db, f.lee.token, f.application());
  const value = "Fictional availability revoked from coordinator view";
  const input = change(a.id, 1, value);
  const saved = await volunteerCommand(db, f.lee.token, input);
  await db.churchConnection.update({
    where: { userId_churchId: { userId: f.lee.id, churchId: f.churchA.id } },
    data: { state: "REMOVED" }
  });
  const receipt = await own(f.lee, a.id);
  assert.equal(receipt.current, false);
  assert.equal(receipt.availability, "");
  assert.equal(receipt.canEditAvailability, false);
  assert.equal(receipt.canClearAvailability, true);
  assert.ok(!JSON.stringify(await exported(f.lee)).includes(value));
  const queue = await readVolunteers(db, f.ada.token, {
    view: "applications",
    id: f.opportunity.id
  });
  assert.equal(queue.view, "applications");
  if (queue.view !== "applications")
    throw Error("Expected coordinator applications");
  assert.equal(queue.items.length, 0);
  await denied(volunteerCommand(db, f.lee.token, input), 404);
  await denied(
    volunteerCommand(
      db,
      f.lee.token,
      change(a.id, saved.version, "New after revocation")
    ),
    404
  );
  const clear = change(a.id, saved.version, "");
  const cleared = await volunteerCommand(db, f.lee.token, clear);
  assert.deepEqual(await volunteerCommand(db, f.lee.token, clear), cleared);
  assert.equal((await application(a.id)).availability, "");
  assert.equal((await own(f.lee, a.id)).canClearAvailability, false);
  await db.churchConnection.update({
    where: { userId_churchId: { userId: f.lee.id, churchId: f.churchA.id } },
    data: { state: "APPROVED" }
  });
  assert.equal((await own(f.lee, a.id)).availability, "");
});

test("decline, withdrawal and canonical cancellation clear availability, and terminal writes cannot restore it", async () => {
  for (const operation of ["decline", "withdraw", "cancel"] as const) {
    const f = await seedVolunteerApplications(db, operation === "cancel");
    const a = await volunteerCommand(db, f.lee.token, {
      ...f.application(),
      availability: "Fictional availability for an ended application"
    });
    let version = a.version;
    if (operation === "cancel") {
      version = (
        await volunteerCommand(
          db,
          f.ada.token,
          action("accept", {
            id: a.id,
            expectedVersion: version,
            ...f.snapshot
          })
        )
      ).version;
    }
    const ended = await volunteerCommand(
      db,
      operation === "withdraw" ? f.lee.token : f.ada.token,
      action(operation, {
        id: a.id,
        expectedVersion: version,
        ...(operation === "decline" ? { note: "No opening" } : {})
      })
    );
    const row = await application(a.id);
    assert.equal(row.availability, "", operation);
    assert.equal(row.state, operation === "decline" ? "DECLINED" : "WITHDRAWN");
    if (operation === "cancel") assert.equal(row.signup?.state, "CANCELED");
    // Database protection also scrubs an older copy or imported terminal row.
    await db.volunteerApplication.update({
      where: { id: a.id },
      data: { availability: "Fictional obsolete terminal availability" }
    });
    const receipt = await own(f.lee, a.id);
    assert.equal(receipt.availability, "");
    assert.equal(receipt.canEditAvailability, false);
    assert.equal(receipt.canClearAvailability, false);
    assert.equal((await application(a.id)).availability, "");
    await denied(
      volunteerCommand(
        db,
        f.lee.token,
        change(a.id, ended.version, "Cannot reopen")
      ),
      404
    );
    await volunteerCommand(db, f.lee.token, change(a.id, ended.version, ""));
    assert.equal((await application(a.id)).availability, "");
  }
});

test("canceled or completed canonical assignments conceal availability and permit removal without changing the signup", async () => {
  for (const state of ["CANCELED", "COMPLETED"] as const) {
    const f = await seedVolunteerApplications(db);
    const value = "Fictional availability for ended canonical help";
    const a = await volunteerCommand(db, f.lee.token, {
      ...f.application(),
      availability: value
    });
    const accepted = await volunteerCommand(
      db,
      f.ada.token,
      action("accept", {
        id: a.id,
        expectedVersion: a.version,
        ...f.snapshot
      })
    );
    const row = await application(a.id);
    // Exercise the canonical signup guard even when an older application row
    // still says ACCEPTED; neither the read nor an exact command may trust it.
    const signup = await db.postVolunteerSignup.update({
      where: { id: row.signupId! },
      data:
        state === "CANCELED"
          ? { state: "CANCELED" }
          : { completedAt: new Date() }
    });
    const receipt = await own(f.lee, a.id);
    assert.equal(receipt.availability, "", state);
    assert.equal(receipt.canEditAvailability, false, state);
    assert.equal(receipt.canClearAvailability, true, state);
    assert.ok(!JSON.stringify(await exported(f.lee)).includes(value), state);
    await denied(
      volunteerCommand(
        db,
        f.lee.token,
        change(a.id, accepted.version, "New ended availability")
      ),
      404
    );
    await volunteerCommand(db, f.lee.token, change(a.id, accepted.version, ""));
    const cleared = await application(a.id);
    assert.equal(cleared.availability, "");
    assert.equal(cleared.state, "ACCEPTED");
    assert.deepEqual(cleared.signup, signup);
  }
});

test("protected replay removes older availability and history text, and recovery permits only cleanup", async () => {
  const f = await seedVolunteerApplications(db);
  const a = await volunteerCommand(db, f.lee.token, {
    ...f.application(),
    availability: "Fictional old availability from a restored copy"
  });
  const accepted = await volunteerCommand(
    db,
    f.ada.token,
    action("accept", {
      id: a.id,
      expectedVersion: a.version,
      ...f.snapshot
    })
  );
  const cleared = await volunteerCommand(
    db,
    f.lee.token,
    change(a.id, accepted.version, "")
  );
  const control = await db.retentionControl.findFirstOrThrow({
    where: {
      kind: "VOLUNTEER_APPLICATION",
      sourceId: a.id,
      version: cleared.version
    }
  });
  await db.volunteerApplication.update({
    where: { id: a.id },
    data: {
      version: accepted.version,
      availability: "Fictional old availability from a restored copy"
    }
  });
  await db.volunteerApplicationEvent.updateMany({
    where: { applicationId: a.id },
    data: { note: "Fictional obsolete private history text" }
  });
  await replayRetentionControls(db, [
    control.payload as unknown as RetentionControlEntry
  ]);
  const restored = await application(a.id);
  assert.equal(restored.recoveryRequired, true);
  assert.equal(restored.state, "WITHDRAWN");
  assert.equal(restored.availability, "");
  assert.equal(restored.signup?.state, "CANCELED");
  assert.ok(restored.events.every((event) => event.note === ""));
  assert.deepEqual((await own(f.lee, a.id)).history, []);
  assert.ok(
    !JSON.stringify(await exported(f.lee)).includes(
      "Fictional old availability"
    )
  );
  await denied(
    volunteerCommand(
      db,
      f.lee.token,
      change(a.id, restored.version, "Cannot restore preference")
    ),
    404
  );
  // Older recovery writers cannot reintroduce text, and explicit empty cleanup
  // remains permitted even though the database already scrubbed that text.
  await db.volunteerApplication.update({
    where: { id: a.id },
    data: { availability: "Fictional recovery remnant" }
  });
  assert.equal((await own(f.lee, a.id)).canClearAvailability, false);
  assert.equal((await application(a.id)).availability, "");
  await volunteerCommand(db, f.lee.token, change(a.id, restored.version, ""));
  assert.equal((await application(a.id)).availability, "");
});

test("the real account export includes only owned availability and erasure removes it without changing another applicant", async () => {
  const f = await seedVolunteerApplications(db, false, 2);
  const mine = "Fictional export-only Lee availability";
  const other = "Fictional other applicant availability";
  const a = await volunteerCommand(db, f.lee.token, {
    ...f.application(),
    availability: mine
  });
  const b = await volunteerCommand(db, f.val.token, {
    ...f.application(),
    availability: other
  });
  const otherBefore = await application(b.id);
  const secret = process.env.AUTH_RATE_LIMIT_SECRET!;
  const proof = await prepareAccountExport(
    db,
    f.lee.token,
    f.lee.password,
    secret
  );
  const archive = JSON.stringify(
    await downloadAccountExport(db, f.lee.token, proof.authorization, secret)
  );
  assert.ok(archive.includes(mine));
  assert.ok(!archive.includes(other));
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
  const erased = await application(a.id);
  assert.equal(erased.userId, null);
  assert.equal(erased.availability, "");
  assert.equal(erased.recoveryRequired, true);
  assert.ok(erased.events.every((event) => !event.actorId && !event.note));
  assert.deepEqual(await application(b.id), otherBefore);
});

test("compatible older lifecycle writers scrub availability while preserving source identity and unrelated current applications", async () => {
  const f = await seedVolunteerApplications(db, false, 4);
  const value = "Fictional private availability unknown to an older writer";
  const submit = (actor: PortalActor) =>
    volunteerCommand(db, actor.token, {
      ...f.application("Fictional retained application answer"),
      availability: value
    });
  const terminal = await submit(f.lee);
  const recovery = await submit(f.val);
  const erasure = await submit(f.morgan);
  const current = await submit(f.ada);
  const untouched = await application(current.id);
  const sourceBefore = await db.volunteerOpportunity.findUniqueOrThrow({
    where: { id: f.opportunity.id }
  });
  const identity = (row: Awaited<ReturnType<typeof application>>) => ({
    id: row.id,
    opportunityId: row.opportunityId,
    signupId: row.signupId,
    opportunityVersion: row.opportunityVersion,
    slotVersion: row.slotVersion,
    eventVersion: row.eventVersion,
    occurrenceVersion: row.occurrenceVersion,
    createdAt: row.createdAt
  });

  // These lifecycle updates deliberately omit the availability column, as the
  // compatible application did before that column existed.
  const beforeTerminal = await application(terminal.id);
  await db.volunteerApplication.update({
    where: { id: terminal.id },
    data: {
      state: "DECLINED",
      decisionNote: "Fictional decline decision",
      version: { increment: 1 }
    }
  });
  const declined = await application(terminal.id);
  assert.equal(declined.availability, "");
  assert.equal(declined.statement, beforeTerminal.statement);
  assert.equal(declined.decisionNote, "Fictional decline decision");
  assert.deepEqual(identity(declined), identity(beforeTerminal));
  const reapplied = await volunteerCommand(db, f.lee.token, {
    ...f.application(),
    expectedVersion: declined.version,
    availability: value
  });
  assert.equal((await application(reapplied.id)).availability, value);
  await db.volunteerApplication.update({
    where: { id: reapplied.id },
    data: { state: "WITHDRAWN", version: { increment: 1 } }
  });
  const withdrawn = await application(reapplied.id);
  assert.equal(withdrawn.availability, "");
  assert.deepEqual(identity(withdrawn), identity(beforeTerminal));

  const beforeRecovery = await application(recovery.id);
  await db.volunteerApplication.update({
    where: { id: recovery.id },
    data: {
      version: beforeRecovery.version + 1,
      recoveryRequired: true,
      state: "WITHDRAWN",
      statement: "",
      decisionNote: ""
    }
  });
  const quarantined = await application(recovery.id);
  assert.equal(quarantined.availability, "");
  assert.equal(quarantined.userId, f.val.id);
  assert.deepEqual(identity(quarantined), identity(beforeRecovery));

  const beforeErasure = await application(erasure.id);
  await db.volunteerApplication.updateMany({
    where: { userId: f.morgan.id },
    data: {
      userId: null,
      statement: "",
      decisionNote: "",
      recoveryRequired: true,
      version: { increment: 1 }
    }
  });
  const anonymized = await application(erasure.id);
  assert.equal(anonymized.userId, null);
  assert.equal(anonymized.availability, "");
  assert.deepEqual(identity(anonymized), identity(beforeErasure));

  const imported = await db.volunteerApplication.create({
    data: {
      opportunityId: f.opportunity.id,
      userId: null,
      recoveryRequired: true,
      availability: value,
      statement: "Fictional restored receipt"
    }
  });
  assert.equal(imported.availability, "");
  assert.equal(imported.statement, "Fictional restored receipt");
  assert.equal(imported.opportunityId, f.opportunity.id);
  assert.deepEqual(await application(current.id), untouched);
  assert.deepEqual(
    await db.volunteerOpportunity.findUniqueOrThrow({
      where: { id: f.opportunity.id }
    }),
    sourceBefore
  );
});
