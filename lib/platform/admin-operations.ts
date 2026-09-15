import { Prisma, type PrismaClient } from "@prisma/client";
import { withAdmin, requireAdminCapability } from "./admin-authority";
import { adminFields } from "./admin-input";
import { adminPriorOperation, recordAdminOperation } from "./admin-cases";
import { postField, postId } from "./post-input";
import { PortalError } from "./portal-policy";
import { ADULT_POLICY } from "./portal-types";
export type AdminLookupResult = {
  version: number;
  message: string;
  person: null | {
    id: string;
    name: string;
    username: string;
    verified: boolean;
    adult: boolean;
    state: string;
    passwordSignIn: boolean;
    googleSignIn: boolean;
    createdAt: string;
  };
};
export function adminAccountLookup(
  db: PrismaClient,
  token: unknown,
  input: Record<string, unknown>
): Promise<AdminLookupResult> {
  return withAdmin(
    db,
    token,
    async (tx, a) => {
      requireAdminCapability(a, "LOOKUP_ACCOUNTS");
      adminFields(input, ["operation", "requestKey", "username", "purpose"]);
      if (
        !["SUPPORT", "VERIFICATION", "SAFETY"].includes(String(input.purpose))
      )
        throw new PortalError(
          400,
          "Choose the reason for this exact account lookup."
        );
      const username = postField(input.username, 40, 3)
        .replace(/^@/, "")
        .toLowerCase();
      if (!/^[a-z0-9_]+$/.test(username))
        throw new PortalError(400, "Enter the account's complete username.");
      const prior = await adminPriorOperation(tx, a.actor.id, input);
      const where = prior.prior
        ? typeof prior.prior.id === "string"
          ? Prisma.sql`u.id=${prior.prior.id}`
          : Prisma.sql`FALSE`
        : Prisma.sql`u.username=${username}`;
      const [row] = await tx.$queryRaw<
        {
          id: string;
          name: string;
          username: string;
          verified: boolean;
          adult: boolean;
          state: string;
          passwordSignIn: boolean;
          googleSignIn: boolean;
          createdAt: Date;
          version: number;
        }[]
      >(Prisma.sql`SELECT u.id,u.name,u.username,u."emailVerifiedAt" IS NOT NULL AS verified,
      (u."adultAcknowledgedAt" IS NOT NULL AND u."adultPolicyVersion"=${ADULT_POLICY}) AS adult,
      CASE WHEN u."deactivatedAt" IS NOT NULL THEN 'Deactivated' WHEN u."suspendedAt" IS NOT NULL THEN 'Restricted' ELSE 'Active' END AS state,
      u."passwordHash" IS NOT NULL AS "passwordSignIn", EXISTS(SELECT 1 FROM "PlatformGoogleIdentity" g WHERE g."userId"=u.id) AS "googleSignIn",u."createdAt",u."portalVersion" AS version
      FROM "PlatformUser" u WHERE ${where} LIMIT 1`);
      const message = row
        ? "Current operational account details loaded. No profile history, contacts or private conversations were read."
        : "No account matches this complete username.";
      if (!prior.prior)
        await recordAdminOperation(
          tx,
          a.actor.id,
          input,
          { sourceType: "LOOKUP", sourceId: row?.id ?? a.actor.id },
          {
            version: row?.version ?? 1,
            id: row?.id ?? null,
            purpose: String(input.purpose)
          }
        );
      return {
        version: row?.version ?? 1,
        message,
        person: row
          ? {
              id: row.id,
              name: row.name,
              username: row.username,
              verified: row.verified,
              adult: row.adult,
              state: row.state,
              passwordSignIn: row.passwordSignIn,
              googleSignIn: row.googleSignIn,
              createdAt: row.createdAt.toISOString()
            }
          : null
      };
    },
    true
  );
}
export function readAdminAudit(
  db: PrismaClient,
  token: unknown,
  after?: unknown
) {
  return withAdmin(db, token, async (tx, a) => {
    requireAdminCapability(a, "VIEW_ADMIN_AUDIT");
    const cursor = after ? postId(after) : null;
    const rows = await tx.adminOperation.findMany({
      where: {
        sourceType: { in: ["ACCESS", "MFA", "LOOKUP", "METRICS_EXPORT"] },
        ...(cursor ? { id: { lt: cursor } } : {})
      },
      select: {
        id: true,
        actor: { select: { name: true, username: true } },
        action: true,
        sourceType: true,
        sourceId: true,
        version: true,
        createdAt: true,
        result: true
      },
      orderBy: { id: "desc" },
      take: 26
    });
    return {
      navigation: a.navigation,
      next: rows.length > 25 ? rows[24].id : null,
      rows: rows.slice(0, 25).map((r) => ({
        id: r.id,
        actor: r.actor,
        action: r.action,
        sourceType: r.sourceType,
        sourceId: r.sourceId,
        version: r.version,
        createdAt: r.createdAt.toISOString(),
        reason:
          r.result &&
          typeof r.result === "object" &&
          !Array.isArray(r.result) &&
          typeof r.result.reason === "string"
            ? r.result.reason
            : null
      }))
    };
  });
}
export type AdminAuditSnapshot = Awaited<ReturnType<typeof readAdminAudit>>;
