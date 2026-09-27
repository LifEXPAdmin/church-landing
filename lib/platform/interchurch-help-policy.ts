import { createHash } from "node:crypto";
import type {
  ChurchCapability,
  InterchurchHelpOffer,
  InterchurchHelpRequest
} from "@prisma/client";
import { activeRoleGrantWhere } from "./church-permissions";

import { postContext, type PostTx } from "./post-access";
import {
  exchangeAuthority,
  exchangeCanManage,
  requireExchangeActor
} from "./exchange-policy";
import { eligibleWhere, PortalError } from "./portal-policy";
import { requirePrivilegedAuthentication } from "./privileged-auth-policy";
import { postId } from "./post-input";
import { HELP_PURPOSE } from "./interchurch-help-options";
import { parseHelpTerms } from "./interchurch-help-input";
export const helpUnavailable = () =>
  new PortalError(
    404,
    "This ministry help record is unavailable to your current account or church duties."
  );
const digest = (v: unknown) =>
  createHash("sha256").update(JSON.stringify(v)).digest("hex");

type AuthorityInput = {
  userId: string;
  churchId: string;
  capability: ChurchCapability;
};
const authorityId = (v: AuthorityInput) =>
  JSON.stringify([v.userId, v.churchId, v.capability]);
// Resolve the same direct/assignment contract in bounded batches. No role title,
// membership or Exchange capability implies permission to commit a church.
async function helpAuthorityKeys(tx: PostTx, inputs: AuthorityInput[]) {
  const keys = [...new Map(inputs.map((v) => [authorityId(v), v])).values()];
  const result = new Map<string, string>();
  if (!keys.length) return result;
  if (keys.length > 200)
    throw new PortalError(503, "Ministry authority needs a size review.");
  const users = [...new Set(keys.map((k) => k.userId))],
    churches = [...new Set(keys.map((k) => k.churchId))];
  const people = await tx.platformUser.findMany({
    where: {
      id: { in: users },
      ...eligibleWhere,
      erasedAt: null,
      deletionRequestedAt: null
    },
    select: { id: true }
  });
  const connections = await tx.churchConnection.findMany({
    where: {
      userId: { in: users },
      churchId: { in: churches },
      state: "APPROVED"
    },
    select: {
      id: true,
      userId: true,
      churchId: true,
      version: true,
      state: true
    },
    take: 40001
  });
  const direct = await tx.churchCapabilityGrant.findMany({
    where: { OR: keys, revokedAt: null },
    include: { dependency: true, church: { select: { version: true } } },
    take: 5001
  });
  const roles = await tx.churchRoleGrant.findMany({
    where: {
      OR: keys.map((k) => ({
        churchId: k.churchId,
        capability: k.capability,
        assignment: { connection: { userId: k.userId } }
      })),
      ...activeRoleGrantWhere()
    },
    include: {
      assignment: {
        include: {
          position: { select: { id: true, archivedAt: true } },
          connection: { include: { church: { select: { version: true } } } }
        }
      }
    },
    take: 5001
  });
  if (connections.length > 40000 || direct.length > 5000 || roles.length > 5000)
    throw new PortalError(503, "Ministry authority needs a size review.");
  for (const key of keys) {
    const connection = connections.find(
      (c) => c.userId === key.userId && c.churchId === key.churchId
    );
    if (!connection || !people.some((p) => p.id === key.userId)) continue;
    const grants = direct
      .filter(
        (g) =>
          g.userId === key.userId &&
          g.churchId === key.churchId &&
          g.capability === key.capability &&
          (!g.dependency ||
            (g.dependency.userId === key.userId &&
              g.dependency.churchId === key.churchId &&
              g.dependency.state === "APPROVED"))
      )
      .map((g) => [
        g.id,
        g.version,
        "INDEPENDENT",
        g.dependency?.id,
        g.dependency?.version,
        g.church.version
      ]);
    grants.push(
      ...roles
        .filter(
          (g) =>
            g.assignment.connection.userId === key.userId &&
            g.churchId === key.churchId &&
            g.capability === key.capability
        )
        .map((g) => [
          g.id,
          g.version,
          "ASSIGNMENT",
          g.assignmentId,
          g.assignment.version,
          g.assignment.connection.version,
          g.assignment.connection.church.version
        ])
    );
    if (grants.length)
      result.set(
        authorityId(key),
        digest([
          "ministry-help-authority-v1",
          key.userId,
          key.churchId,
          key.capability,
          {
            id: connection.id,
            version: connection.version,
            state: connection.state
          },
          grants.sort((a, b) => String(a[0]).localeCompare(String(b[0])))
        ])
      );
  }
  return result;
}
export async function helpAuthorityKey(
  tx: PostTx,
  userId: string,
  churchId: string,
  capability: ChurchCapability
) {
  const key = { userId, churchId, capability };
  return (await helpAuthorityKeys(tx, [key])).get(authorityId(key)) ?? null;
}
export async function managedHelp(tx: PostTx, actorId: string, id: unknown) {
  const context = await postContext(tx, actorId);
  requireExchangeActor(context);
  const row = await tx.interchurchHelpRequest.findUnique({
    where: { id: postId(id) },
    include: { listing: true }
  });
  if (
    !row?.listing ||
    row.recoveryRequired ||
    row.schema !== 1 ||
    row.listing.helpPurpose !== HELP_PURPOSE ||
    row.listing.recoveryRequired ||
    !exchangeCanManage(
      context,
      await exchangeAuthority(tx, context),
      row.listing
    )
  )
    throw helpUnavailable();
  await requirePrivilegedAuthentication(tx, actorId);
  return row;
}
export async function helpCoordinatorCurrent(
  tx: PostTx,
  row: InterchurchHelpRequest
) {
  if (
    !row.coordinatorId ||
    !row.coordinatorKey ||
    !row.listingId ||
    row.recoveryRequired ||
    row.schema !== 1
  )
    return false;
  const listing = await tx.exchangeListing.findUnique({
    where: { id: row.listingId }
  });
  return !!(
    listing?.ownerChurchId &&
    !listing.erasedAt &&
    !listing.recoveryRequired &&
    listing.helpPurpose === HELP_PURPOSE &&
    (await helpAuthorityKey(
      tx,
      row.coordinatorId,
      listing.ownerChurchId,
      "MANAGE_EXCHANGE_LISTINGS"
    )) === row.coordinatorKey
  );
}
export async function requireHelpCoordinator(
  tx: PostTx,
  row: InterchurchHelpRequest,
  actorId: string
) {
  if (row.coordinatorId !== actorId || !(await helpCoordinatorCurrent(tx, row)))
    throw helpUnavailable();
  await requirePrivilegedAuthentication(tx, actorId);
}
type PairInput = {
  requestId: string;
  responderId: string;
  kind: string;
  respondingChurchId: string | null;
};
const pairId = (v: PairInput) =>
  JSON.stringify([v.requestId, v.responderId, v.kind, v.respondingChurchId]);
async function helpPairs(tx: PostTx, inputs: PairInput[]) {
  const pairs = [...new Map(inputs.map((v) => [pairId(v), v])).values()];
  if (pairs.length > 100)
    throw new PortalError(503, "Read a smaller ministry help page.");
  const rows = await tx.interchurchHelpRequest.findMany({
    where: {
      id: { in: pairs.map((p) => p.requestId) },
      schema: 1,
      recoveryRequired: false
    },
    include: {
      listing: {
        include: { ownerChurch: { select: { communityListed: true } } }
      }
    }
  });
  const users = [
    ...new Set([
      ...pairs.map((p) => p.responderId),
      ...rows.flatMap((r) => (r.coordinatorId ? [r.coordinatorId] : []))
    ])
  ];
  const churches = [
    ...new Set([
      ...pairs.flatMap((p) =>
        p.respondingChurchId ? [p.respondingChurchId] : []
      ),
      ...rows.flatMap((r) =>
        r.listing?.ownerChurchId ? [r.listing.ownerChurchId] : []
      )
    ])
  ];
  const people = await tx.platformUser.findMany({
    where: {
      id: { in: users },
      ...eligibleWhere,
      erasedAt: null,
      deletionRequestedAt: null
    },
    select: {
      id: true,
      socialPreferences: { select: { version: true, contactRequests: true } }
    }
  });
  const connections = await tx.churchConnection.findMany({
    where: {
      userId: { in: users },
      churchId: { in: churches },
      state: "APPROVED"
    },
    select: {
      id: true,
      userId: true,
      churchId: true,
      version: true,
      state: true
    },
    take: 40001
  });
  if (connections.length > 40000)
    throw new PortalError(503, "Ministry connections need a size review.");
  const relationshipPairs = pairs.flatMap((p) => {
    const r = rows.find((r) => r.id === p.requestId);
    return r?.coordinatorId
      ? [
          { ownerId: p.responderId, targetUserId: r.coordinatorId },
          { ownerId: r.coordinatorId, targetUserId: p.responderId }
        ]
      : [];
  });
  const blocks = await tx.socialRelationship.findMany({
    where: { blocked: true, OR: relationshipPairs },
    select: { ownerId: true, targetUserId: true },
    take: 201
  });
  const follows = await tx.platformFollow.findMany({
    where: {
      OR: relationshipPairs.map((p) => ({
        followerId: p.ownerId,
        followingId: p.targetUserId
      }))
    },
    select: { id: true, followerId: true, followingId: true },
    take: 201
  });
  const authorities = await helpAuthorityKeys(tx, [
    ...rows.flatMap((r) =>
      r.coordinatorId && r.listing?.ownerChurchId
        ? [
            {
              userId: r.coordinatorId,
              churchId: r.listing.ownerChurchId,
              capability: "MANAGE_EXCHANGE_LISTINGS" as const
            }
          ]
        : []
    ),
    ...pairs.flatMap((p) =>
      p.kind === "ORGANIZATION" && p.respondingChurchId
        ? [
            {
              userId: p.responderId,
              churchId: p.respondingChurchId,
              capability: "COMMIT_INTERCHURCH_HELP" as const
            }
          ]
        : []
    )
  ]);
  const result = new Map<
    string,
    { request: (typeof rows)[number]; authorityKey: string }
  >();
  for (const p of pairs) {
    const row = rows.find((r) => r.id === p.requestId),
      listing = row?.listing;
    if (
      !row?.coordinatorId ||
      !row.coordinatorKey ||
      !listing?.ownerChurchId ||
      !listing.ownerChurch ||
      listing.ownerId ||
      listing.helpPurpose !== HELP_PURPOSE ||
      listing.erasedAt ||
      listing.recoveryRequired ||
      listing.moderationState !== "VISIBLE" ||
      !listing.publishedAt ||
      !["ACTIVE", "RESERVED", "CLOSED"].includes(listing.state)
    )
      continue;
    if (
      authorities.get(
        authorityId({
          userId: row.coordinatorId,
          churchId: listing.ownerChurchId,
          capability: "MANAGE_EXCHANGE_LISTINGS"
        })
      ) !== row.coordinatorKey
    )
      continue;
    const person = people.find((u) => u.id === p.responderId),
      coordinator = people.find((u) => u.id === row.coordinatorId);
    if (!person || !coordinator || person.id === coordinator.id) continue;
    const connection = connections.find(
      (c) => c.userId === person.id && c.churchId === listing.ownerChurchId
    );
    if (!listing.ownerChurch.communityListed && !connection) continue;
    if (
      listing.audience !== "PUBLIC" &&
      (listing.audience !== "CHURCH" ||
        listing.audienceChurchId !== listing.ownerChurchId ||
        !connection)
    )
      continue;
    if (
      blocks.some(
        (b) =>
          (b.ownerId === person.id && b.targetUserId === coordinator.id) ||
          (b.ownerId === coordinator.id && b.targetUserId === person.id)
      )
    )
      continue;
    const preferences = coordinator.socialPreferences,
      follow = follows.find(
        (f) => f.followerId === coordinator.id && f.followingId === person.id
      );
    if (
      preferences?.contactRequests !== "EVERYONE" &&
      !(preferences?.contactRequests === "FOLLOWED" && follow)
    )
      continue;
    const organizationKey =
      p.kind === "ORGANIZATION" && p.respondingChurchId
        ? authorities.get(
            authorityId({
              userId: person.id,
              churchId: p.respondingChurchId,
              capability: "COMMIT_INTERCHURCH_HELP"
            })
          )
        : null;
    if (
      (p.kind !== "PERSONAL" && p.kind !== "ORGANIZATION") ||
      (p.kind === "PERSONAL" && p.respondingChurchId !== null) ||
      (p.kind === "ORGANIZATION" && !organizationKey)
    )
      continue;
    result.set(pairId(p), {
      request: row,
      authorityKey: digest([
        row.coordinatorKey,
        row.consentVersion,
        preferences.version,
        preferences.contactRequests === "FOLLOWED" ? follow?.id : null,
        listing.audience === "CHURCH" && connection
          ? {
              id: connection.id,
              version: connection.version,
              state: connection.state
            }
          : null,
        organizationKey ?? null
      ])
    });
  }
  return result;
}
export async function helpPair(
  tx: PostTx,
  requestId: string,
  responderId: string,
  kind: string,
  churchId: string | null
) {
  const p = { requestId, responderId, kind, respondingChurchId: churchId };
  return (await helpPairs(tx, [p])).get(pairId(p)) ?? null;
}
export async function currentHelpOffers(
  tx: PostTx,
  offers: InterchurchHelpOffer[]
) {
  const candidates = offers.filter(
    (o) =>
      o.schema === 1 &&
      o.responderId &&
      o.coordinatorId &&
      o.authorityKey &&
      o.state !== "REVOKED"
  );
  const pairs = await helpPairs(
    tx,
    candidates.map((o) => ({
      requestId: o.requestId,
      responderId: o.responderId!,
      kind: o.kind,
      respondingChurchId: o.respondingChurchId
    }))
  );
  const result = new Map<
    string,
    NonNullable<Awaited<ReturnType<typeof helpPair>>>
  >();
  for (const o of candidates) {
    try {
      parseHelpTerms(o.schema, o.terms);
    } catch {
      continue;
    }
    const p = pairs.get(
      pairId({
        requestId: o.requestId,
        responderId: o.responderId!,
        kind: o.kind,
        respondingChurchId: o.respondingChurchId
      })
    );
    if (
      p?.request.coordinatorId === o.coordinatorId &&
      p.authorityKey === o.authorityKey
    )
      result.set(o.id, p);
  }
  return result;
}
export async function currentHelpOffer(
  tx: PostTx,
  offer: InterchurchHelpOffer
) {
  return (await currentHelpOffers(tx, [offer])).get(offer.id) ?? null;
}
export function requireHelpOpen(
  row: InterchurchHelpRequest & { listing: { state: string } | null }
) {
  if (
    row.outcome !== "OPEN" ||
    row.listing?.state !== "ACTIVE" ||
    row.endAt <= new Date()
  )
    throw new PortalError(
      409,
      "This request is closed to new help. Existing agreements and explicit outcomes remain separate."
    );
}
