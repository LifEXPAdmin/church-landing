import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient, type Prisma } from "@prisma/client";
import { assertPortalTestDatabase } from "./seed-portal";
import { seedInterchurchHelp, helpAction } from "./seed-interchurch-help";
import { interchurchHelpCommand as command } from "../lib/platform/interchurch-help-commands";
import { readInterchurchHelp as read } from "../lib/platform/interchurch-help-reads";
import { PortalError } from "../lib/platform/portal-policy";
import {
  exportHelp,
  helpOfferEvidence
} from "../lib/platform/interchurch-help-retention";
import {
  replayRetentionControls,
  type RetentionControlEntry
} from "../lib/platform/retention-controls";
import { calendarCommand } from "../lib/platform/calendar-commands";
import { helpScheduleChoices } from "../lib/platform/interchurch-help-schedule";

const db = new PrismaClient();
before(() => assertPortalTestDatabase(db));
after(() => db.$disconnect());
type Fixture = Awaited<ReturnType<typeof seedInterchurchHelp>>;
type Agreement = Awaited<ReturnType<Fixture["agreement"]>>;
const fields = (a: Agreement) => a.terms as Record<string, unknown>;
const deny = (promise: Promise<unknown>, status = 409) =>
  assert.rejects(
    promise,
    (error: unknown) => error instanceof PortalError && error.status === status
  );
const unavailable = (promise: Promise<unknown>) =>
  assert.rejects(
    promise,
    (error: unknown) =>
      error instanceof PortalError && [404, 409].includes(error.status)
  );
function needsReview(a: Agreement) {
  assert.equal(a.state, "NEEDS_REVIEW");
  assert.equal(a.requesterAcknowledged, null);
  assert.equal(a.responderAcknowledged, null);
  assert.equal(a.requesterContact, "");
  assert.equal(a.responderContact, "");
}
async function shareContacts(f: Fixture, offerId: string) {
  for (const [actor, contact] of [
    [f.manager, "fictional-requester@example.test"],
    [f.responder, "fictional-responder@example.test"]
  ] as const) {
    const a = await f.agreement(offerId);
    await command(
      db,
      actor.token,
      helpAction("contact", {
        offerId,
        expectedVersion: a.version,
        termsVersion: a.termsVersion,
        consent: true,
        contact
      })
    );
  }
}

test("link and unlink require fresh bilateral consent and never reserve participation", async () => {
  const f = await seedInterchurchHelp(db),
    offerId = await f.offer();
  await shareContacts(f, offerId);
  const before = await f.agreement(offerId),
    participation = await f.participation();
  const choice = await f.choice(offerId);
  assert.notEqual(fields(before).startLocal, choice.startLocal);
  await f.link(offerId, choice);
  const linked = await f.agreement(offerId);
  needsReview(linked);
  assert.ok(
    linked.version > before.version && linked.termsVersion > before.termsVersion
  );
  assert.equal(fields(linked).startLocal, choice.startLocal);
  assert.equal(fields(linked).endLocal, choice.endLocal);
  assert.equal(fields(linked).timeZone, choice.timeZone);
  assert.ok(fields(linked).schedule);
  await f.acknowledge(offerId, f.manager);
  assert.equal((await f.agreement(offerId)).state, "NEEDS_REVIEW");
  await f.acknowledge(offerId, f.responder);
  assert.equal((await f.agreement(offerId)).state, "CONFIRMED");
  await f.link(offerId, null);
  const unlinked = await f.agreement(offerId);
  needsReview(unlinked);
  assert.ok(!fields(unlinked).schedule);
  assert.equal(
    fields(unlinked).startLocal,
    choice.startLocal,
    "Unlink preserves the last reviewed time"
  );
  assert.deepEqual(await f.participation(), participation);
});

test("link commands pin agreement and schedule, reject malformed inputs, and retry exactly once", async () => {
  const f = await seedInterchurchHelp(db),
    offerId = await f.offer();
  const choice = await f.choice(offerId),
    body = await f.linkInput(offerId, choice);
  const before = await f.agreement(offerId);
  await deny(
    command(db, f.manager.token, { ...body, acceptTerms: false }),
    400
  );
  await deny(
    command(db, f.manager.token, {
      ...body,
      schedule: {
        kind: choice.kind,
        id: choice.id,
        fingerprint: choice.fingerprint,
        unexpected: true
      }
    }),
    400
  );
  await deny(
    command(db, f.manager.token, {
      ...body,
      schedule: { kind: "EVENT", id: choice.id, fingerprint: "0".repeat(64) }
    })
  );
  await deny(command(db, f.outsider.token, body), 404);
  assert.deepEqual(await f.agreement(offerId), before);
  const receipt = await command(db, f.manager.token, body);
  const linked = await f.agreement(offerId);
  assert.deepEqual(await command(db, f.manager.token, body), receipt);
  assert.deepEqual(
    await f.agreement(offerId),
    linked,
    "Replay must not create another terms version"
  );
  await deny(command(db, f.manager.token, { ...body, schedule: null }));
  await deny(
    command(
      db,
      f.manager.token,
      helpAction("link-schedule", {
        offerId,
        expectedVersion: before.version,
        requestTermsVersion: before.requestTermsVersion,
        acceptTerms: true,
        schedule: null
      })
    )
  );
});

test("material event edit invalidates contact and acknowledgments without silently moving agreed time", async () => {
  const f = await seedInterchurchHelp(db),
    offerId = await f.offer();
  await f.link(offerId, await f.choice(offerId));
  await f.confirm(offerId);
  await shareContacts(f, offerId);
  const before = await f.agreement(offerId),
    participation = await f.participation();
  await f.editOccurrence();
  const stale = await f.agreement(offerId);
  needsReview(stale);
  assert.ok(stale.termsVersion > before.termsVersion);
  assert.equal(fields(stale).startLocal, fields(before).startLocal);
  assert.equal(fields(stale).endLocal, fields(before).endLocal);
  await deny(f.acknowledge(offerId, f.manager));
  await deny(
    command(
      db,
      f.responder.token,
      helpAction("contact", {
        offerId,
        expectedVersion: stale.version,
        termsVersion: stale.termsVersion,
        consent: true,
        contact: "must-not-disclose@example.test"
      })
    )
  );
  await deny(
    command(
      db,
      f.manager.token,
      helpAction("complete", {
        offerId,
        expectedVersion: stale.version,
        reason: "Not current accepted help"
      })
    )
  );
  const current = await f.choice(offerId);
  assert.notEqual(current.startLocal, fields(before).startLocal);
  await f.link(offerId, current);
  await f.confirm(offerId);
  assert.equal(
    fields(await f.agreement(offerId)).startLocal,
    current.startLocal
  );
  assert.deepEqual(await f.participation(), participation);
});

test("editing a sibling occurrence preserves the linked occurrence's current agreement", async () => {
  const f = await seedInterchurchHelp(db),
    offerId = await f.offer();
  const original = await f.choice(offerId);
  await f.link(offerId, original);
  await f.confirm(offerId);
  await shareContacts(f, offerId);
  const before = await f.agreement(offerId);
  await f.editOccurrence(f.occurrences[1].id);
  assert.deepEqual(await f.agreement(offerId), before);
  assert.equal((await f.choice(offerId)).fingerprint, original.fingerprint);
});

test("independent shift edit and parent cancellation both invalidate linked help", async () => {
  const f = await seedInterchurchHelp(db),
    offerId = await f.offer();
  const choice = await f.choice(offerId, "VOLUNTEER_SLOT");
  assert.notEqual(
    choice.endLocal,
    f.occurrence.endLocal,
    "The selected source is the independent shift"
  );
  await f.link(offerId, choice);
  await f.confirm(offerId);
  const before = await f.agreement(offerId),
    participation = await f.participation();
  await f.editSlot();
  const stale = await f.agreement(offerId);
  needsReview(stale);
  assert.equal(fields(stale).startLocal, fields(before).startLocal);
  await deny(f.acknowledge(offerId, f.responder));
  await f.link(offerId, await f.choice(offerId, "VOLUNTEER_SLOT"));
  await f.confirm(offerId);
  await f.cancelOccurrence();
  needsReview(await f.agreement(offerId));
  assert.equal((await f.choices(offerId, "VOLUNTEER_SLOT")).length, 0);
  await unavailable(f.acknowledge(offerId, f.manager));
  assert.deepEqual(await f.participation(), participation);
});

test("series cancellation and independent role closure cannot keep linked commitments confirmed", async () => {
  for (const kind of ["EVENT", "VOLUNTEER_SLOT"] as const) {
    const f = await seedInterchurchHelp(db),
      offerId = await f.offer();
    await f.link(offerId, await f.choice(offerId, kind));
    await f.confirm(offerId);
    if (kind === "EVENT") await f.cancelOccurrence("SERIES");
    else await f.editSlot(0, true);
    needsReview(await f.agreement(offerId));
    assert.equal((await f.choices(offerId, kind)).length, 0);
    await unavailable(f.acknowledge(offerId, f.responder));
  }
});

test("choice disclosure requires both named participants' source access and preserves public privacy", async () => {
  const f = await seedInterchurchHelp(db),
    offerId = await f.offer();
  const choice = await f.choice(offerId);
  await f.link(offerId, choice);
  await f.confirm(offerId);
  await shareContacts(f, offerId);
  await db.churchConnection.update({
    where: {
      userId_churchId: { userId: f.responder.id, churchId: f.church.id }
    },
    data: { state: "REMOVED", version: { increment: 1 } }
  });
  const choices = await f.choices(offerId);
  assert.ok(!JSON.stringify(choices).includes(choice.id));
  assert.ok(!JSON.stringify(choices).includes(choice.title));
  const privateRead = await read(db, f.manager.token, {
    view: "offer",
    id: offerId
  });
  const text = JSON.stringify(privateRead);
  assert.ok(!text.includes("fictional-responder@example.test"));
  assert.ok(
    !text.includes(choice.id),
    "Source IDs do not bypass the second participant's current access"
  );
  const a = await f.agreement(offerId);
  await unavailable(
    command(
      db,
      f.manager.token,
      helpAction("contact", {
        offerId,
        expectedVersion: a.version,
        termsVersion: a.termsVersion,
        consent: true,
        contact: "forbidden@example.test"
      })
    )
  );
  const publicRead = await read(db, null, {
    view: "request",
    id: f.request.id
  });
  assert.ok(!JSON.stringify(publicRead).includes(choice.id));
  await deny(
    read(db, f.outsider.token, {
      view: "schedule",
      id: offerId,
      category: "EVENT"
    }),
    404
  );
});

test("a valid schedule from another requesting church cannot be reused by guessed reference", async () => {
  const f = await seedInterchurchHelp(db),
    other = await seedInterchurchHelp(db);
  const offerId = await f.offer(),
    otherOffer = await other.offer();
  const foreign = await other.choice(otherOffer),
    before = await f.agreement(offerId);
  await unavailable(f.link(offerId, foreign));
  assert.deepEqual(await f.agreement(offerId), before);
});

test("ordinary agreement amendments preserve the link and cannot independently change canonical time", async () => {
  const f = await seedInterchurchHelp(db),
    offerId = await f.offer();
  await f.link(offerId, await f.choice(offerId));
  const before = await f.confirm(offerId);
  const { schedule, ...terms } = fields(before);
  await command(
    db,
    f.manager.token,
    helpAction("amend", {
      offerId,
      expectedVersion: before.version,
      requestTermsVersion: before.requestTermsVersion,
      schema: 1,
      terms: { ...terms, duties: "Updated adult-only microphone duties." },
      acceptTerms: true
    })
  );
  const amended = await f.agreement(offerId);
  assert.deepEqual(fields(amended).schedule, schedule);
  await deny(
    command(
      db,
      f.manager.token,
      helpAction("amend", {
        offerId,
        expectedVersion: amended.version,
        requestTermsVersion: amended.requestTermsVersion,
        schema: 1,
        terms: { ...terms, startLocal: f.terms.startLocal },
        acceptTerms: true
      })
    )
  );
  assert.deepEqual(await f.agreement(offerId), amended);
});

test("old database writer cannot strip a link or resurrect its old acknowledgment", async () => {
  const f = await seedInterchurchHelp(db),
    offerId = await f.offer();
  await f.link(offerId, await f.choice(offerId));
  const linked = await f.agreement(offerId);
  const { schedule: ignored, ...terms } = fields(linked);
  void ignored;
  await assert.rejects(
    db.interchurchHelpAgreement.update({
      where: { id: linked.id },
      data: { terms: terms as Prisma.InputJsonObject }
    })
  );
  await assert.rejects(
    db.interchurchHelpAgreement.update({
      where: { id: linked.id },
      data: {
        state: "CONFIRMED",
        requesterAcknowledged: linked.termsVersion,
        responderAcknowledged: linked.termsVersion
      }
    })
  );
  assert.deepEqual(await f.agreement(offerId), linked);
});

test("export and selected report evidence omit opaque canonical references and private contact", async () => {
  const f = await seedInterchurchHelp(db),
    offerId = await f.offer();
  const choice = await f.choice(offerId);
  await f.link(offerId, choice);
  await f.confirm(offerId);
  const row = await db.interchurchHelpOffer.findUniqueOrThrow({
    where: { id: offerId },
    include: { agreement: true }
  });
  const exported = await exportHelp(db, f.responder.id, 100);
  assert.equal(exported.length, 1);
  assert.ok(
    JSON.stringify(exported).includes(choice.startLocal),
    "Authorized export retains the agreed time receipt"
  );
  for (const text of [JSON.stringify(exported), helpOfferEvidence(row)]) {
    assert.ok(!text.includes(choice.id));
    assert.ok(!text.includes(choice.fingerprint));
    assert.ok(!text.includes(f.manager.email));
  }
});

test("source change racing the final acknowledgment cannot leave stale confirmed help", async () => {
  const f = await seedInterchurchHelp(db),
    offerId = await f.offer();
  await f.link(offerId, await f.choice(offerId));
  await f.acknowledge(offerId, f.manager);
  const a = await f.agreement(offerId);
  const outcomes = await Promise.allSettled([
    command(
      db,
      f.responder.token,
      helpAction("acknowledge", {
        offerId,
        expectedVersion: a.version,
        termsVersion: a.termsVersion,
        requestTermsVersion: a.requestTermsVersion,
        acceptTerms: true,
        externalNotices: false
      })
    ),
    f.editOccurrence()
  ]);
  assert.equal(outcomes[1].status, "fulfilled", "The canonical edit commits");
  if (outcomes[0].status === "rejected") {
    assert.ok(outcomes[0].reason instanceof PortalError);
    assert.equal(outcomes[0].reason.status, 409);
  }
  needsReview(await f.agreement(offerId));
});

test("existing opaque recovery controls quarantine an older linked agreement after schedule change", async () => {
  const f = await seedInterchurchHelp(db),
    offerId = await f.offer();
  const choice = await f.choice(offerId);
  await f.link(offerId, choice);
  await f.confirm(offerId);
  await shareContacts(f, offerId);
  const oldAgreement = await f.agreement(offerId);
  const oldRequest = await db.interchurchHelpRequest.findUniqueOrThrow({
    where: { id: f.request.id }
  });
  await f.editOccurrence();
  const control = await db.retentionControl.findFirstOrThrow({
    where: { kind: "INTERCHURCH_HELP", sourceId: f.request.id },
    orderBy: { version: "desc" }
  });
  assert.ok(control.version > oldRequest.version);
  assert.ok(!JSON.stringify(control.payload).includes(choice.id));
  assert.ok(
    !JSON.stringify(control.payload).includes(
      "fictional-responder@example.test"
    )
  );
  // Simulate only this fixture's pre-change backup rows. The current writer gate
  // is explicit here; the separate old-writer test proves unsupported writes fail.
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('gc.interchurch_schedule_writer', 'v1', true)`;
    await tx.interchurchHelpRequest.update({
      where: { id: f.request.id },
      data: { version: oldRequest.version }
    });
    await tx.interchurchHelpAgreement.update({
      where: { id: oldAgreement.id },
      data: {
        version: oldAgreement.version,
        termsVersion: oldAgreement.termsVersion,
        terms: oldAgreement.terms as Prisma.InputJsonObject,
        state: "CONFIRMED",
        requesterAcknowledged: oldAgreement.requesterAcknowledged,
        responderAcknowledged: oldAgreement.responderAcknowledged,
        requesterContact: oldAgreement.requesterContact,
        responderContact: oldAgreement.responderContact
      }
    });
  });
  await replayRetentionControls(db, [
    control.payload as unknown as RetentionControlEntry
  ]);
  const restored = await f.agreement(offerId);
  assert.equal(restored.state, "REVOKED");
  assert.equal(restored.authorityKey, null);
  assert.equal(restored.requesterAcknowledged, null);
  assert.equal(restored.responderAcknowledged, null);
  assert.equal(restored.requesterContact, "");
  assert.equal(restored.responderContact, "");
  assert.equal(
    (
      await db.interchurchHelpRequest.findUniqueOrThrow({
        where: { id: f.request.id }
      })
    ).recoveryRequired,
    true
  );
  await unavailable(f.acknowledge(offerId, f.manager));
});

test("choice pagination is bounded, opaque, pair and kind bound, and expires", async (t) => {
  const f = await seedInterchurchHelp(db),
    offerId = await f.offer();
  const calendar = await db.platformCalendar.findUniqueOrThrow({
    where: { id: f.calendar.id }
  });
  const series = await calendarCommand(db, f.manager.token, {
    operation: "create-event",
    calendarId: calendar.id,
    expectedVersion: calendar.version,
    requestKey: randomUUID(),
    title: "Fictional bounded schedule choices",
    organizer: "Fictional adult team",
    allDay: false,
    startLocal: f.occurrence.startLocal,
    endLocal: f.occurrence.endLocal,
    timeZone: "UTC",
    visibility: "CHURCH",
    weeklyUntil: new Date(f.occurrence.startAt.getTime() + 140 * 86400000)
      .toISOString()
      .slice(0, 10)
  });
  const added = await db.calendarOccurrence.findMany({
    where: { eventId: series.id },
    select: { id: true }
  });
  const first = await read(db, f.manager.token, {
    view: "schedule",
    id: offerId,
    category: "EVENT"
  });
  assert.equal(first.view, "schedule");
  if (first.view !== "schedule") throw new Error("Expected schedule choices");
  assert.equal(first.choices.length, 20);
  assert.ok(first.next);
  const cursor = first.next;
  for (const row of [...added, ...f.occurrences]) {
    assert.ok(!cursor.includes(row.id));
    assert.ok(
      !cursor
        .split(".")
        .map((part) => Buffer.from(part, "base64url").toString("utf8"))
        .join("")
        .includes(row.id)
    );
  }
  const all = await f.choices(offerId);
  assert.equal(all.length, added.length + f.occurrences.length);
  const pair = {
    coordinatorId: f.manager.id,
    responderId: f.responder.id,
    ownerChurchId: f.church.id
  };
  await deny(helpScheduleChoices(db, pair, "VOLUNTEER_SLOT", cursor), 400);
  await deny(
    helpScheduleChoices(
      db,
      { ...pair, responderId: f.outsider.id },
      "EVENT",
      cursor
    ),
    400
  );
  await deny(
    helpScheduleChoices(
      db,
      pair,
      "EVENT",
      (cursor[0] === "A" ? "B" : "A") + cursor.slice(1)
    ),
    400
  );
  const now = Date.now();
  t.mock.method(Date, "now", () => now + 16 * 60000);
  try {
    await deny(helpScheduleChoices(db, pair, "EVENT", cursor), 400);
  } finally {
    t.mock.restoreAll();
  }
});

// Additional focused coverage. Append to the existing schedule service suite;
// these imports and tests do not replace fixes made during the first run.
import { postContext } from "../lib/platform/post-access";
import { interchurchHelpNotificationSources } from "../lib/platform/interchurch-help-notifications";
import { notificationPushAllowed } from "../lib/platform/notification-preferences";

test("a different canonical organizer notifies both private participants generically and preserves optional push consent", async () => {
  const f = await seedInterchurchHelp(db),
    offerId = await f.offer();
  const choice = await f.choice(offerId);
  await f.link(offerId, choice);
  for (const actor of [f.manager, f.responder]) {
    const a = await f.agreement(offerId);
    await command(
      db,
      actor.token,
      helpAction("acknowledge", {
        offerId,
        expectedVersion: a.version,
        termsVersion: a.termsVersion,
        requestTermsVersion: a.requestTermsVersion,
        acceptTerms: true,
        externalNotices: true
      })
    );
  }
  assert.equal((await f.agreement(offerId)).state, "CONFIRMED");
  await db.churchConnection.create({
    data: { userId: f.outsider.id, churchId: f.church.id, state: "APPROVED" }
  });
  await db.churchCapabilityGrant.createMany({
    data: (["EDIT_CHURCH_CALENDAR", "PUBLISH_CHURCH_EVENTS"] as const).map(
      (capability) => ({
        userId: f.outsider.id,
        churchId: f.church.id,
        capability
      })
    )
  });
  const event = await db.calendarEvent.findUniqueOrThrow({
    where: { id: f.event.id }
  });
  const row = await db.calendarOccurrence.findUniqueOrThrow({
    where: { id: f.occurrence.id }
  });
  await calendarCommand(db, f.outsider.token, {
    operation: "edit-event",
    eventId: event.id,
    expectedVersion: event.version,
    occurrenceId: row.id,
    occurrenceVersion: row.version,
    scope: "OCCURRENCE",
    title: row.title,
    description: row.description,
    location: row.location,
    onlineUrl: row.onlineUrl,
    organizer: row.organizer,
    allDay: false,
    timeZone: row.timeZone,
    startLocal: new Date(row.startAt.getTime() + 30 * 60000)
      .toISOString()
      .slice(0, 16),
    endLocal: new Date(row.endAt.getTime() + 30 * 60000)
      .toISOString()
      .slice(0, 16)
  });
  const current = await db.interchurchHelpOffer.findUniqueOrThrow({
    where: { id: offerId }
  });
  const updates = await db.socialEvent.findMany({
    where: {
      kind: "INTERCHURCH_HELP",
      sourceId: offerId,
      sourceVersion: current.version,
      actorId: f.outsider.id
    }
  });
  assert.equal(updates.length, 2);
  assert.deepEqual(
    updates.map((e) => e.recipientId).sort(),
    [f.manager.id, f.responder.id].sort()
  );
  for (const actor of [f.manager, f.responder]) {
    const update = updates.find((e) => e.recipientId === actor.id)!;
    const context = await postContext(db, actor.id);
    const activity = await interchurchHelpNotificationSources(
      db,
      [update],
      context,
      "ACTIVITY"
    );
    assert.equal(activity.size, 1);
    const projected = activity.get(update.id)!;
    assert.equal(
      projected.summary,
      "Your private ministry help has an update."
    );
    assert.equal(
      projected.href,
      `/platform/exchange/help/offers?id=${offerId}`
    );
    const text = JSON.stringify(projected);
    for (const hidden of [
      f.manager.id,
      f.responder.id,
      f.outsider.id,
      row.id,
      event.id,
      choice.fingerprint,
      row.title,
      f.manager.email,
      f.responder.email
    ])
      assert.ok(!text.includes(hidden));
    assert.equal(
      (await interchurchHelpNotificationSources(db, [update], context, "PUSH"))
        .size,
      1,
      "Explicit agreement notice consent makes the generic source eligible for the push preference gate"
    );
    assert.equal(
      (await interchurchHelpNotificationSources(db, [update], context, "EMAIL"))
        .size,
      0
    );
    assert.equal(
      (
        await interchurchHelpNotificationSources(
          db,
          [{ ...update, actorId: randomUUID() }],
          context,
          "ACTIVITY"
        )
      ).size,
      0,
      "An unrelated actor needs the exact latest schedule-change provenance"
    );
    const settings = await db.socialPreferences.findUnique({
      where: { ownerId: actor.id }
    });
    assert.equal(
      notificationPushAllowed(settings, "needs", update.createdAt),
      false,
      "Agreement consent does not opt into the account's optional push category"
    );
    const optedIn = await db.socialPreferences.upsert({
      where: { ownerId: actor.id },
      create: {
        ownerId: actor.id,
        pushCategories: ["needs"],
        notificationPushSince: {
          needs: new Date(update.createdAt.getTime() - 60000).toISOString()
        }
      },
      update: {
        pushCategories: ["needs"],
        notificationPushSince: {
          needs: new Date(update.createdAt.getTime() - 60000).toISOString()
        }
      }
    });
    assert.equal(
      notificationPushAllowed(optedIn, "needs", update.createdAt),
      true
    );
    const optedOut = await db.socialPreferences.update({
      where: { ownerId: actor.id },
      data: { pushCategories: [] }
    });
    assert.equal(
      notificationPushAllowed(optedOut, "needs", update.createdAt),
      false
    );
  }
  // A deliberately opted-out agreement remains in Activity and cannot fall back
  // to the offer's previous notice choice. This is a fixture-only monotonic clear.
  await db.interchurchHelpAgreement.update({
    where: { offerId },
    data: { responderNoticeSince: null }
  });
  const responderEvent = updates.find((e) => e.recipientId === f.responder.id)!;
  const responderContext = await postContext(db, f.responder.id);
  assert.equal(
    (
      await interchurchHelpNotificationSources(
        db,
        [responderEvent],
        responderContext,
        "PUSH"
      )
    ).size,
    0
  );
  assert.equal(
    (
      await interchurchHelpNotificationSources(
        db,
        [responderEvent],
        responderContext,
        "ACTIVITY"
      )
    ).size,
    1
  );
});

test("an unchanged linked event can finish and retain its permitted history after its time passes", async (t) => {
  const f = await seedInterchurchHelp(db),
    offerId = await f.offer();
  const event = await db.calendarEvent.findUniqueOrThrow({
    where: { id: f.event.id }
  });
  const row = await db.calendarOccurrence.findUniqueOrThrow({
    where: { id: f.occurrence.id }
  });
  const now = Date.now(),
    starts = new Date(now + 5 * 60000),
    ends = new Date(now + 10 * 60000);
  await calendarCommand(db, f.manager.token, {
    operation: "edit-event",
    eventId: event.id,
    expectedVersion: event.version,
    occurrenceId: row.id,
    occurrenceVersion: row.version,
    scope: "OCCURRENCE",
    title: row.title,
    description: row.description,
    location: row.location,
    onlineUrl: row.onlineUrl,
    organizer: row.organizer,
    allDay: false,
    timeZone: "UTC",
    startLocal: starts.toISOString().slice(0, 16),
    endLocal: ends.toISOString().slice(0, 16)
  });
  const choice = await f.choice(offerId);
  await f.link(offerId, choice);
  await f.confirm(offerId);
  t.mock.timers.enable({ apis: ["Date"], now: now + 15 * 60000 });
  try {
    const before = await read(db, f.manager.token, {
      view: "offer",
      id: offerId
    });
    assert.equal(before.view, "offers");
    if (before.view !== "offers")
      throw new Error("Expected retained private agreement");
    const prior = before.offers.find((o) => o.id === offerId);
    assert.ok(prior?.available);
    assert.equal(prior.agreement?.state, "CONFIRMED");
    const a = await f.agreement(offerId);
    await command(
      db,
      f.manager.token,
      helpAction("complete", {
        offerId,
        expectedVersion: a.version,
        reason: "Fictional adult microphone setup was completed as agreed."
      })
    );
    assert.equal((await f.agreement(offerId)).state, "COMPLETED");
    const history = await read(db, f.responder.token, {
      view: "offer",
      id: offerId
    });
    assert.equal(history.view, "offers");
    if (history.view !== "offers")
      throw new Error("Expected completed private history");
    const completed = history.offers.find((o) => o.id === offerId);
    assert.ok(completed?.available);
    assert.equal(completed.agreement?.state, "COMPLETED");
    assert.ok(
      JSON.stringify(await exportHelp(db, f.responder.id, 100)).includes(
        choice.startLocal
      )
    );
    const another = await f.offer();
    assert.ok(
      !(await f.choices(another)).some((c) => c.id === choice.id),
      "Past sources are absent from new-link choices"
    );
    await unavailable(f.link(another, choice));
  } finally {
    t.mock.timers.reset();
  }
});

test("membership revocation and regain cannot restore linked acknowledgments or disclosed contacts", async () => {
  const f = await seedInterchurchHelp(db),
    offerId = await f.offer();
  await f.link(offerId, await f.choice(offerId));
  await f.confirm(offerId);
  await shareContacts(f, offerId);
  const key = {
    userId_churchId: { userId: f.responder.id, churchId: f.church.id }
  };
  await db.churchConnection.update({
    where: key,
    data: { state: "REMOVED", version: { increment: 1 } }
  });
  const hidden = await read(db, f.manager.token, {
    view: "offer",
    id: offerId
  });
  assert.ok(
    !JSON.stringify(hidden).includes("fictional-responder@example.test")
  );
  await db.churchConnection.update({
    where: key,
    data: { state: "APPROVED", version: { increment: 1 } }
  });
  const returned = await read(db, f.manager.token, {
    view: "offer",
    id: offerId
  });
  assert.equal(returned.view, "offers");
  if (returned.view !== "offers")
    throw new Error("Expected current private offers");
  const projected = returned.offers.find((o) => o.id === offerId);
  assert.ok(projected?.available && projected.agreement);
  assert.equal(projected.agreement.state, "NEEDS_REVIEW");
  assert.equal(projected.agreement.requesterAcknowledged, null);
  assert.equal(projected.agreement.responderAcknowledged, null);
  assert.ok(
    !JSON.stringify(returned).includes("fictional-responder@example.test")
  );
  await deny(f.acknowledge(offerId, f.manager));
  const current = await f.agreement(offerId);
  await deny(
    command(
      db,
      f.manager.token,
      helpAction("complete", {
        offerId,
        expectedVersion: current.version,
        reason: "Cannot reuse revoked consent"
      })
    )
  );
  await f.link(offerId, await f.choice(offerId));
  needsReview(await f.agreement(offerId));
  await f.confirm(offerId);
  const renewed = await f.agreement(offerId);
  assert.equal(renewed.requesterContact, "");
  assert.equal(renewed.responderContact, "");
});

test("the event-wide association bound rejects a new link and rolls back an oversized source edit", async () => {
  const f = await seedInterchurchHelp(db),
    offerId = await f.offer();
  const choice = await f.choice(offerId);
  const request = await db.interchurchHelpRequest.findUniqueOrThrow({
    where: { id: f.request.id }
  });
  const offer = await db.interchurchHelpOffer.findUniqueOrThrow({
    where: { id: offerId }
  });
  const agreement = await f.agreement(offerId);
  const binding = {
    schema: 1,
    kind: choice.kind,
    id: choice.id,
    occurrenceId: f.occurrence.id,
    fingerprint: choice.fingerprint
  };
  // Load-only retained rows simulate a large restored database. They are not
  // actor consent or a claim that null-listing historical pairs are available.
  // Each has a distinct request, preserving the real pair uniqueness constraint.
  async function loadRows(count: number) {
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('gc.interchurch_schedule_writer', 'v1', true)`;
      const ids = Array.from({ length: count }, () => ({
        requestId: randomUUID(),
        offerId: randomUUID(),
        agreementId: randomUUID()
      }));
      await tx.interchurchHelpRequest.createMany({
        data: ids.map((id) => ({
          ...request,
          id: id.requestId,
          listingId: null
        }))
      });
      await tx.interchurchHelpOffer.createMany({
        data: ids.map((id) => ({
          ...offer,
          id: id.offerId,
          requestId: id.requestId,
          terms: offer.terms as Prisma.InputJsonObject
        }))
      });
      await tx.interchurchHelpAgreement.createMany({
        data: ids.map((id) => ({
          ...agreement,
          id: id.agreementId,
          offerId: id.offerId,
          terms: {
            ...fields(agreement),
            schedule: binding
          } as Prisma.InputJsonObject
        }))
      });
    });
  }
  await loadRows(100);
  await deny(f.link(offerId, choice));
  assert.deepEqual(
    await f.agreement(offerId),
    agreement,
    "The rejected link does not change terms or consent"
  );
  await loadRows(1);
  const source = await db.calendarOccurrence.findUniqueOrThrow({
    where: { id: f.occurrence.id }
  });
  const event = await db.calendarEvent.findUniqueOrThrow({
    where: { id: f.event.id }
  });
  await deny(f.editOccurrence());
  assert.deepEqual(
    await db.calendarOccurrence.findUniqueOrThrow({ where: { id: source.id } }),
    source,
    "Canonical schedule changes roll back when their bounded invalidation cannot complete"
  );
  assert.deepEqual(
    await db.calendarEvent.findUniqueOrThrow({ where: { id: event.id } }),
    event
  );
  assert.deepEqual(await f.agreement(offerId), agreement);
});

// Append after the existing service tests. This appendix is independent of the
// earlier four-group addition and contains no extra database runner.
import { participationCommand } from "../lib/platform/post-participation";

for (const kind of ["EVENT", "VOLUNTEER_SLOT"] as const) {
  test(`all-day ${kind} links preserve midnight boundaries and the exclusive end date`, async () => {
    const f = await seedInterchurchHelp(db),
      offerId = await f.offer();
    const event = await db.calendarEvent.findUniqueOrThrow({
      where: { id: f.event.id }
    });
    const row = await db.calendarOccurrence.findUniqueOrThrow({
      where: { id: f.occurrence.id }
    });
    const startDate = row.startLocal.slice(0, 10);
    const endDate = new Date(row.startAt.getTime() + 2 * 86400000)
      .toISOString()
      .slice(0, 10);
    await calendarCommand(db, f.manager.token, {
      operation: "edit-event",
      eventId: event.id,
      expectedVersion: event.version,
      occurrenceId: row.id,
      occurrenceVersion: row.version,
      scope: "OCCURRENCE",
      title: row.title,
      description: row.description,
      location: row.location,
      onlineUrl: row.onlineUrl,
      organizer: row.organizer,
      allDay: true,
      startLocal: startDate,
      endLocal: endDate,
      timeZone: "America/Chicago"
    });
    if (kind === "VOLUNTEER_SLOT") {
      const slot = await db.postVolunteerSlot.findUniqueOrThrow({
        where: { id: f.slot.id }
      });
      await participationCommand(db, f.manager.token, {
        operation: "configure-slot",
        postId: f.post.id,
        slotId: slot.id,
        requestKey: slot.requestKey,
        expectedVersion: slot.version,
        role: slot.role,
        capacity: slot.capacity,
        closed: false,
        independentTime: false
      });
      const inherited = await db.postVolunteerSlot.findUniqueOrThrow({
        where: { id: f.slot.id }
      });
      assert.equal(inherited.shiftStartAt, null);
      assert.equal(inherited.shiftEndAt, null);
    }
    const canonical = await db.calendarOccurrence.findUniqueOrThrow({
      where: { id: row.id }
    });
    assert.equal(canonical.allDay, true);
    assert.equal(canonical.startLocal, startDate);
    assert.equal(canonical.endLocal, endDate);
    const participation = await f.participation();
    const choice = await f.choice(offerId, kind);
    assert.equal(choice.allDay, true);
    await f.link(offerId, choice);
    needsReview(await f.agreement(offerId));
    const agreed = await f.confirm(offerId);
    assert.equal(fields(agreed).startLocal, startDate + "T00:00");
    assert.equal(
      fields(agreed).endLocal,
      endDate + "T00:00",
      "The exclusive next-day boundary is preserved, never changed to 23:59 or the prior date"
    );
    assert.equal(fields(agreed).timeZone, "America/Chicago");
    assert.equal(
      (fields(agreed).schedule as Record<string, unknown>).kind,
      kind
    );
    assert.deepEqual(
      await db.calendarOccurrence.findUniqueOrThrow({ where: { id: row.id } }),
      canonical,
      "Linking projects the source without changing its canonical all-day representation"
    );
    assert.deepEqual(await f.participation(), participation);
    const visible = await read(db, f.responder.token, {
      view: "offer",
      id: offerId
    });
    assert.equal(visible.view, "offers");
    if (visible.view !== "offers")
      throw new Error("Expected all-day private agreement");
    const selected = visible.offers.find((o) => o.id === offerId);
    assert.ok(selected?.available && selected.agreement);
    assert.equal(selected.agreement.state, "CONFIRMED");
    assert.equal(selected.agreement.schedule?.allDay, true);
  });
}

for (const clearAcknowledgments of [false, true]) {
  test(`legacy ${clearAcknowledgments ? "request lifecycle" : "direct command"} cancellation restricts linked help without permitting terminal rewrites`, async () => {
    const f = await seedInterchurchHelp(db),
      offerId = await f.offer();
    await f.link(offerId, await f.choice(offerId));
    await f.confirm(offerId);
    await shareContacts(f, offerId);
    const before = await f.agreement(offerId);
    const canceledAt = new Date();
    const completionNote = clearAcknowledgments
      ? "The requesting church canceled this request."
      : "Fictional participant canceled the planned adult help.";
    // This is the exact restrictive agreement UPDATE from the pre-expansion
    // cancellation owners. Deliberately do not set the new writer marker.
    const canceled = await db.interchurchHelpAgreement.update({
      where: { id: before.id },
      data: {
        state: "CANCELED",
        canceledAt,
        completionNote,
        requesterContact: "",
        responderContact: "",
        version: { increment: 1 },
        contactVersion: { increment: 1 },
        ...(clearAcknowledgments
          ? {
              requesterAcknowledged: null,
              responderAcknowledged: null,
              requesterNoticeSince: null,
              responderNoticeSince: null
            }
          : {})
      }
    });
    assert.equal(canceled.state, "CANCELED");
    assert.equal(canceled.canceledAt?.getTime(), canceledAt.getTime());
    assert.equal(canceled.completionNote, completionNote);
    assert.deepEqual(canceled.terms, before.terms);
    assert.equal(canceled.termsVersion, before.termsVersion);
    assert.equal(canceled.authorityKey, before.authorityKey);
    assert.equal(
      canceled.requesterAcknowledged,
      clearAcknowledgments ? null : before.requesterAcknowledged
    );
    assert.equal(
      canceled.responderAcknowledged,
      clearAcknowledgments ? null : before.responderAcknowledged
    );
    assert.equal(canceled.requesterContact, "");
    assert.equal(canceled.responderContact, "");
    const { schedule: omitted, ...unlinkedTerms } = fields(canceled);
    void omitted;
    const prohibited: Prisma.InterchurchHelpAgreementUpdateInput[] = [
      { completionNote: "Rewritten terminal cancellation reason" },
      { canceledAt: new Date(canceledAt.getTime() + 1000) },
      { canceledAt: null },
      {
        state: "CONFIRMED",
        requesterAcknowledged: canceled.termsVersion,
        responderAcknowledged: canceled.termsVersion
      },
      {
        state: "COMPLETED",
        completedAt: new Date(),
        completionNote: "Invented fulfillment"
      },
      { requesterContact: "new-private-value@example.test" },
      { requesterAcknowledged: canceled.termsVersion + 1 },
      { terms: unlinkedTerms as Prisma.InputJsonObject }
    ];
    for (const data of prohibited) {
      await assert.rejects(
        db.interchurchHelpAgreement.update({
          where: { id: canceled.id },
          data
        }),
        /Current ministry schedule writer required/
      );
      assert.deepEqual(
        await f.agreement(offerId),
        canceled,
        "An old writer cannot rewrite a terminal receipt, revive consent, disclose contact or drop its source"
      );
    }
  });
}

test("linked export propagates infrastructure failure but safely omits an actually unavailable source", async () => {
  const f = await seedInterchurchHelp(db),
    offerId = await f.offer();
  const choice = await f.choice(offerId);
  await f.link(offerId, choice);
  await f.confirm(offerId);
  await shareContacts(f, offerId);
  const authorized = await exportHelp(db, f.responder.id, 100);
  assert.equal(authorized.length, 1);
  assert.ok(
    authorized[0].agreement,
    "The control export reaches the linked agreement projection"
  );
  assert.ok(JSON.stringify(authorized).includes(choice.startLocal));
  const infrastructureError = new Error(
    "Fictional injected calendar read infrastructure failure"
  );
  let intercepted = 0;
  const failingDatabase = new Proxy(db, {
    get(target, property) {
      if (property === "calendarOccurrence")
        return new Proxy(target.calendarOccurrence, {
          get(occurrences, method) {
            if (method === "findUnique")
              return async () => {
                intercepted++;
                throw infrastructureError;
              };
            return Reflect.get(occurrences, method);
          }
        });
      return Reflect.get(target, property);
    }
  });
  await assert.rejects(
    exportHelp(failingDatabase, f.responder.id, 100),
    (error) => error === infrastructureError,
    "A database failure must fail the export, not silently produce an incomplete success"
  );
  assert.ok(
    intercepted > 0,
    "The injected failure reached actual linked source resolution"
  );
  assert.deepEqual(
    await exportHelp(db, f.responder.id, 100),
    authorized,
    "The original unmodified client still returns the complete permitted export"
  );
  await db.churchConnection.update({
    where: {
      userId_churchId: { userId: f.responder.id, churchId: f.church.id }
    },
    data: { state: "REMOVED", version: { increment: 1 } }
  });
  const restricted = await exportHelp(db, f.responder.id, 100);
  assert.equal(restricted.length, 1);
  assert.equal(restricted[0].id, offerId);
  assert.ok(
    restricted[0].authoredOffer,
    "The actor retains their own authored proposal"
  );
  assert.ok(
    !Object.hasOwn(restricted[0], "agreement"),
    "Actual loss of canonical source access omits the linked agreement receipt"
  );
  const text = JSON.stringify(restricted);
  for (const hidden of [
    choice.id,
    choice.fingerprint,
    choice.startLocal,
    f.manager.email,
    "fictional-requester@example.test"
  ])
    assert.ok(!text.includes(hidden));
});
