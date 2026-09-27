import type { PlatformPost } from "@prisma/client";
import { calendarContext, eventAccess, eventInclude } from "./calendar-access";
import { exchangeReadableWhere } from "./exchange-policy";
import {
  postReadableWhere,
  type PostContext,
  type PostTx
} from "./post-access";
import { isEligible, PortalError } from "./portal-policy";
import {
  participationActive,
  participationInclude
} from "./post-participation";
import { volunteerShift } from "./volunteer-shift";
import {
  postResourceReferences,
  resourceKey,
  type PostResourceReference
} from "./post-resource-input";

export type PostResourceCard = PostResourceReference & {
  title: string;
  href: string;
  state: string;
  startAt?: string;
  endAt?: string;
  timeZone?: string;
  allDay?: boolean;
  startLocal?: string;
  endLocal?: string;
};

/** One bounded ORM lookup per kind (with relation queries); no management projection. */
export async function resolvePostResourcesIn(
  tx: PostTx,
  context: PostContext,
  references: PostResourceReference[]
): Promise<Map<string, PostResourceCard>> {
  if (references.length > 180)
    throw new PortalError(400, "Read a smaller page of resource cards.");
  const result = new Map<string, PostResourceCard>();
  const ids = (kind: PostResourceReference["kind"]) => [
    ...new Set(references.filter((r) => r.kind === kind).map((r) => r.id))
  ];
  const listings = ids("exchangeListing");
  if (listings.length) {
    const rows = await tx.exchangeListing.findMany({
      where: {
        AND: [{ id: { in: listings } }, exchangeReadableWhere(context)]
      },
      select: { id: true, title: true, state: true, helpPurpose: true }
    });
    for (const row of rows) {
      const card: PostResourceCard = {
        kind: "exchangeListing",
        id: row.id,
        title: row.title,
        href: `/platform/exchange/${row.helpPurpose === "INTERCHURCH_V1" ? "help/" : ""}${row.id}`,
        state:
          row.state === "CLOSED"
            ? "Closed"
            : row.state === "RESERVED"
              ? "Reserved"
              : "Available"
      };
      result.set(resourceKey(card), card);
    }
  }
  const events = ids("eventOccurrence");
  if (events.length) {
    const actor = context.actorId
      ? await tx.platformUser.findUnique({
          where: { id: context.actorId },
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
        })
      : null;
    const scope = await calendarContext(
      tx,
      actor && isEligible(actor) ? actor : null
    );
    // Anonymous contexts normally have no churches. A write-only synthetic
    // audience context checks the least-privileged member, never the editor.
    if (!context.actorId)
      scope.churches = context.churches.map((id) => ({
        id,
        name: "",
        connectionId: ""
      }));
    const rows = await tx.calendarOccurrence.findMany({
      where: { id: { in: events } },
      include: { event: { include: eventInclude } }
    });
    for (const row of rows) {
      if (context.blockedIds?.includes(row.event.calendar.ownerId ?? ""))
        continue;
      const access = eventAccess(scope, row.event);
      if (!access || access === "BUSY") continue;
      const card: PostResourceCard = {
        kind: "eventOccurrence",
        id: row.id,
        title: row.title,
        href: `/platform/events/${row.id}`,
        state: row.canceledAt || row.event.canceledAt ? "Canceled" : "Event",
        startAt: row.startAt.toISOString(),
        endAt: row.endAt.toISOString(),
        startLocal: row.startLocal,
        endLocal: row.endLocal,
        timeZone: row.timeZone,
        allDay: row.allDay
      };
      result.set(resourceKey(card), card);
    }
  }
  const opportunities = ids("volunteerOpportunity");
  if (opportunities.length) {
    const rows = await tx.volunteerOpportunity.findMany({
      where: {
        id: { in: opportunities },
        recoveryRequired: false,
        post: {
          AND: [{ authorChurchId: { not: null } }, postReadableWhere(context)]
        }
      },
      include: { slot: true, post: { include: participationInclude } }
    });
    for (const row of rows) {
      const post = row.post;
      if (!post || (row.slot && row.slot.postId !== post.id)) continue;
      const time =
        row.slot && post.eventOccurrence
          ? volunteerShift(row.slot, post.eventOccurrence)
          : null;
      const closed =
        row.closedAt ||
        row.slot?.closedAt ||
        !participationActive(post) ||
        (row.slot && (!time || time.conflict || time.endAt <= new Date()));
      const card: PostResourceCard = {
        kind: "volunteerOpportunity",
        id: row.id,
        title: row.title,
        href: `/platform/serve/${row.id}`,
        state: closed ? "Closed" : "Open"
      };
      result.set(resourceKey(card), card);
    }
  }
  return result;
}

export function resourceCards(
  references: PostResourceReference[],
  resolved: Map<string, PostResourceCard>
) {
  return references.flatMap((r) => {
    const card = resolved.get(resourceKey(r));
    return card ? [card] : [];
  });
}

export async function validatePostResourcesIn(
  tx: PostTx,
  context: PostContext,
  post: Pick<PlatformPost, "audience" | "audienceChurchId">,
  input: unknown
) {
  const references = postResourceReferences(input);
  if (!references.length) return references;
  const current = await resolvePostResourcesIn(tx, context, references);
  if (current.size !== references.length)
    throw new PortalError(
      409,
      "A resource is no longer available. Keep your draft and remove or replace its card."
    );
  const audience: PostContext = {
    actorId: null,
    eligible: false,
    churches:
      post.audience === "CHURCH" && post.audienceChurchId
        ? [post.audienceChurchId]
        : [],
    publishers: new Set(),
    moderators: new Set(),
    volunteers: new Set()
  };
  const visible = await resolvePostResourcesIn(tx, audience, references);
  if (visible.size !== references.length)
    throw new PortalError(
      400,
      "This post would widen a resource's audience. Choose a compatible post audience or remove its card. Sharing a card does not change source permissions."
    );
  return references;
}
