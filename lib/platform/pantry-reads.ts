import {
  pantryRequestReadSources,
  type PantryReadSource
} from "./pantry-read-access";
import { requirePrivilegedAuthentication } from "./privileged-auth-policy";
import type { PantryHub, PantryRequest, PrismaClient } from "@prisma/client";
import { withAccountRead } from "./account-read";
import { exchangeAuthority, exchangeReadableWhere } from "./exchange-policy";
import {
  PANTRY_PAGE,
  PANTRY_SCHEMA,
  pantryActive,
  pantryOccupied
} from "./pantry-options";
import {
  currentPantryCoordinator,
  pantryManagedChurches,
  pantryPair,
  pantryReadableWhere,
  requirePantryCoordinator,
  requirePantryManager,
  unavailablePantry
} from "./pantry-policy";
import { postContext, type PostContext, type PostTx } from "./post-access";
import { postId } from "./post-input";
import { PortalError } from "./portal-policy";

export type PantryItems = {
  categoryId: string;
  version: number;
  label: string;
  unit: string;
  quantity: number;
}[];
export function pantryItems(value: unknown): PantryItems {
  if (!Array.isArray(value) || value.length > 12) return [];
  return value.flatMap((v) =>
    v &&
    typeof v === "object" &&
    typeof v.categoryId === "string" &&
    typeof v.label === "string" &&
    typeof v.unit === "string" &&
    Number.isInteger(v.quantity) &&
    v.quantity > 0
      ? [
          {
            categoryId: v.categoryId,
            version: v.version,
            label: v.label,
            unit: v.unit,
            quantity: v.quantity
          }
        ]
      : []
  );
}
function publicHub(hub: PantryHub, management = false) {
  return {
    id: hub.id,
    version: management ? hub.version : hub.accessVersion,
    churchId: hub.churchId,
    title: hub.title,
    description: hub.description,
    hours: hub.hours,
    accessInfo: hub.accessInfo,
    eligibility: hub.eligibility,
    audience: hub.audience,
    published: hub.published,
    intakeEnabled: hub.intakeEnabled,
    consentVersion: hub.consentVersion
  };
}
async function categories(
  tx: PostTx,
  hubId: string,
  context: PostContext,
  managed = false
) {
  const rows = await tx.pantryCategory.findMany({
    where: { hubId, ...(!managed ? { active: true } : {}) },
    orderBy: { id: "asc" },
    take: 12
  });
  const needIds = rows.flatMap((c) =>
    c.replenishmentNeedId ? [c.replenishmentNeedId] : []
  );
  const needs = await tx.exchangeNeed.findMany({
    where: {
      id: { in: needIds },
      recoveryRequired: false,
      closedAt: null,
      canceledAt: null,
      listing: {
        AND: [
          exchangeReadableWhere(context),
          { ownerChurchId: hubId, state: "ACTIVE" }
        ]
      }
    },
    select: { id: true, listing: { select: { title: true } } },
    take: 12
  });
  return rows.map((c) => ({
    id: c.id,
    version: c.version,
    label: c.label,
    unit: c.unit,
    availability: c.availability,
    quantity: c.availability === "EXACT" ? c.quantity : null,
    description: c.description,
    active: c.active,
    recordedAt: c.updatedAt.toISOString(),
    replenishment: needs.find((n) => n.id === c.replenishmentNeedId)
      ? {
          id: c.replenishmentNeedId!,
          title: needs.find((n) => n.id === c.replenishmentNeedId)!.listing!
            .title
        }
      : null
  }));
}
async function requestView(
  tx: PostTx,
  row: PantryRequest,
  actorId: string,
  knownSource: PantryReadSource | null
) {
  const own = row.requesterId === actorId;
  const source = knownSource;
  if (!own && (!source || row.coordinatorId !== actorId)) return null;
  const current = !!source,
    cleared = own ? !!row.requesterClearedAt : !!row.coordinatorClearedAt;
  const session =
    current && !cleared && row.sessionId
      ? await tx.pantrySession.findUnique({
          where: { id: row.sessionId },
          select: {
            id: true,
            startLocal: true,
            endLocal: true,
            timeZone: true,
            pickupDetails: true,
            startsAt: true,
            endsAt: true
          }
        })
      : null;
  const requester =
    !own && current && row.requesterId ? { name: source!.requesterName } : null;
  const history =
    !own && current && !cleared
      ? await tx.pantryEvent.findMany({
          where: {
            hubId: row.hubId,
            targetId: row.id,
            action: { in: ["COLLECTED", "MISSED"] }
          },
          orderBy: { version: "desc" },
          take: 20,
          select: {
            id: true,
            action: true,
            reason: true,
            version: true,
            createdAt: true
          }
        })
      : [];
  return {
    id: row.id,
    version: row.version,
    own,
    current,
    cleared,
    canWithdraw: own && pantryActive.includes(row.state),
    canClear: !pantryActive.includes(row.state) && (own || current),
    state: !current && pantryActive.includes(row.state) ? "REVOKED" : row.state,
    hubId: current ? row.hubId : null,
    title: source?.hub.title ?? "Unavailable assistance hub",
    items:
      current && !cleared && !row.requesterClearedAt
        ? pantryItems(row.items)
        : [],
    note: current && !cleared && !row.requesterClearedAt ? row.note : "",
    pickupContact: current && !cleared ? row.pickupContact : "",
    ...(!own
      ? {
          coordinatorNote: current && !cleared ? row.coordinatorNote : "",
          requester,
          outcomeHistory: history.map((e) => ({
            ...e,
            createdAt: e.createdAt.toISOString()
          }))
        }
      : {}),
    session: session
      ? {
          ...session,
          startsAt: session.startsAt.toISOString(),
          endsAt: session.endsAt.toISOString(),
          offeredVersion: row.sessionVersion
        }
      : null,
    confirmedAt: row.confirmedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    endedAt: row.endedAt?.toISOString() ?? null
  };
}
export async function readPantry(
  db: PrismaClient,
  token: unknown,
  query: { view: string; id?: unknown; after?: unknown }
) {
  return withAccountRead(db, token, async (tx, actorId) => {
    const context = await postContext(tx, actorId),
      after = query.after ? postId(query.after) : undefined;
    const viewer = actorId
      ? { id: actorId, eligible: !!context.eligible }
      : null;
    if (query.view === "replenish") {
      if (!actorId) throw unavailablePantry();
      const category = await tx.pantryCategory.findUnique({
        where: { id: postId(query.id) },
        include: { hub: true }
      });
      if (!category?.active || !category.hub.churchId)
        throw unavailablePantry();
      await requirePantryCoordinator(tx, category.hub, actorId);
      const authority = await exchangeAuthority(tx, context);
      if (
        !authority.managers.includes(category.hub.churchId) &&
        !authority.publishers.includes(category.hub.churchId)
      )
        throw unavailablePantry();
      return {
        viewer,
        replenishmentSeed: {
          categoryId: category.id,
          churchId: category.hub.churchId,
          version: category.version,
          title: `${category.label} replenishment`.slice(0, 120),
          requestedItems: `${category.label} (${category.unit})`,
          audience: category.hub.audience as "PUBLIC" | "CHURCH"
        }
      };
    }
    if (query.view === "list") {
      const rows = await tx.pantryHub.findMany({
        where: {
          AND: [
            pantryReadableWhere(context),
            ...(after ? [{ id: { gt: after } }] : [])
          ]
        },
        select: {
          id: true,
          title: true,
          description: true,
          hours: true,
          church: { select: { name: true } }
        },
        orderBy: { id: "asc" },
        take: PANTRY_PAGE + 1
      });
      return {
        viewer,
        hubs: rows.slice(0, PANTRY_PAGE),
        nextCursor: rows.length > PANTRY_PAGE ? rows[PANTRY_PAGE - 1].id : null,
        managedChurches: await pantryManagedChurches(tx, context)
      };
    }
    if (
      query.view === "mine" ||
      query.view === "request" ||
      query.view === "queue"
    ) {
      if (!actorId || !context.eligible) throw unavailablePantry();
      let hub: PantryHub | undefined;
      if (query.view === "queue") {
        hub =
          (await tx.pantryHub.findUnique({
            where: { id: postId(query.id) }
          })) ?? undefined;
        if (!hub) throw unavailablePantry();
        await requirePantryCoordinator(tx, hub, actorId);
      }
      const rows = await tx.pantryRequest.findMany({
        where: {
          ...(query.view === "mine"
            ? { requesterId: actorId }
            : query.view === "queue"
              ? { hubId: hub!.id, coordinatorId: actorId }
              : {
                  id: postId(query.id),
                  OR: [{ requesterId: actorId }, { coordinatorId: actorId }]
                }),
          ...(after ? { id: { gt: after } } : {})
        },
        orderBy: { id: "asc" },
        take: query.view === "request" ? 1 : PANTRY_PAGE + 1
      });
      const bounded = rows.slice(0, PANTRY_PAGE),
        sources = await pantryRequestReadSources(tx, bounded);
      if (
        bounded.some(
          (row) => row.coordinatorId === actorId && sources.has(row.id)
        )
      )
        await requirePrivilegedAuthentication(tx, actorId);
      const requests = [];
      for (const row of bounded) {
        const view = await requestView(
          tx,
          row,
          actorId,
          sources.get(row.id) ?? null
        );
        if (view) requests.push(view);
      }
      if (query.view === "request" && !requests.length)
        throw unavailablePantry();
      return {
        viewer,
        requests,
        hub: hub ? publicHub(hub) : null,
        nextCursor: rows.length > PANTRY_PAGE ? rows[PANTRY_PAGE - 1].id : null
      };
    }
    if (query.view === "sessions" || query.view === "audit") {
      if (!actorId) throw unavailablePantry();
      const hub = await tx.pantryHub.findUnique({
        where: { id: postId(query.id) }
      });
      if (!hub) throw unavailablePantry();
      await requirePantryCoordinator(tx, hub, actorId);
      if (query.view === "audit") {
        const events = await tx.pantryEvent.findMany({
          where: {
            hubId: hub.id,
            action: { in: ["STOCK", "REPLENISHMENT"] },
            ...(after ? { id: { gt: after } } : {})
          },
          orderBy: { id: "asc" },
          take: PANTRY_PAGE + 1
        });
        return {
          viewer,
          events: events
            .slice(0, PANTRY_PAGE)
            .map((e) => ({
              id: e.id,
              version: e.version,
              action: e.action,
              targetId: e.targetId,
              reason: e.reason,
              previousQuantity: e.previousQuantity,
              quantity: e.quantity,
              createdAt: e.createdAt.toISOString()
            })),
          nextCursor:
            events.length > PANTRY_PAGE ? events[PANTRY_PAGE - 1].id : null
        };
      }
      const rows = await tx.pantrySession.findMany({
        where: { hubId: hub.id, ...(after ? { id: { gt: after } } : {}) },
        orderBy: { id: "asc" },
        take: PANTRY_PAGE + 1
      });
      const counts = await tx.pantryRequest.groupBy({
        by: ["sessionId"],
        where: {
          sessionId: { in: rows.slice(0, PANTRY_PAGE).map((s) => s.id) },
          state: { in: pantryOccupied }
        },
        _count: true
      });
      return {
        viewer,
        sessions: rows
          .slice(0, PANTRY_PAGE)
          .map((s) => ({
            ...s,
            startsAt: s.startsAt.toISOString(),
            endsAt: s.endsAt.toISOString(),
            createdAt: s.createdAt.toISOString(),
            occupied: counts.find((c) => c.sessionId === s.id)?._count ?? 0
          })),
        nextCursor: rows.length > PANTRY_PAGE ? rows[PANTRY_PAGE - 1].id : null
      };
    }
    if (query.view === "hub" || query.view === "manage") {
      const id = postId(query.id),
        managed = query.view === "manage";
      if (managed) {
        if (!actorId) throw unavailablePantry();
        await requirePantryManager(tx, id, actorId);
      }
      const hub = await tx.pantryHub.findFirst({
        where: managed
          ? { id, recoveryRequired: false }
          : { AND: [{ id }, pantryReadableWhere(context)] }
      });
      const church = await tx.church.findUnique({
        where: { id },
        select: { id: true, name: true, communityListed: true }
      });
      if (!church || (!hub && !managed)) throw unavailablePantry();
      const coordinated =
        !!hub &&
        hub.coordinatorId === actorId &&
        (await currentPantryCoordinator(tx, hub));
      const pair =
        hub && actorId && !coordinated
          ? await pantryPair(tx, hub, actorId, true)
          : null;
      return {
        viewer,
        schema: PANTRY_SCHEMA,
        church,
        hub: hub ? publicHub(hub, managed) : null,
        categories: hub ? await categories(tx, id, context, managed) : [],
        coordinator: pair?.coordinator ?? null,
        canRequest: !!pair,
        canCoordinate: coordinated,
        canManage:
          managed ||
          (await pantryManagedChurches(tx, context)).some((c) => c.id === id)
      };
    }
    throw new PortalError(400, "Choose a supported assistance view.");
  });
}
export type PantrySnapshot = Awaited<ReturnType<typeof readPantry>>;
export type PantryHubView = NonNullable<PantrySnapshot["hub"]>;
export type PantryCategoryView = NonNullable<
  PantrySnapshot["categories"]
>[number];
export type PantryRequestView = NonNullable<PantrySnapshot["requests"]>[number];
export type PantrySessionView = NonNullable<PantrySnapshot["sessions"]>[number];
