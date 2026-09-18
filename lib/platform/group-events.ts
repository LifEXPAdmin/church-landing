import type { PrismaClient } from "@prisma/client";
import {
  calendarContext,
  eventAccess,
  eventInclude,
  projectOccurrence
} from "./calendar-access";
import { groupLeaderCurrent, unavailableGroup } from "./group-policy";
import { recordGroupChange } from "./group-lifecycle";
import {
  postContext,
  withPostRead,
  type PostContext,
  type PostTx
} from "./post-access";
import { postId } from "./post-input";
import { expected, PortalError } from "./portal-policy";
import { requirePrivilegedAuthentication } from "./privileged-auth-policy";
import { socialCommand, socialInput } from "./social-operations";

async function calendarScope(tx: PostTx, context: PostContext) {
  const actor = await tx.platformUser.findUniqueOrThrow({
    where: { id: context.actorId! },
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
  return calendarContext(tx, actor);
}
async function readableOccurrence(
  tx: PostTx,
  context: PostContext,
  occurrenceId: unknown
) {
  const row = await tx.calendarOccurrence.findUnique({
    where: { id: postId(occurrenceId) },
    include: { event: { include: eventInclude } }
  });
  const scope = await calendarScope(tx, context);
  const level = row && eventAccess(scope, row.event);
  if (
    !row ||
    !level ||
    level === "BUSY" ||
    context.blockedIds?.includes(row.event.calendar.ownerId ?? "")
  )
    throw new PortalError(404, "This event is unavailable to link.");
  return { row, scope };
}
export function groupEventCommand(
  db: PrismaClient,
  token: unknown,
  input: Record<string, unknown>
) {
  const op = input.operation;
  if (op !== "link-event" && op !== "unlink-event")
    throw new PortalError(400, "Choose a supported group event action.");
  socialInput(input, [
    "operation",
    "mutationId",
    "groupId",
    "occurrenceId",
    "expectedVersion",
    ...(op === "link-event"
      ? ["occurrenceVersion", "eventVersion", "confirmed"]
      : [])
  ]);
  const authorize = async (tx: PostTx, actorId: string) => {
    const context = await postContext(tx, actorId),
      groupId = postId(input.groupId);
    if (!context.groupReaders?.has(groupId)) throw unavailableGroup();
    const group = await tx.gatherGroup.findUniqueOrThrow({
      where: { id: groupId }
    });
    const member = await tx.gatherGroupMembership.findUnique({
      where: { groupId_userId: { groupId, userId: actorId } }
    });
    await requirePrivilegedAuthentication(tx, actorId);
    if (
      !(await groupLeaderCurrent(
        tx,
        group,
        member,
        actorId,
        op === "link-event"
      ))
    )
      throw unavailableGroup();
    if (op === "link-event")
      await readableOccurrence(tx, context, input.occurrenceId);
    return { context, group };
  };
  return socialCommand(
    db,
    token,
    "group-event",
    input,
    async (tx, actorId) => {
      const { context, group } = await authorize(tx, actorId),
        occurrenceId = postId(input.occurrenceId);
      const where = {
        groupId_occurrenceId: { groupId: group.id, occurrenceId }
      };
      const old = await tx.gatherGroupEventLink.findUnique({ where });
      expected(input.expectedVersion, old?.version ?? 0);
      if (op === "link-event") {
        if (input.confirmed !== true)
          throw new PortalError(
            400,
            "Confirm this event link. Its own audience still applies."
          );
        const { row } = await readableOccurrence(tx, context, occurrenceId);
        expected(input.occurrenceVersion, row.version);
        expected(input.eventVersion, row.event.version);
        if (row.canceledAt || row.event.canceledAt)
          throw new PortalError(
            409,
            "Choose an event that has not been canceled."
          );
        if (
          !old &&
          (await tx.gatherGroupEventLink.count({
            where: { groupId: group.id }
          })) >= 1000
        )
          throw new PortalError(
            429,
            "This group's event links need a storage review."
          );
      } else if (!old)
        throw new PortalError(404, "This group event link is unavailable.");
      const saved = await tx.gatherGroupEventLink.upsert({
        where,
        create: { groupId: group.id, occurrenceId, addedById: actorId },
        update: {
          active: op === "link-event",
          addedById: actorId,
          version: { increment: 1 }
        }
      });
      await recordGroupChange(
        tx,
        group.id,
        actorId,
        String(op),
        saved.version,
        { targetId: saved.id }
      );
      return {
        id: saved.id,
        version: saved.version,
        message:
          op === "link-event"
            ? "Event linked. Its existing audience and attendance choices still apply."
            : "Event link removed. The original event is unchanged."
      };
    },
    async (tx, actorId) => {
      await authorize(tx, actorId);
    }
  );
}
export function readGroupEventChoice(
  db: PrismaClient,
  token: unknown,
  groupId: unknown,
  occurrenceId: unknown
) {
  return withPostRead(db, token, async (tx, context) => {
    const id = postId(groupId);
    if (!context.groupModerators?.has(id)) throw unavailableGroup();
    const { row, scope } = await readableOccurrence(tx, context, occurrenceId);
    const link = await tx.gatherGroupEventLink.findUnique({
      where: { groupId_occurrenceId: { groupId: id, occurrenceId: row.id } },
      select: { version: true, active: true }
    });
    return {
      event: projectOccurrence(scope, row.event, row),
      link,
      viewerId: context.actorId
    };
  });
}
export function readGroupEvents(
  db: PrismaClient,
  token: unknown,
  groupId: unknown,
  after?: string
) {
  return withPostRead(db, token, async (tx, context) => {
    const id = postId(groupId);
    if (!context.groupReaders?.has(id)) throw unavailableGroup();
    const scope = await calendarScope(tx, context);
    const rows = await tx.gatherGroupEventLink.findMany({
      where: {
        groupId: id,
        active: true,
        addedById: { notIn: context.blockedIds ?? [] },
        ...(after ? { id: { gt: postId(after) } } : {})
      },
      include: {
        occurrence: { include: { event: { include: eventInclude } } }
      },
      orderBy: { id: "asc" },
      take: 201
    });
    const events = [];
    let last: string | undefined;
    for (const link of rows.slice(0, 200)) {
      last = link.id;
      const row = link.occurrence;
      if (context.blockedIds?.includes(row.event.calendar.ownerId ?? ""))
        continue;
      const event = projectOccurrence(scope, row.event, row);
      if (!event || event.access === "BUSY") continue;
      events.push({ id: link.id, version: link.version, event });
      if (events.length === 20) break;
    }
    return {
      events,
      after: last && rows.some((r) => r.id > last!) ? last : null,
      canManage: context.groupModerators?.has(id) ?? false,
      viewerId: context.actorId
    };
  });
}
