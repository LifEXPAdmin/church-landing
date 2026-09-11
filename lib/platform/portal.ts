import {
  effectiveChurchGrants,
  hasChurchReviewer,
  endRoleContributions
} from "./church-permissions";
import {
  Prisma,
  type PrismaClient,
  type ChurchConnection,
  type ChurchDirectoryPreference,
  ChurchCapability,
  ChurchContactSlot
} from "@prisma/client";
import { verifiedChurchManagement } from "./church-management";
import { readAccountSession, normalizeEmail } from "./accounts";
import { reconcileSupportAccess } from "./support-revocation";
import { churchSearchQuery } from "./church-search";
import {
  ADULT_POLICY,
  type PortalSnapshot,
  type PortalView,
  type DirectoryEntry,
  type ConnectionSummary
} from "./portal-types";
export { ADULT_POLICY } from "./portal-types";
export class PortalError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
type Tx = Prisma.TransactionClient;
export const eligibleWhere = {
  suspendedAt: null,
  deactivatedAt: null,
  emailVerifiedAt: { not: null },
  adultAcknowledgedAt: { not: null },
  adultPolicyVersion: ADULT_POLICY
};
export const churchSelect = {
  id: true,
  slug: true,
  name: true,
  summary: true,
  version: true,
  communityListed: true,
  city: true,
  region: true,
  country: true,
  serviceArea: true,
  locationModel: true,
  website: true,
  publicEmail: true,
  publicPhone: true,
  meetingInfo: true,
  denomination: true,
  source: true
} as const;
const actorSelect = {
  id: true,
  name: true,
  username: true,
  suspendedAt: true,
  deactivatedAt: true,
  emailVerifiedAt: true,
  adultAcknowledgedAt: true,
  adultPolicyVersion: true,
  portalVersion: true
} as const;
export type Actor = Prisma.PlatformUserGetPayload<{
  select: typeof actorSelect;
}>;
export const isEligible = (
  user: Pick<
    Actor,
    | "suspendedAt"
    | "deactivatedAt"
    | "emailVerifiedAt"
    | "adultAcknowledgedAt"
    | "adultPolicyVersion"
  >
) =>
  !user.suspendedAt &&
  !user.deactivatedAt &&
  !!user.emailVerifiedAt &&
  !!user.adultAcknowledgedAt &&
  user.adultPolicyVersion === ADULT_POLICY;
export function eligibility(user: Actor) {
  if (!isEligible(user))
    throw new PortalError(
      403,
      "Verify your email and confirm adult eligibility before joining this private journey."
    );
}
export function expected(value: unknown, actual: number) {
  if (!Number.isSafeInteger(value) || value !== actual)
    throw new PortalError(
      409,
      "This information changed. Refresh the page and try again."
    );
}
function text(value: unknown, maximum = 100, minimum = 1): string {
  if (
    typeof value !== "string" ||
    value.trim().length < minimum ||
    value.length > maximum
  )
    throw new PortalError(400, "Check the required fields and their length.");
  return value.trim();
}
function id(value: unknown) {
  return text(value, 100);
}
function contactEmail(value: unknown) {
  if (value === "" || value == null) return null;
  const result = normalizeEmail(value);
  if (!result)
    throw new PortalError(
      400,
      "Enter a valid contact email, or leave it blank."
    );
  return result;
}
function phone(value: unknown) {
  if (value === "" || value == null) return null;
  const result = text(value, 32);
  if (!/^[+0-9(). -]{7,32}$/.test(result))
    throw new PortalError(400, "Check the contact phone, or leave it blank.");
  return result;
}
async function audit(
  tx: Tx,
  actorId: string,
  targetId: string,
  action: string,
  churchId?: string,
  fromState?: string,
  toState?: string,
  version?: number
) {
  await tx.churchAuditEvent.create({
    data: { actorId, targetId, action, churchId, fromState, toState, version }
  });
}
export async function operator(
  tx: Tx,
  actor: Actor,
  capability:
    | "ESTABLISH_CHURCH"
    | "REVIEW_CHURCH_LISTINGS"
    | "REVIEW_CHURCH_CLAIMS"
    | "MANAGE_CHURCH_ACCESS"
    | "MANAGE_ACCOUNTS"
    | "ASSIGN_RELATIONSHIP_OWNER"
) {
  eligibility(actor);
  if (
    !(await tx.platformOperatorGrant.findFirst({
      where: { userId: actor.id, capability, revokedAt: null },
      select: { id: true }
    }))
  )
    throw new PortalError(
      403,
      "This action requires an explicitly assigned Godschurches capability."
    );
}
export async function hasChurchCapability(
  tx: Tx,
  actor: Actor,
  churchId: string,
  capability: ChurchCapability
) {
  if (!isEligible(actor)) return false;
  return (
    (await effectiveChurchGrants(tx, actor.id, [churchId], [capability]))
      .length > 0
  );
}
export async function churchCapability(
  tx: Tx,
  actor: Actor,
  churchId: string,
  capability: ChurchCapability
) {
  if (!(await hasChurchCapability(tx, actor, churchId, capability)))
    throw new PortalError(
      403,
      "You do not have this permission for this church."
    );
}
export async function membership(tx: Tx, actor: Actor, churchId: string) {
  eligibility(actor);
  const connection = await tx.churchConnection.findUnique({
    where: { userId_churchId: { userId: actor.id, churchId } }
  });
  if (!connection || connection.state !== "APPROVED")
    throw new PortalError(
      403,
      "An approved connection to this church is required. Following or a contact title does not grant access."
    );
  return connection;
}
async function lockUser(tx: Tx, userId: string) {
  await tx.$queryRaw`SELECT "id" FROM "PlatformUser" WHERE "id" = ${userId} FOR UPDATE`;
}
// A single transaction-scoped portal gate makes eligibility, consent and revocation reads
// coherent with writes in this small pilot. DB constraints also enforce active affiliation.
export async function portal<T>(
  db: PrismaClient,
  token: unknown,
  work: (tx: Tx, actor: Actor) => Promise<T>
): Promise<T> {
  return db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(730221, 2)`;
      const session = await readAccountSession(tx as PrismaClient, token);
      if (!session) throw new PortalError(401, "Sign in to continue.");
      await lockUser(tx, session.id);
      const current = await readAccountSession(tx as PrismaClient, token);
      if (!current) throw new PortalError(401, "Sign in again to continue.");
      const actor = await tx.platformUser.findUniqueOrThrow({
        where: { id: session.id },
        select: actorSelect
      });
      if (actor.suspendedAt || actor.deactivatedAt)
        throw new PortalError(
          403,
          "This account cannot access the private church journey. Contact Godschurches for help."
        );
      const result = await work(tx, actor);
      await reconcileSupportAccess(tx);
      return result;
    },
    { maxWait: 10000, timeout: 15000 }
  );
}
async function resetConnectionAccess(tx: Tx, connection: ChurchConnection) {
  await tx.calendarShare.updateMany({
    where: { connectionId: connection.id, revokedAt: null },
    data: { revokedAt: new Date(), version: { increment: 1 } }
  });
  await tx.calendarEventShare.updateMany({
    where: { connectionId: connection.id, revokedAt: null },
    data: { revokedAt: new Date(), version: { increment: 1 } }
  });
  await tx.calendarResponse.updateMany({
    where: {
      userId: connection.userId,
      state: { in: ["GOING", "MAYBE"] },
      occurrence: {
        event: {
          OR: [
            { calendar: { churchId: connection.churchId } },
            {
              calendar: { shares: { some: { churchId: connection.churchId } } }
            },
            { shares: { some: { churchId: connection.churchId } } }
          ]
        }
      }
    },
    data: { state: "DECLINED", version: { increment: 1 } }
  });
  await endRoleContributions(tx, { connectionId: connection.id });
  const appointments = await tx.churchPositionAssignment.updateMany({
    where: { connectionId: connection.id, revokedAt: null },
    data: { revokedAt: new Date(), version: { increment: 1 } }
  });
  if (appointments.count)
    await tx.church.update({
      where: { id: connection.churchId },
      data: { structureVersion: { increment: 1 } }
    });
  await tx.churchDirectoryPreference.deleteMany({
    where: { connectionId: connection.id }
  });
  await tx.churchCapabilityGrant.updateMany({
    where: {
      userId: connection.userId,
      churchId: connection.churchId,
      revokedAt: null
    },
    data: { revokedAt: new Date(), version: { increment: 1 } }
  });
  await tx.churchContactAssignment.updateMany({
    where: { connectionId: connection.id, revokedAt: null },
    data: { revokedAt: new Date(), version: { increment: 1 } }
  });
}
export async function portalCommand(
  db: PrismaClient,
  token: unknown,
  input: Record<string, unknown>
): Promise<string> {
  return portal(db, token, async (tx, actor) => {
    const op = input.operation;
    if (op === "ack-adult") {
      expected(input.expectedVersion, actor.portalVersion);
      if (input.acknowledged !== true || input.policy !== ADULT_POLICY)
        throw new PortalError(
          400,
          "Confirm that you are 18 or older to use this adult preview."
        );
      await tx.platformUser.update({
        where: { id: actor.id },
        data: {
          adultAcknowledgedAt: new Date(),
          adultPolicyVersion: ADULT_POLICY,
          portalVersion: { increment: 1 }
        }
      });
      await audit(tx, actor.id, actor.id, "ADULT_ACKNOWLEDGED");
      return "Adult eligibility recorded for this preview. Email verification is also required.";
    }
    eligibility(actor);
    if (op === "request") {
      const churchId = id(input.churchId);
      if (
        !(await tx.church.findUnique({
          where: { id: churchId },
          select: { id: true }
        }))
      )
        throw new PortalError(404, "Church not found.");
      const prior = await tx.churchConnection.findUnique({
        where: { userId_churchId: { userId: actor.id, churchId } }
      });
      expected(input.expectedVersion, prior?.version ?? 0);
      if (
        await tx.churchConnection.findFirst({
          where: { userId: actor.id, state: { in: ["PENDING", "APPROVED"] } },
          select: { id: true }
        })
      )
        throw new PortalError(
          409,
          "You already have a pending request or Home Church. Withdraw or leave first; we will not transfer you automatically."
        );
      if (
        (await tx.churchAuditEvent.count({
          where: {
            actorId: actor.id,
            action: "REQUEST",
            createdAt: { gte: new Date(Date.now() - 86400000) }
          }
        })) >= 5
      )
        throw new PortalError(
          429,
          "You have reached today's request limit. Please try tomorrow."
        );
      if (!(await hasChurchReviewer(tx, churchId, actor.id)))
        throw new PortalError(
          503,
          "Church connection setup is not ready. An eligible, assigned reviewer other than you is needed. No request was created. Contact Godschurches for help."
        );
      const connection = prior
        ? await tx.churchConnection.update({
            where: { id: prior.id },
            data: { state: "PENDING", version: { increment: 1 } }
          })
        : await tx.churchConnection.create({
            data: { userId: actor.id, churchId, state: "PENDING" }
          });
      // A first request must not revoke an independently appointed reviewer.
      // Re-requests never restore consent or privileges from an ended connection.
      if (prior) await resetConnectionAccess(tx, connection);
      await audit(
        tx,
        actor.id,
        connection.id,
        "REQUEST",
        churchId,
        prior?.state,
        "PENDING",
        connection.version
      );
      return "Request received. A church reviewer will decide it. Directory access is not available while pending.";
    }
    if (op === "transition" || op === "share") {
      const connection = await tx.churchConnection.findUnique({
        where: { id: id(input.connectionId) }
      });
      if (!connection) throw new PortalError(404, "Connection not found.");
      if (op === "share") {
        if (connection.userId !== actor.id)
          throw new PortalError(403, "You can change only your own sharing.");
        await membership(tx, actor, connection.churchId);
        expected(input.expectedVersion, connection.version);
        if (
          typeof input.listed !== "boolean" ||
          typeof input.emailAudience !== "string" ||
          typeof input.phoneAudience !== "string" ||
          !["ONLY_ME", "SAME_CHURCH"].includes(input.emailAudience) ||
          !["ONLY_ME", "SAME_CHURCH"].includes(input.phoneAudience)
        )
          throw new PortalError(400, "Choose who may see each contact field.");
        const data = {
          listed: input.listed,
          displayName: text(input.displayName, 100),
          contactEmail: contactEmail(input.contactEmail),
          phone: phone(input.phone),
          emailAudience: input.emailAudience as "ONLY_ME" | "SAME_CHURCH",
          phoneAudience: input.phoneAudience as "ONLY_ME" | "SAME_CHURCH"
        };
        // Turning off listing also clears sharing choices; stored private drafts remain owner-only.
        if (!data.listed) {
          data.emailAudience = "ONLY_ME";
          data.phoneAudience = "ONLY_ME";
        }
        await tx.churchDirectoryPreference.upsert({
          where: { connectionId: connection.id },
          create: { connectionId: connection.id, ...data },
          update: data
        });
        await tx.churchConnection.update({
          where: { id: connection.id },
          data: { version: { increment: 1 } }
        });
        await audit(
          tx,
          actor.id,
          connection.id,
          "SHARING_CHANGED",
          connection.churchId,
          undefined,
          undefined,
          connection.version + 1
        );
        return "Sharing updated. Future views use your new choices. Information someone already saw cannot be recalled.";
      }
      if (connection.churchId !== id(input.churchId))
        throw new PortalError(
          403,
          "This connection does not belong to that church."
        );
      const action = input.action;
      if (
        typeof action !== "string" ||
        !["APPROVE", "DECLINE", "WITHDRAW", "LEAVE", "REMOVE"].includes(action)
      )
        throw new PortalError(400, "Choose a supported connection action.");
      if (["WITHDRAW", "LEAVE"].includes(action)) {
        if (connection.userId !== actor.id)
          throw new PortalError(
            403,
            "You can change only your own connection."
          );
      } else {
        await churchCapability(
          tx,
          actor,
          connection.churchId,
          "REVIEW_CONNECTIONS"
        );
        if (connection.userId === actor.id)
          throw new PortalError(403, "You cannot review your own connection.");
      }
      await lockUser(tx, connection.userId);
      const target = await tx.platformUser.findUniqueOrThrow({
        where: { id: connection.userId },
        select: actorSelect
      });
      if (action === "APPROVE") eligibility(target);
      expected(input.expectedVersion, connection.version);
      const map: Record<
        string,
        {
          from: string;
          to: "APPROVED" | "DECLINED" | "WITHDRAWN" | "LEFT" | "REMOVED";
        }
      > = {
        APPROVE: { from: "PENDING", to: "APPROVED" },
        DECLINE: { from: "PENDING", to: "DECLINED" },
        WITHDRAW: { from: "PENDING", to: "WITHDRAWN" },
        LEAVE: { from: "APPROVED", to: "LEFT" },
        REMOVE: { from: "APPROVED", to: "REMOVED" }
      };
      const transition = map[action];
      if (!transition || connection.state !== transition.from)
        throw new PortalError(
          409,
          "That action is not available in the current connection state. Refresh and try again."
        );
      await tx.churchConnection.update({
        where: { id: connection.id },
        data: { state: transition.to, version: { increment: 1 } }
      });
      if (transition.to !== "APPROVED")
        await resetConnectionAccess(tx, connection);
      await audit(
        tx,
        actor.id,
        connection.id,
        action,
        connection.churchId,
        connection.state,
        transition.to,
        connection.version + 1
      );
      return transition.to === "APPROVED"
        ? "Church connection approved. This is not certification of formal membership or pastoral office."
        : "Connection updated. The account and public posts are unchanged; related private access and sharing end.";
    }
    if (op === "establish") {
      await operator(tx, actor, "ESTABLISH_CHURCH");
      expected(input.expectedVersion, 0);
      const slug = text(input.slug, 60);
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))
        throw new PortalError(
          400,
          "Use lowercase words separated by hyphens for the church link."
        );
      const church = await tx.church.create({
        data: {
          slug,
          name: text(input.name, 100),
          summary: text(input.summary, 500)
        }
      });
      await audit(tx, actor.id, church.id, "ESTABLISH", church.id);
      return "Church established through an explicit operator assignment.";
    }
    if (op === "suspend") {
      await operator(tx, actor, "MANAGE_ACCOUNTS");
      const userId = id(input.userId);
      if (userId === actor.id)
        throw new PortalError(
          403,
          "Self-suspension is not available through this operator control."
        );
      await lockUser(tx, userId);
      const target = await tx.platformUser.findUnique({
        where: { id: userId },
        select: actorSelect
      });
      if (!target) throw new PortalError(404, "Account not found.");
      expected(input.expectedVersion, target.portalVersion);
      if (typeof input.suspended !== "boolean")
        throw new PortalError(400, "Choose an account status.");
      await tx.platformUser.update({
        where: { id: userId },
        data: {
          suspendedAt: input.suspended ? new Date() : null,
          portalVersion: { increment: 1 },
          credentialVersion: { increment: 1 }
        }
      });
      await tx.platformSession.deleteMany({ where: { userId } });
      await tx.platformEmailChange.deleteMany({ where: { userId } });
      await tx.platformAccountGrant.updateMany({
        where: { userId, consumedAt: null },
        data: { consumedAt: new Date() }
      });
      if (input.suspended) {
        await tx.supportCapabilityGrant.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: new Date(), version: { increment: 1 } }
        });
        const connections = await tx.churchConnection.findMany({
          where: { userId }
        });
        for (const connection of connections) {
          await resetConnectionAccess(tx, connection);
          await tx.churchConnection.update({
            where: { id: connection.id },
            data: { version: { increment: 1 } }
          });
        }
        await tx.churchCapabilityGrant.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: new Date(), version: { increment: 1 } }
        });
        await tx.platformOperatorGrant.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: new Date() }
        });
        await tx.churchContactAssignment.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: new Date(), version: { increment: 1 } }
        });
      }
      await audit(
        tx,
        actor.id,
        userId,
        input.suspended ? "SUSPEND" : "RESTORE_ACCOUNT"
      );
      return "Account status updated. Existing sessions ended. Old sharing, privileges and contact appointments will not reactivate.";
    }
    const churchId = id(input.churchId);
    if (
      !(await tx.church.findUnique({
        where: { id: churchId },
        select: { id: true }
      }))
    )
      throw new PortalError(404, "Church not found.");
    if (op === "grant" || op === "revoke-grant") {
      await operator(tx, actor, "MANAGE_CHURCH_ACCESS");
      if (op === "revoke-grant") {
        const grant = await tx.churchCapabilityGrant.findFirst({
          where: { id: id(input.id), churchId }
        });
        if (!grant) throw new PortalError(404, "Assignment not found.");
        expected(input.expectedVersion, grant.version);
        await tx.churchCapabilityGrant.update({
          where: { id: grant.id },
          data: { revokedAt: new Date(), version: { increment: 1 } }
        });
        await audit(tx, actor.id, grant.id, "REVOKE_CAPABILITY", churchId);
        return "This independent grant is revoked for existing sessions. Permissions supplied by a separately reviewed role may remain.";
      }
      const userId = id(input.userId);
      const target = await tx.platformUser.findUnique({
        where: { id: userId },
        select: actorSelect
      });
      if (!target) throw new PortalError(404, "Account not found.");
      eligibility(target);
      if (
        !Object.values(ChurchCapability).includes(
          input.capability as ChurchCapability
        )
      )
        throw new PortalError(400, "Choose a supported scoped capability.");
      const capability = input.capability as ChurchCapability;
      const prior = await tx.churchCapabilityGrant.findUnique({
        where: { userId_churchId_capability: { userId, churchId, capability } }
      });
      expected(input.expectedVersion, prior?.version ?? 0);
      const dependency = await tx.churchConnection.findFirst({
        where: { userId, churchId, state: "APPROVED" },
        select: { id: true }
      });
      const data = {
        userId,
        churchId,
        capability,
        sourceClaimId: null,
        dependencyConnectionId: dependency?.id ?? null,
        revokedAt: null
      };
      const grant = prior
        ? await tx.churchCapabilityGrant.update({
            where: { id: prior.id },
            data: { ...data, version: { increment: 1 } }
          })
        : await tx.churchCapabilityGrant.create({ data });
      await audit(tx, actor.id, grant.id, "GRANT_CAPABILITY", churchId);
      return "Scoped capability explicitly assigned. Contact titles and account categories do not grant it.";
    }
    if (op === "assign-contact" || op === "revoke-contact") {
      if (
        op === "assign-contact" &&
        !Object.values(ChurchContactSlot).includes(
          input.slot as ChurchContactSlot
        )
      )
        throw new PortalError(400, "Choose a supported contact assignment.");
      const prior =
        op === "revoke-contact"
          ? await tx.churchContactAssignment.findFirst({
              where: { id: id(input.id), churchId }
            })
          : await tx.churchContactAssignment.findFirst({
              where: { churchId, slot: input.slot as ChurchContactSlot }
            });
      const slot = op === "revoke-contact" ? prior?.slot : input.slot;
      if (!Object.values(ChurchContactSlot).includes(slot as ChurchContactSlot))
        throw new PortalError(400, "Choose a supported contact assignment.");
      if (slot === "RELATIONSHIP_OWNER")
        await operator(tx, actor, "ASSIGN_RELATIONSHIP_OWNER");
      else await churchCapability(tx, actor, churchId, "APPOINT_COORDINATORS");
      expected(input.expectedVersion, prior?.version ?? 0);
      if (op === "revoke-contact") {
        if (!prior) throw new PortalError(404, "Contact assignment not found.");
        await tx.churchContactAssignment.update({
          where: { id: prior.id },
          data: { revokedAt: new Date(), version: { increment: 1 } }
        });
        await audit(tx, actor.id, prior.id, "REVOKE_CONTACT", churchId);
        return "Contact assignment ended. No approval permission is implied by this title.";
      }
      if (input.audience !== "SAME_CHURCH")
        throw new PortalError(
          400,
          "Confirm these contact methods are approved for this church's eligible members."
        );
      const target = await tx.platformUser.findUnique({
        where: { id: id(input.userId) },
        select: actorSelect
      });
      if (!target) throw new PortalError(404, "Account not found.");
      eligibility(target);
      const connection =
        slot !== "RELATIONSHIP_OWNER"
          ? await membership(tx, target, churchId)
          : null;
      const data = {
        churchId,
        userId: target.id,
        slot: slot as ChurchContactSlot,
        connectionId: connection?.id ?? null,
        contactEmail: contactEmail(input.contactEmail),
        phone: phone(input.phone),
        revokedAt: null
      };
      const assignment = prior
        ? await tx.churchContactAssignment.update({
            where: { id: prior.id },
            data: { ...data, version: { increment: 1 } }
          })
        : await tx.churchContactAssignment.create({ data });
      await audit(tx, actor.id, assignment.id, "ASSIGN_CONTACT", churchId);
      return "Contact appointed for the approved audience. No software permissions were added.";
    }
    throw new PortalError(400, "Unknown church action.");
  });
}
function entry(p: ChurchDirectoryPreference | null): DirectoryEntry | null {
  return p?.listed
    ? {
        name: p.displayName,
        ...(p.emailAudience === "SAME_CHURCH" && p.contactEmail
          ? { email: p.contactEmail }
          : {}),
        ...(p.phoneAudience === "SAME_CHURCH" && p.phone
          ? { phone: p.phone }
          : {})
      }
    : null;
}
async function connectionsAvailable(
  db: PrismaClient | Tx,
  churchId: string,
  viewerId = ""
) {
  return hasChurchReviewer(db, churchId, viewerId);
}
export async function publicChurches(
  db: PrismaClient,
  churchId?: string,
  cursor?: string,
  query = ""
) {
  // Prisma's PostgreSQL contains filter uses LIKE; treat search punctuation literally.
  const search = churchSearchQuery(query).replace(/[\\%_]/g, "\\$&");
  const rows = await db.church.findMany({
    select: churchSelect,
    where: churchId
      ? { id: churchId }
      : search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { summary: { contains: search, mode: "insensitive" } },
              { city: { contains: search, mode: "insensitive" } },
              { region: { contains: search, mode: "insensitive" } },
              { country: { contains: search, mode: "insensitive" } },
              { serviceArea: { contains: search, mode: "insensitive" } },
              { website: { contains: search, mode: "insensitive" } }
            ]
          }
        : {},
    ...(!churchId && cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    orderBy: [{ name: "asc" }, { id: "asc" }],
    take: 101
  });
  const managed = await verifiedChurchManagement(
    db,
    rows.map((row) => row.id)
  );
  const projected = rows.map((row) => ({
    ...row,
    representativeVerified: managed.has(row.id)
  }));
  if (!churchId || !rows.length) return projected;
  return [
    {
      ...projected[0],
      connectionsAvailable: await connectionsAvailable(db, churchId)
    }
  ];
}
export async function getPortalSnapshot(
  db: PrismaClient,
  token: unknown,
  view: PortalView,
  churchId?: string,
  query = "",
  cursor?: string
): Promise<PortalSnapshot> {
  return portal(db, token, async (tx, actor) => {
    const found =
      view === "discover"
        ? await publicChurches(tx as PrismaClient, churchId, cursor, query)
        : await tx.church.findMany({
            select: churchSelect,
            orderBy: [{ name: "asc" }, { id: "asc" }],
            take: 100
          });
    const churches = found.slice(0, 100);
    const own = await tx.churchConnection.findMany({
      where: { userId: actor.id },
      include: { church: { select: churchSelect } },
      orderBy: { updatedAt: "desc" },
      take: 100
    });
    const connectionSummary = (
      c: ChurchConnection & {
        church?: { name: string };
        user?: { name: string };
      }
    ): ConnectionSummary => ({
      id: c.id,
      churchId: c.churchId,
      churchName:
        c.church?.name ??
        churches.find((ch) => ch.id === c.churchId)?.name ??
        "Church",
      name: c.user?.name ?? actor.name,
      state: c.state,
      version: c.version,
      isSelf: c.userId === actor.id
    });
    const grants = isEligible(actor)
      ? await effectiveChurchGrants(tx, actor.id)
      : [];
    const scoped = (churchId: string, capability: ChurchCapability) =>
      grants.some(
        (g) =>
          g.churchId === churchId &&
          g.capability === capability &&
          (!g.dependency ||
            (g.dependency.userId === actor.id &&
              g.dependency.churchId === churchId &&
              g.dependency.state === "APPROVED"))
      );
    // Search and pagination must not hide an independently assigned church tool.
    const assignedChurches = [
      ...new Map(grants.map((g) => [g.church.id, g.church])).values()
    ];
    const reviewerChurches = assignedChurches.filter((c) =>
      scoped(c.id, "REVIEW_CONNECTIONS")
    );
    const coordinatorChurches = assignedChurches.filter((c) =>
      scoped(c.id, "APPOINT_COORDINATORS")
    );
    const operatorCapabilities = isEligible(actor)
      ? (
          await tx.platformOperatorGrant.findMany({
            where: { userId: actor.id, revokedAt: null },
            select: { capability: true }
          })
        ).map((g) => g.capability)
      : [];
    const snapshot: PortalSnapshot = {
      viewer: {
        id: actor.id,
        name: actor.name,
        username: actor.username,
        verified: !!actor.emailVerifiedAt,
        adult:
          !!actor.adultAcknowledgedAt &&
          actor.adultPolicyVersion === ADULT_POLICY,
        version: actor.portalVersion
      },
      churches,
      connections: own.map(connectionSummary),
      reviewerChurches,
      coordinatorChurches,
      operatorCapabilities,
      ...(view === "discover" && !churchId
        ? {
            discovery: {
              query: churchSearchQuery(query),
              continued: !!cursor,
              moreCursor: found.length > 100 ? churches.at(-1)?.id : undefined
            }
          }
        : {})
    };
    const active = own.find((c) => c.state === "APPROVED");
    const church = churchId
      ? ((await tx.church.findUnique({
          where: { id: churchId },
          select: churchSelect
        })) ?? undefined)
      : active?.church;
    if (churchId && !church) throw new PortalError(404, "Church not found.");
    snapshot.church = church
      ? {
          ...church,
          representativeVerified: (
            await verifiedChurchManagement(tx, [church.id])
          ).has(church.id)
        }
      : undefined;
    if (church && view === "discover" && churchId)
      snapshot.church = {
        ...snapshot.church!,
        connectionsAvailable: await connectionsAvailable(
          tx,
          church.id,
          actor.id
        )
      };
    if (view === "directory" || view === "sharing") {
      if (!church)
        throw new PortalError(403, "Choose an approved Home Church first.");
      const connection = await membership(tx, actor, church.id);
      if (view === "sharing") {
        const pref = await tx.churchDirectoryPreference.findUnique({
          where: { connectionId: connection.id }
        });
        snapshot.sharing = {
          connectionId: connection.id,
          version: connection.version,
          listed: pref?.listed ?? false,
          displayName: pref?.displayName || actor.name,
          contactEmail: pref?.contactEmail ?? "",
          phone: pref?.phone ?? "",
          emailAudience: pref?.emailAudience ?? "ONLY_ME",
          phoneAudience: pref?.phoneAudience ?? "ONLY_ME",
          preview: entry(pref)
        };
      } else {
        snapshot.directoryCanAssignRoles = scoped(
          church.id,
          "MANAGE_STRUCTURE"
        );
        // Filter eligibility and consent in SQL. Project optional fields before returning any DTO.
        const entries = await tx.churchDirectoryPreference.findMany({
          where: {
            listed: true,
            connection: {
              churchId: church.id,
              state: "APPROVED",
              user: eligibleWhere
            }
          },
          select: {
            connectionId: true,
            displayName: true,
            contactEmail: true,
            phone: true,
            emailAudience: true,
            phoneAudience: true
          },
          orderBy: [{ displayName: "asc" }, { connectionId: "asc" }],
          take: 100
        });
        snapshot.directory = entries.map((p) => ({
          connectionId: p.connectionId,
          name: p.displayName,
          ...(p.emailAudience === "SAME_CHURCH" && p.contactEmail
            ? { email: p.contactEmail }
            : {}),
          ...(p.phoneAudience === "SAME_CHURCH" && p.phone
            ? { phone: p.phone }
            : {})
        }));
      }
    }
    if (view === "review") {
      if (!church) throw new PortalError(404, "Choose a church to review.");
      await churchCapability(tx, actor, church.id, "REVIEW_CONNECTIONS");
      const queue = await tx.churchConnection.findMany({
        where: { churchId: church.id, state: { in: ["PENDING", "APPROVED"] } },
        include: { user: { select: { name: true } } },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: 100
      });
      snapshot.queue = queue.map(connectionSummary);
    }
    if (view === "help" && churchId && church)
      await membership(tx, actor, church.id);
    if (
      view === "help" &&
      church &&
      isEligible(actor) &&
      active?.churchId === church.id
    ) {
      await membership(tx, actor, church.id);
      const contacts = await tx.churchContactAssignment.findMany({
        where: { churchId: church.id, revokedAt: null, user: eligibleWhere },
        include: { user: { select: { name: true } }, connection: true }
      });
      snapshot.contacts = contacts
        .filter(
          (c) =>
            c.slot === "RELATIONSHIP_OWNER" ||
            (c.connection?.state === "APPROVED" &&
              c.connection.userId === c.userId &&
              c.connection.churchId === church.id)
        )
        .map((c) => ({
          name: c.user.name,
          slot: c.slot,
          ...(c.contactEmail ? { email: c.contactEmail } : {}),
          ...(c.phone ? { phone: c.phone } : {})
        }));
    }
    if (view === "operator") {
      if (!operatorCapabilities.length && !coordinatorChurches.length)
        throw new PortalError(
          403,
          "No operator or contact-appointment capability is assigned to this account."
        );
      eligibility(actor);
      const manageAccounts = operatorCapabilities.includes("MANAGE_ACCOUNTS");
      const manageGrants = operatorCapabilities.includes(
        "MANAGE_CHURCH_ACCESS"
      );
      const assignOwner = operatorCapabilities.includes(
        "ASSIGN_RELATIONSHIP_OWNER"
      );
      const scope: Prisma.ChurchContactAssignmentWhereInput = {
        OR: [
          ...(assignOwner ? [{ slot: "RELATIONSHIP_OWNER" as const }] : []),
          {
            churchId: { in: coordinatorChurches.map((c) => c.id) },
            slot: { in: ["PRIMARY", "BACKUP"] }
          }
        ]
      };
      // An operator may select account identities for explicit assignments, never login contacts.
      const users =
        manageAccounts ||
        manageGrants ||
        assignOwner ||
        coordinatorChurches.length
          ? await tx.platformUser.findMany({
              where: manageAccounts
                ? {}
                : {
                    ...eligibleWhere,
                    ...(manageGrants || assignOwner
                      ? {}
                      : {
                          connections: {
                            some: {
                              churchId: {
                                in: coordinatorChurches.map((c) => c.id)
                              },
                              state: "APPROVED"
                            }
                          }
                        })
                  },
              select: actorSelect,
              orderBy: { username: "asc" },
              take: 100
            })
          : [];
      const grants = manageGrants
        ? await tx.churchCapabilityGrant.findMany({ take: 100 })
        : [];
      const assignments = await tx.churchContactAssignment.findMany({
        where: scope,
        take: 100
      });
      snapshot.operator = {
        users: users.map((u) => ({
          id: u.id,
          name: u.name,
          username: u.username,
          eligible: isEligible(u),
          ...(manageAccounts
            ? { suspended: !!u.suspendedAt, version: u.portalVersion }
            : {})
        })),
        grants: grants.map((g) => ({
          id: g.id,
          churchId: g.churchId,
          userId: g.userId,
          capability: g.capability,
          version: g.version,
          revoked: !!g.revokedAt
        })),
        assignments: assignments.map((a) => ({
          id: a.id,
          churchId: a.churchId,
          userId: a.userId,
          slot: a.slot,
          version: a.version,
          revoked: !!a.revokedAt
        }))
      };
    }
    return snapshot;
  });
}
