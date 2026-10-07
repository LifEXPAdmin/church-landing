import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes
} from "node:crypto";
import { Prisma } from "@prisma/client";
import { accountConfig } from "./account-config";
import { calendarContext, eventAccess, eventInclude } from "./calendar-access";
import { effectiveChurchGrants } from "./church-permissions";
import { postContext, postReadableWhere, type PostTx } from "./post-access";
import { eligibleWhere, PortalError } from "./portal-policy";
import { volunteerShift } from "./volunteer-shift";
import { recordHelpChange } from "./interchurch-help-lifecycle";

export type HelpScheduleKind = "EVENT" | "VOLUNTEER_SLOT";
export type HelpScheduleCandidate = { kind: HelpScheduleKind; id: string };
export type HelpScheduleBinding = HelpScheduleCandidate & {
  schema: 1;
  occurrenceId: string;
  fingerprint: string;
};
export type HelpSchedulePair = {
  coordinatorId: string;
  responderId: string;
  ownerChurchId: string;
};
const invalid = () =>
  new PortalError(400, "Choose a current ministry help schedule.");
const validId = (value: unknown): value is string =>
  typeof value === "string" && /^[\w-]{1,100}$/.test(value);
function candidate(value: unknown): HelpScheduleCandidate {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw invalid();
  const v = value as Record<string, unknown>;
  if (!validId(v.id) || (v.kind !== "EVENT" && v.kind !== "VOLUNTEER_SLOT"))
    throw invalid();
  return { kind: v.kind, id: v.id };
}
export function parseHelpSchedule(value: unknown): HelpScheduleBinding | null {
  if (value == null) return null;
  const c = candidate(value),
    v = value as Record<string, unknown>;
  if (
    Object.keys(v).length !== 5 ||
    Object.keys(v).some(
      (k) =>
        !["schema", "kind", "id", "occurrenceId", "fingerprint"].includes(k)
    ) ||
    v.schema !== 1 ||
    !validId(v.occurrenceId) ||
    typeof v.fingerprint !== "string" ||
    !/^[a-f0-9]{64}$/.test(v.fingerprint) ||
    (c.kind === "EVENT" && c.id !== v.occurrenceId)
  )
    throw invalid();
  return {
    ...c,
    schema: 1,
    occurrenceId: v.occurrenceId,
    fingerprint: v.fingerprint
  };
}
async function pairScope(tx: PostTx, pair: HelpSchedulePair) {
  if (
    ![pair.coordinatorId, pair.responderId, pair.ownerChurchId].every(
      validId
    ) ||
    pair.coordinatorId === pair.responderId
  )
    return null;
  const people = await tx.platformUser.findMany({
    where: {
      id: { in: [pair.coordinatorId, pair.responderId] },
      ...eligibleWhere,
      erasedAt: null,
      deletionRequestedAt: null
    },
    select: {
      id: true,
      name: true,
      username: true,
      dateFormat: true,
      timeFormat: true,
      suspendedAt: true,
      deactivatedAt: true,
      emailVerifiedAt: true,
      adultAcknowledgedAt: true,
      adultPolicyVersion: true,
      portalVersion: true
    }
  });
  if (people.length !== 2) return null;
  return Promise.all(
    [pair.coordinatorId, pair.responderId].map(async (id) => ({
      id,
      calendar: await calendarContext(tx, people.find((p) => p.id === id)!),
      post: await postContext(tx, id)
    }))
  );
}
type PairScope = NonNullable<Awaited<ReturnType<typeof pairScope>>>;

// A scan can pass a source that one participant cannot read. Encrypt its cursor
// rather than returning even a signed/base64 encoding of that private target ID.
function scheduleCursor(pair: HelpSchedulePair, kind: HelpScheduleKind) {
  const key = createHash("sha256")
    .update("interchurch-schedule-cursor:v1\0")
    .update(accountConfig().rateSecret)
    .digest();
  const aad = Buffer.from(
    JSON.stringify([
      pair.coordinatorId,
      pair.responderId,
      pair.ownerChurchId,
      kind
    ])
  );
  return {
    decode(value?: string | null): { id: string; expires: number } | null {
      if (value == null) return null;
      try {
        if (
          typeof value !== "string" ||
          value.length > 800 ||
          !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value)
        )
          throw invalid();
        const [iv, ciphertext, tag] = value
          .split(".")
          .map((v) => Buffer.from(v, "base64url"));
        if (iv.length !== 12 || tag.length !== 16) throw invalid();
        const decipher = createDecipheriv("aes-256-gcm", key, iv);
        decipher.setAAD(aad);
        decipher.setAuthTag(tag);
        const decoded = JSON.parse(
          Buffer.concat([
            decipher.update(ciphertext),
            decipher.final()
          ]).toString("utf8")
        );
        if (
          !validId(decoded?.id) ||
          !Number.isSafeInteger(decoded.expires) ||
          decoded.expires <= Date.now() ||
          decoded.expires > Date.now() + 15 * 60_000
        )
          throw invalid();
        return { id: decoded.id, expires: decoded.expires };
      } catch {
        throw new PortalError(
          400,
          "Reopen the schedule choices from their first page."
        );
      }
    },
    encode(id: string, expires: number) {
      const iv = randomBytes(12),
        cipher = createCipheriv("aes-256-gcm", key, iv);
      cipher.setAAD(aad);
      const encrypted = Buffer.concat([
        cipher.update(JSON.stringify({ id, expires }), "utf8"),
        cipher.final()
      ]);
      return [iv, encrypted, cipher.getAuthTag()]
        .map((v) => v.toString("base64url"))
        .join(".");
    }
  };
}

async function resolveSchedule(
  tx: PostTx,
  pair: HelpSchedulePair,
  scopes: PairScope,
  c: HelpScheduleCandidate,
  saved: HelpScheduleBinding | null,
  requireFuture: boolean
) {
  const slot =
    c.kind === "VOLUNTEER_SLOT"
      ? await tx.postVolunteerSlot.findUnique({
          where: { id: c.id },
          include: { opportunity: true, post: true }
        })
      : null;
  if (
    c.kind === "VOLUNTEER_SLOT" &&
    (!slot ||
      slot.closedAt ||
      slot.opportunity?.closedAt ||
      slot.opportunity?.recoveryRequired ||
      slot.post.groupId ||
      slot.post.topicCommunityId ||
      !["PUBLIC", "CHURCH"].includes(slot.post.audience) ||
      slot.post.authorChurchId !== pair.ownerChurchId ||
      !slot.post.eventOccurrenceId ||
      (slot.opportunity && slot.opportunity.postId !== slot.postId))
  )
    return null;
  const row = await tx.calendarOccurrence.findUnique({
    where: { id: slot?.post.eventOccurrenceId ?? c.id },
    include: { event: { include: eventInclude } }
  });
  if (
    !row ||
    row.canceledAt ||
    row.event.canceledAt ||
    row.event.calendar.archivedAt ||
    row.event.calendar.churchId !== pair.ownerChurchId ||
    row.event.calendar.ownerId !== null ||
    (saved && row.id !== saved.occurrenceId)
  )
    return null;
  for (const scope of scopes) {
    const access = eventAccess(scope.calendar, row.event);
    if (access !== "DETAILS" && access !== "EDIT") return null;
    if (
      slot &&
      !(await tx.platformPost.findFirst({
        where: { AND: [{ id: slot.postId }, postReadableWhere(scope.post)] },
        select: { id: true }
      }))
    )
      return null;
  }
  const time = slot ? volunteerShift(slot, row) : { ...row, conflict: false };
  if (time.conflict || (requireFuture && time.endAt <= new Date())) return null;
  // Publication has a separate audit epoch. A sibling occurrence edit changes
  // event.version but does not change this occurrence's reviewed schedule.
  const publication = await tx.calendarAudit.findFirst({
    where: { targetId: row.eventId, action: "SET_EVENT_VISIBILITY" },
    orderBy: [{ version: "desc" }, { id: "desc" }],
    select: { id: true, version: true }
  });
  const accessEpochs = await Promise.all(
    scopes.map(async (scope) => {
      const needsMembership =
        row.event.visibility !== "PUBLIC" ||
        (slot && slot.post.audience !== "PUBLIC");
      if (!needsMembership) return null;
      const connection = await tx.churchConnection.findUnique({
        where: {
          userId_churchId: { userId: scope.id, churchId: pair.ownerChurchId }
        },
        select: { id: true, version: true, state: true }
      });
      const grants =
        row.event.visibility === "PRIVATE"
          ? await effectiveChurchGrants(
              tx,
              scope.id,
              [pair.ownerChurchId],
              ["EDIT_CHURCH_CALENDAR", "PUBLISH_CHURCH_EVENTS"]
            )
          : [];
      return [
        connection,
        grants
          .map((g) => [
            g.id,
            g.version,
            g.source,
            g.assignmentId,
            g.church.version,
            g.dependency?.id,
            g.dependency?.version
          ])
          .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
      ];
    })
  );
  const fingerprint = createHash("sha256")
    .update(
      JSON.stringify([
        c.kind,
        c.id,
        pair.ownerChurchId,
        row.id,
        row.version,
        row.event.visibility,
        publication,
        row.title,
        row.description,
        row.location,
        row.onlineUrl,
        row.organizer,
        row.startAt,
        row.endAt,
        row.startLocal,
        row.endLocal,
        row.timeZone,
        row.allDay,
        slot && [
          slot.version,
          slot.role,
          slot.capacity,
          slot.shiftStartAt,
          slot.shiftEndAt,
          slot.postId,
          slot.post.version,
          slot.opportunity?.id,
          slot.opportunity?.version
        ],
        accessEpochs
      ])
    )
    .digest("hex");
  return {
    binding: { ...c, schema: 1 as const, occurrenceId: row.id, fingerprint },
    title: slot ? `${slot.role}: ${row.title}` : row.title,
    href: slot
      ? slot.opportunity
        ? `/platform/serve/${slot.opportunity.id}`
        : `/platform/posts/${slot.postId}`
      : `/platform/events/${row.id}`,
    // Agreement terms use exact wall-clock endpoints. All-day dates retain
    // their canonical midnight boundaries, including the exclusive end date.
    startLocal: time.allDay ? `${time.startLocal}T00:00` : time.startLocal,
    endLocal: time.allDay ? `${time.endLocal}T00:00` : time.endLocal,
    timeZone: time.timeZone,
    allDay: time.allDay,
    changed: !!saved && saved.fingerprint !== fingerprint
  };
}

/** Read inside the caller's current permission transaction; never grants help authority. */
export async function readHelpSchedule(
  tx: PostTx,
  pair: HelpSchedulePair,
  value: HelpScheduleCandidate | HelpScheduleBinding,
  options: { requireFuture?: boolean } = {}
) {
  const c = candidate(value),
    saved = "schema" in value ? parseHelpSchedule(value) : null;
  if (!saved && Object.keys(value).some((k) => k !== "kind" && k !== "id"))
    throw invalid();
  const scopes = await pairScope(tx, pair);
  return scopes
    ? resolveSchedule(
        tx,
        pair,
        scopes,
        c,
        saved,
        options.requireFuture ?? !saved
      )
    : null;
}

export async function helpScheduleChoices(
  tx: PostTx,
  pair: HelpSchedulePair,
  kind: HelpScheduleKind,
  after?: string | null
) {
  if (!["EVENT", "VOLUNTEER_SLOT"].includes(kind)) throw invalid();
  const scopes = await pairScope(tx, pair);
  if (!scopes) return { choices: [], next: null };
  const cursor = scheduleCursor(pair, kind),
    prior = cursor.decode(after),
    expires = prior?.expires ?? Date.now() + 15 * 60_000;
  const rows =
    kind === "EVENT"
      ? await tx.calendarOccurrence.findMany({
          where: {
            ...(prior ? { id: { gt: prior.id } } : {}),
            canceledAt: null,
            endAt: { gt: new Date() },
            event: {
              canceledAt: null,
              calendar: { churchId: pair.ownerChurchId, archivedAt: null }
            }
          },
          select: { id: true },
          orderBy: { id: "asc" },
          take: 21
        })
      : await tx.postVolunteerSlot.findMany({
          where: {
            ...(prior ? { id: { gt: prior.id } } : {}),
            closedAt: null,
            post: {
              authorChurchId: pair.ownerChurchId,
              eventOccurrenceId: { not: null }
            }
          },
          select: { id: true },
          orderBy: { id: "asc" },
          take: 21
        });
  const choices = [];
  for (const row of rows.slice(0, 20)) {
    const choice = await resolveSchedule(
      tx,
      pair,
      scopes,
      { kind, id: row.id },
      null,
      true
    );
    if (choice) {
      const { binding, changed, ...details } = choice;
      void changed;
      choices.push({
        kind: binding.kind,
        id: binding.id,
        fingerprint: binding.fingerprint,
        ...details
      });
    }
  }
  return {
    choices,
    next: rows.length > 20 ? cursor.encode(rows[19].id, expires) : null
  };
}

/** Keep future canonical edits bounded across the entire event, not just one slot. */
export async function assertHelpScheduleCapacity(
  tx: PostTx,
  binding: HelpScheduleBinding,
  excludingAgreementId?: string
) {
  const occurrence = await tx.calendarOccurrence.findUnique({
    where: { id: binding.occurrenceId },
    select: { eventId: true }
  });
  if (!occurrence)
    throw new PortalError(404, "This ministry help schedule is unavailable.");
  const rows = await tx.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`SELECT a.id FROM "InterchurchHelpAgreement" a
      WHERE a.state IN ('NEEDS_REVIEW','CONFIRMED') AND a.terms ? 'schedule'
      AND a.terms->'schedule'->>'occurrenceId' IN
        (SELECT id FROM "CalendarOccurrence" WHERE "eventId"=${occurrence.eventId})
      ${excludingAgreementId ? Prisma.sql`AND a.id<>${excludingAgreementId}` : Prisma.empty}
      LIMIT 100`
  );
  if (rows.length >= 100)
    throw new PortalError(
      409,
      "This event already has the supported number of active ministry help links. Keep a standalone agreement or review existing links."
    );
}

/** Source owners call this before their transaction commits, never from a read. */
export async function invalidateHelpSchedule(
  tx: PostTx,
  actorId: string,
  source: { occurrenceId?: string; slotId?: string; eventId?: string }
) {
  if (
    Object.values(source).filter(Boolean).length !== 1 ||
    Object.values(source).some((v) => !validId(v))
  )
    throw invalid();
  const match = source.slotId
    ? Prisma.sql`a.terms->'schedule'->>'kind'='VOLUNTEER_SLOT' AND a.terms->'schedule'->>'id'=${source.slotId}`
    : source.occurrenceId
      ? Prisma.sql`a.terms->'schedule'->>'occurrenceId'=${source.occurrenceId}`
      : Prisma.sql`a.terms->'schedule'->>'occurrenceId' IN (SELECT id FROM "CalendarOccurrence" WHERE "eventId"=${source.eventId})`;
  const rows = await tx.$queryRaw<
    Array<{ id: string; offerId: string; requestId: string }>
  >(
    Prisma.sql`SELECT a.id, a."offerId", o."requestId" FROM "InterchurchHelpAgreement" a
      JOIN "InterchurchHelpOffer" o ON o.id=a."offerId"
      WHERE a.state IN ('NEEDS_REVIEW','CONFIRMED') AND a.terms ? 'schedule' AND (${match})
      ORDER BY a.id LIMIT 101`
  );
  if (rows.length > 100)
    throw new PortalError(
      409,
      "Review the number of linked ministry help agreements before changing this schedule."
    );
  if (!rows.length) return;
  await tx.$executeRaw`SELECT set_config('gc.interchurch_schedule_writer', 'v1', true)`;
  for (const row of rows) {
    await tx.interchurchHelpAgreement.update({
      where: { id: row.id },
      data: {
        state: "NEEDS_REVIEW",
        termsVersion: { increment: 1 },
        version: { increment: 1 },
        requesterAcknowledged: null,
        responderAcknowledged: null,
        requesterContact: "",
        responderContact: "",
        contactVersion: { increment: 1 }
      }
    });
    await tx.interchurchHelpOffer.update({
      where: { id: row.offerId },
      data: { version: { increment: 1 } }
    });
    await recordHelpChange(
      tx,
      row.requestId,
      actorId,
      "SCHEDULE_CHANGED",
      row.offerId
    );
  }
}
