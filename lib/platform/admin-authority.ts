import {
  Prisma,
  type PrismaClient,
  type OperatorCapability
} from "@prisma/client";
import { withOwnedSession } from "./account-sessions";
import { effectiveChurchGrants } from "./church-permissions";
import { postContext } from "./post-access";
import { eligibleWhere, PortalError } from "./portal-policy";
import type { AdminNavigation } from "./admin-types";
import { createHmac } from "node:crypto";
import { accountConfig } from "./account-config";
import { requirePrivilegedAuthentication } from "./privileged-auth-policy";
import { exchangeAuthority } from "./exchange-policy";

export type AdminTx = Prisma.TransactionClient;
export const adminDenied = () =>
  new PortalError(
    404,
    "This admin view or request is not available to this account."
  );
export async function adminAuthority(tx: AdminTx, userId: string) {
  const actor = await tx.platformUser.findFirst({
    where: { id: userId, ...eligibleWhere },
    select: { id: true, name: true, username: true, dateFormat: true, timeFormat: true }
  });
  if (!actor) throw adminDenied();
  const grants = await tx.platformOperatorGrant.findMany({
    where: { userId, revokedAt: null },
    select: { id: true, capability: true, version: true }
  });
  const support = await tx.supportCapabilityGrant.findMany({
    where: { userId, revokedAt: null },
    select: { id: true, capability: true, version: true }
  });
  const capabilities = new Set(grants.map((g) => g.capability));
  // Most members have no operational role. Check indexed candidate references
  // before loading the much larger social context; this is never an access grant.
  const [candidate] = await tx.$queryRaw<
    { church: boolean; topic: boolean }[]
  >(Prisma.sql`SELECT
    (EXISTS (SELECT 1 FROM "ChurchCapabilityGrant" WHERE "userId"=${userId} AND "revokedAt" IS NULL)
      OR EXISTS (SELECT 1 FROM "ChurchRoleGrant" g JOIN "ChurchConnection" c ON c.id=g."connectionId" WHERE c."userId"=${userId} AND g."revokedAt" IS NULL)) AS church,
    (EXISTS (SELECT 1 FROM "TopicCommunity" WHERE "ownerId"=${userId})
      OR EXISTS (SELECT 1 FROM "TopicMembership" WHERE "userId"=${userId} AND moderator)) AS topic`);
  if (
    !grants.length &&
    !support.some(
      (g) => g.capability === "RESPOND" || g.capability === "ASSIGN"
    ) &&
    !candidate.church &&
    !candidate.topic
  )
    throw adminDenied();
  const churches = candidate.church
    ? await effectiveChurchGrants(tx, userId)
    : [];
  await requirePrivilegedAuthentication(tx, userId);
  const context =
    candidate.church || candidate.topic ? await postContext(tx, userId) : null;
  const reports = {
    churches: [...(context?.moderators ?? [])],
    exchangeChurches: context ? (await exchangeAuthority(tx, context)).moderators : [],
    topics: [...(context?.topicModerators ?? [])],
    global: capabilities.has("REVIEW_COMMUNITY_REPORTS")
  };
  const topicVersions = candidate.topic
    ? await tx.topicMembership.findMany({
        where: { userId },
        select: { id: true, version: true },
        orderBy: { id: "asc" },
        take: 201
      })
    : [];
  const proofRows = [
    ...grants.map((g) => ["operator", g.id, g.version]),
    ...churches.map((g) => ["church", g.id, g.version]),
    ...topicVersions.map((g) => ["topic", g.id, g.version])
  ]
    .map((g) => g.join(":"))
    .sort();
  const assignmentProof = createHmac(
    "sha256",
    accountConfig().rateSecret + ":admin-assignment"
  )
    .update(userId + ":" + JSON.stringify(proofRows))
    .digest("hex");
  const claimChurches = churches.filter(
    (g) => g.capability === "MANAGE_CHURCH_ACCESS"
  );
  const reportReviewer =
    reports.global || !!reports.churches.length || !!reports.topics.length || !!reports.exchangeChurches.length;
  const respond = support.find((g) => g.capability === "RESPOND") ?? null;
  const assign = support.find((g) => g.capability === "ASSIGN") ?? null;
  const canClaims =
    capabilities.has("REVIEW_CHURCH_CLAIMS") || !!claimChurches.length;
  const canQueue = !!respond || !!assign || reportReviewer || canClaims;
  if (!canQueue && !grants.length) throw adminDenied();
  const sections: AdminNavigation["sections"] = [
    { key: "overview", label: "Overview", href: "/platform/admin" }
  ];
  if (canQueue)
    sections.push({
      key: "requests",
      label: "Requests",
      href: "/platform/admin/requests"
    });
  if (respond || capabilities.has("MANAGE_PRODUCT_FEEDBACK"))
    sections.push({
      key: "feedback",
      label: "Feedback",
      href: respond
        ? "/platform/admin/feedback"
        : "/platform/admin/feedback/ideas"
    });
  if (
    capabilities.has("LOOKUP_ACCOUNTS") ||
    capabilities.has("MANAGE_ACCOUNTS")
  )
    sections.push({
      key: "people",
      label: "People",
      href: "/platform/admin/people"
    });
  if (
    canClaims ||
    capabilities.has("REVIEW_CHURCH_LISTINGS") ||
    capabilities.has("ESTABLISH_CHURCH")
  )
    sections.push({
      key: "churches",
      label: "Churches",
      href: "/platform/admin/churches"
    });
  if (capabilities.has("VIEW_OPERATIONAL_HEALTH"))
    sections.push({
      key: "health",
      label: "Health",
      href: "/platform/admin/health"
    });
  if (capabilities.has("VIEW_PLATFORM_METRICS"))
    sections.push({
      key: "growth",
      label: "Growth",
      href: "/platform/admin/growth"
    });
  if (capabilities.has("MANAGE_ADMIN_ACCESS"))
    sections.push({
      key: "access",
      label: "Access",
      href: "/platform/admin/access"
    });
  if (capabilities.has("VIEW_ADMIN_AUDIT"))
    sections.push({
      key: "audit",
      label: "Audit",
      href: "/platform/admin/audit"
    });
  const churchIds = [
    ...new Set([...claimChurches.map((g) => g.churchId), ...reports.churches, ...reports.exchangeChurches])
  ];
  const navigation: AdminNavigation = {
    viewer: actor,
    canReviewClaims: canClaims,
    sections,
    capabilities: [...capabilities, ...support.map((g) => g.capability)],
    churches: churchIds.length
      ? await tx.church.findMany({
          where: { id: { in: churchIds } },
          select: { id: true, name: true },
          orderBy: [{ name: "asc" }, { id: "asc" }],
          take: 201
        })
      : [],
    topics: reports.topics.length
      ? await tx.topicCommunity.findMany({
          where: { id: { in: reports.topics } },
          select: { id: true, name: true },
          orderBy: [{ name: "asc" }, { id: "asc" }],
          take: 201
        })
      : []
  };
  if (navigation.churches.length > 200 || navigation.topics.length > 200)
    throw new PortalError(
      503,
      "This operator scope needs a size review before loading."
    );
  return {
    actor,
    grants,
    capabilities,
    support,
    respond,
    assign,
    churches,
    reports,
    reportReviewer,
    canClaims,
    canQueue,
    assignmentProof,
    navigation
  };
}
export type AdminAuthority = Awaited<ReturnType<typeof adminAuthority>>;
export function requireAdminCapability(
  authority: AdminAuthority,
  capability: OperatorCapability
) {
  const grant = authority.grants.find((g) => g.capability === capability);
  if (!grant) throw adminDenied();
  return grant;
}
export function withAdmin<T>(
  db: PrismaClient,
  token: unknown,
  work: (tx: AdminTx, authority: AdminAuthority) => Promise<T>,
  write = false
) {
  return withOwnedSession(
    db,
    token,
    async (tx, current) => work(tx, await adminAuthority(tx, current.userId)),
    write ? true : "shared"
  );
}
export function readAdminNavigation(db: PrismaClient, token: unknown) {
  return withAdmin(db, token, async (_tx, authority) => authority.navigation);
}
