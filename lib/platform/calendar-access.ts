import { effectiveChurchGrants } from "./church-permissions";
import type {
  Prisma,
  CalendarOccurrence,
  ChurchCapability
} from "@prisma/client";
import {
  type Actor,
  eligibility,
  eligibleWhere,
  isEligible,
  PortalError
} from "./portal";

export type CalendarTx = Prisma.TransactionClient;
export const calendarInclude = {
  owner: {
    select: {
      id: true,
      suspendedAt: true,
      deactivatedAt: true,
      emailVerifiedAt: true,
      adultAcknowledgedAt: true,
      adultPolicyVersion: true
    }
  },
  church: { select: { id: true, name: true, slug: true } },
  shares: {
    include: {
      connection: { select: { userId: true, churchId: true, state: true } }
    }
  }
} as const;
export const eventInclude = {
  calendar: { include: calendarInclude },
  shares: {
    include: {
      connection: { select: { userId: true, churchId: true, state: true } }
    }
  }
} as const;
export type CalendarRow = Prisma.PlatformCalendarGetPayload<{
  include: typeof calendarInclude;
}>;
export type EventRow = Prisma.CalendarEventGetPayload<{
  include: typeof eventInclude;
}>;
export type CalendarContext = {
  actor: Actor | null;
  churches: { id: string; name: string; connectionId: string }[];
  scopes: Set<string>;
  sharedNames: Map<string, string>;
};
export async function calendarContext(
  tx: CalendarTx,
  actor: Actor | null
): Promise<CalendarContext> {
  if (!actor)
    return { actor, churches: [], scopes: new Set(), sharedNames: new Map() };
  eligibility(actor);
  const connections = await tx.churchConnection.findMany({
    where: { userId: actor.id, state: "APPROVED" },
    take: 201,
    select: { id: true, church: { select: { id: true, name: true } } }
  });
  if (connections.length > 200)
    throw new PortalError(
      503,
      "Your church connections need an administrator to review their size."
    );
  const grants = await effectiveChurchGrants(
    tx,
    actor.id,
    connections.map((c) => c.church.id),
    ["EDIT_CHURCH_CALENDAR", "PUBLISH_CHURCH_EVENTS"]
  );
  return {
    actor,
    sharedNames: new Map(),
    churches: connections.map((c) => ({ ...c.church, connectionId: c.id })),
    scopes: new Set(
      grants
        .filter(
          (g) =>
            !g.dependency ||
            (g.dependency.userId === actor.id &&
              g.dependency.churchId === g.churchId &&
              g.dependency.state === "APPROVED")
        )
        .map((g) => `${g.churchId}:${g.capability}`)
    )
  };
}
export function calendarHas(
  context: CalendarContext,
  churchId: string,
  scope: ChurchCapability
) {
  return context.scopes.has(`${churchId}:${scope}`);
}
export function calendarOwn(context: CalendarContext, calendar: CalendarRow) {
  return !!context.actor && calendar.ownerId === context.actor.id;
}
export function calendarCanEdit(
  context: CalendarContext,
  calendar: CalendarRow
) {
  return (
    !calendar.archivedAt &&
    (calendarOwn(context, calendar) ||
      (!!calendar.churchId &&
        calendarHas(context, calendar.churchId, "EDIT_CHURCH_CALENDAR")))
  );
}
export function requireCalendarEdit(
  context: CalendarContext,
  calendar: CalendarRow
) {
  if (!calendarCanEdit(context, calendar))
    throw new PortalError(
      403,
      "You cannot edit this calendar. Refresh to review your current access."
    );
}
type Share = {
  churchId: string;
  level: "BUSY" | "DETAILS";
  revokedAt: Date | null;
  connection: { userId: string; churchId: string; state: string };
};
export function sharedLevel(
  context: CalendarContext,
  calendar: CalendarRow,
  shares: Share[]
): "BUSY" | "DETAILS" | null {
  if (!calendar.owner || !isEligible(calendar.owner) || calendar.archivedAt)
    return null;
  const active = shares.filter(
    (s) =>
      !s.revokedAt &&
      s.connection.userId === calendar.ownerId &&
      s.connection.churchId === s.churchId &&
      s.connection.state === "APPROVED" &&
      context.churches.some((c) => c.id === s.churchId)
  );
  return active.some((s) => s.level === "DETAILS")
    ? "DETAILS"
    : active.length
      ? "BUSY"
      : null;
}
export function eventAccess(
  context: CalendarContext,
  event: EventRow
): "EDIT" | "DETAILS" | "BUSY" | null {
  const calendar = event.calendar;
  if (calendar.archivedAt || (calendar.owner && !isEligible(calendar.owner)))
    return null;
  if (calendarCanEdit(context, calendar)) return "EDIT";
  if (calendar.churchId) {
    if (calendarHas(context, calendar.churchId, "PUBLISH_CHURCH_EVENTS"))
      return "DETAILS";
    if (event.visibility === "PUBLIC") return "DETAILS";
    if (
      event.visibility === "CHURCH" &&
      context.churches.some((c) => c.id === calendar.churchId)
    )
      return "DETAILS";
    return null;
  }
  const a = sharedLevel(context, calendar, calendar.shares),
    b = sharedLevel(context, calendar, event.shares);
  return a === "DETAILS" || b === "DETAILS" ? "DETAILS" : a || b;
}
export function calendarSource(
  context: CalendarContext,
  calendar: CalendarRow,
  level: string | null
) {
  if (calendar.church)
    return {
      kind: "CHURCH" as const,
      label: calendar.church.name,
      churchId: calendar.church.id
    };
  if (calendarOwn(context, calendar))
    return { kind: "PERSONAL" as const, label: calendar.name };
  const name = calendar.ownerId
    ? context.sharedNames.get(calendar.ownerId)
    : undefined;
  return {
    kind: "SHARED" as const,
    label: name
      ? `${name} · ${level === "BUSY" ? "busy only" : "shared calendar"}`
      : level === "BUSY"
        ? "Shared busy calendar"
        : "Shared personal calendar"
  };
}
export async function loadCalendarSourceNames(
  tx: CalendarTx,
  context: CalendarContext,
  calendars: CalendarRow[]
) {
  const owners = [
    ...new Set(
      calendars.flatMap((c) =>
        c.ownerId && c.ownerId !== context.actor?.id ? [c.ownerId] : []
      )
    )
  ];
  if (!owners.length || !context.actor) return;
  const names = await tx.churchDirectoryPreference.findMany({
    where: {
      listed: true,
      connection: {
        userId: { in: owners },
        churchId: { in: context.churches.map((c) => c.id) },
        state: "APPROVED",
        user: eligibleWhere
      }
    },
    select: { displayName: true, connection: { select: { userId: true } } },
    take: 1001
  });
  for (const name of names)
    context.sharedNames.set(name.connection.userId, name.displayName);
}
type OccurrenceDetails = {
  description: string;
  location: string;
  onlineUrl: string;
  organizer: string;
  version: number;
  eventVersion: number;
  isException: boolean;
  recurring: boolean;
  visibility: "PRIVATE" | "CHURCH" | "PUBLIC";
  canEdit: boolean;
  canPublish: boolean;
  response: { state: string; version: number } | null;
};
export type CalendarOccurrenceView = {
  id: string;
  eventId: string;
  calendarId: string;
  title: string;
  startAt: string;
  endAt: string;
  startLocal: string;
  endLocal: string;
  allDay: boolean;
  timeZone: string;
  canceled: boolean;
  source: ReturnType<typeof calendarSource>;
} & (
  | ({ access: "BUSY" } & { [K in keyof OccurrenceDetails]?: never })
  | ({ access: "EDIT" | "DETAILS" } & OccurrenceDetails)
);
export function projectOccurrence(
  context: CalendarContext,
  event: EventRow,
  row: CalendarOccurrence,
  response?: { state: string; version: number }
): CalendarOccurrenceView | null {
  const access = eventAccess(context, event);
  if (!access) return null;
  const timing = {
    id: row.id,
    eventId: event.id,
    calendarId: event.calendarId,
    startAt: row.startAt.toISOString(),
    endAt: row.endAt.toISOString(),
    startLocal: row.startLocal,
    endLocal: row.endLocal,
    allDay: row.allDay,
    timeZone: row.timeZone,
    canceled: !!(row.canceledAt || event.canceledAt),
    source: calendarSource(context, event.calendar, access),
    access
  };
  if (access === "BUSY") return { ...timing, access: "BUSY", title: "Busy" };
  return {
    ...timing,
    access,
    title: row.title,
    description: row.description,
    location: row.location,
    onlineUrl: row.onlineUrl,
    organizer: row.organizer,
    version: row.version,
    eventVersion: event.version,
    isException: row.isException,
    recurring: !!event.weeklyUntil,
    visibility: event.visibility,
    canEdit:
      access === "EDIT" &&
      (event.visibility === "PRIVATE" ||
        (!!event.calendar.churchId &&
          calendarHas(
            context,
            event.calendar.churchId,
            "PUBLISH_CHURCH_EVENTS"
          ))),
    canPublish:
      !!event.calendar.churchId &&
      calendarHas(context, event.calendar.churchId, "PUBLISH_CHURCH_EVENTS"),
    response: response ?? null
  };
}
export function accessibleCalendarWhere(
  context: CalendarContext
): Prisma.PlatformCalendarWhereInput {
  const churchIds = context.churches.map((c) => c.id);
  return {
    archivedAt: null,
    OR: [
      ...(context.actor ? [{ ownerId: context.actor.id }] : []),
      { churchId: { in: churchIds } },
      {
        owner: eligibleWhere,
        shares: {
          some: {
            churchId: { in: churchIds },
            revokedAt: null,
            connection: { state: "APPROVED" }
          }
        }
      },
      {
        owner: eligibleWhere,
        events: {
          some: {
            shares: {
              some: {
                churchId: { in: churchIds },
                revokedAt: null,
                connection: { state: "APPROVED" }
              }
            }
          }
        }
      }
    ]
  };
}
export function calendarField(
  value: unknown,
  max: number,
  optional = false
): string {
  if (
    typeof value !== "string" ||
    value.length > max ||
    (!optional && !value.trim()) ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)
  )
    throw new PortalError(400, "Check the required fields and their length.");
  return value.trim();
}
export function calendarId(value: unknown) {
  const id = calendarField(value, 100);
  if (!/^[A-Za-z0-9_-]+$/.test(id))
    throw new PortalError(400, "Check the calendar or event link.");
  return id;
}
