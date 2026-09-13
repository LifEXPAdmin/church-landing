import type { AdultContactRequest, Prisma, PrismaClient } from "@prisma/client";
import { accountConfig } from "./account-config";
import { activityBudget } from "./account-limits";
import {
  contactAudience,
  contactPair,
  contactPolicy,
  conversationPair,
  requireContactActor
} from "./adult-contact-policy";
import { communityReportIntakeAvailable } from "./community-reports";
import type { PostTx } from "./post-access";
import { withAccountRead } from "./account-read";
import { socialPolicy } from "./social-policy";
import { postField, postId } from "./post-input";
import { expected, isEligible, PortalError } from "./portal-policy";
import { socialCommand, socialInput } from "./social-operations";
import type { ContactRequest, ContactView } from "./adult-contact-types";
import { recordMessageActivity } from "./message-activity";

const PAGE = 30,
  DAY = 86400000;
const participantSelect = {
  id: true,
  name: true,
  username: true,
  emailVerifiedAt: true,
  adultAcknowledgedAt: true,
  adultPolicyVersion: true,
  suspendedAt: true,
  deactivatedAt: true
} satisfies Prisma.PlatformUserSelect;
const requestInclude = {
  sender: { select: participantSelect },
  recipient: { select: participantSelect },
  conversation: { select: { id: true, version: true, sendingAllowed: true } }
} satisfies Prisma.AdultContactRequestInclude;
const statusAt = (row: AdultContactRequest, now = new Date()) =>
  row.status === "PENDING" && row.expiresAt <= now ? "EXPIRED" : row.status;
const pending = (now: Date) => ({
  status: "PENDING" as const,
  expiresAt: { gt: now }
});
const ownRequests = (ownerId: string) => ({
  OR: [{ senderId: ownerId }, { recipientId: ownerId }]
});
function receipt(row: AdultContactRequest, message: string) {
  return { id: row.id, version: row.version, message };
}
async function requireAvailable(tx: PostTx) {
  if (!(await communityReportIntakeAvailable(tx, null)))
    throw new PortalError(
      503,
      "New contact is unavailable while reporting operations are unavailable. Your entries are kept."
    );
}
async function preferences(tx: PostTx, ownerId: string) {
  const row = await tx.socialPreferences.findUnique({
    where: { ownerId },
    select: { version: true, contactRequests: true }
  });
  return {
    version: row?.version ?? 0,
    audience: contactAudience(row?.contactRequests)
  };
}

export function adultContactCommand(
  db: PrismaClient,
  token: unknown,
  input: Record<string, unknown>
) {
  socialInput(input, [
    "operation",
    "mutationId",
    "recipientId",
    "expectedRecipientVersion",
    "purpose",
    "id",
    "expectedVersion",
    "audience"
  ]);
  return socialCommand(
    db,
    token,
    "adult-contact",
    input,
    async (tx, ownerId) => {
      const now = new Date();
      if (input.operation === "preferences") {
        const current = await preferences(tx, ownerId);
        expected(input.expectedVersion, current.version);
        if (
          !["NOBODY", "FOLLOWED", "EVERYONE"].includes(String(input.audience))
        )
          throw new PortalError(400, "Choose a supported contact audience.");
        const audience = contactAudience(input.audience);
        if (audience !== "NOBODY") await requireAvailable(tx);
        const saved = await tx.socialPreferences.upsert({
          where: { ownerId },
          create: { ownerId, contactRequests: audience },
          update: { contactRequests: audience, version: { increment: 1 } }
        });
        if (audience !== "EVERYONE") {
          const noLongerAllowed: Prisma.AdultContactRequestWhereInput =
            audience === "NOBODY"
              ? {}
              : {
                  sender: { followers: { none: { followerId: ownerId } } }
                };
          await tx.adultContactRequest.updateMany({
            where: {
              recipientId: ownerId,
              status: "PENDING",
              ...noLongerAllowed
            },
            data: { status: "REVOKED", version: { increment: 1 } }
          });
        }
        return {
          id: ownerId,
          version: saved.version,
          message: "Contact request choices saved."
        };
      }
      if (input.operation === "create") {
        const recipientId = postId(input.recipientId);
        const purpose = postField(input.purpose, 1000);
        if (!purpose)
          throw new PortalError(400, "Add a short purpose for this request.");
        await requireAvailable(tx);
        const policy = await contactPolicy(tx, ownerId, recipientId);
        if (!policy?.allowed)
          throw new PortalError(
            404,
            "Contact is unavailable for this account."
          );
        expected(input.expectedRecipientVersion, policy.version);
        const pair = contactPair(ownerId, recipientId);
        const conversation = await tx.adultConversation.findUnique({
          where: {
            participantAId_participantBId: conversationPair(
              ownerId,
              recipientId
            )
          }
        });
        if (conversation?.sendingAllowed)
          throw new PortalError(
            409,
            "You already have an accepted conversation. Refresh Messages to continue it."
          );
        await tx.adultContactRequest.updateMany({
          where: { ...pair, status: "PENDING", expiresAt: { lte: now } },
          data: { status: "EXPIRED", version: { increment: 1 } }
        });
        const active = await tx.adultContactRequest.findFirst({
          where: { ...pair, status: "PENDING" }
        });
        if (active) {
          if (active.senderId === ownerId && active.purpose === purpose)
            return receipt(
              active,
              "This request is already waiting for a decision."
            );
          throw new PortalError(
            409,
            "A request already exists between you. Refresh Requests to review its current state."
          );
        }
        const declined = await tx.adultContactRequest.findFirst({
          where: {
            senderId: ownerId,
            recipientId,
            status: "DECLINED",
            updatedAt: { gt: new Date(now.getTime() - 7 * DAY) }
          },
          orderBy: { updatedAt: "desc" },
          select: { updatedAt: true }
        });
        if (declined)
          throw new PortalError(
            429,
            "Please wait before requesting this contact again.",
            Math.max(
              1,
              Math.ceil(
                (declined.updatedAt.getTime() + 7 * DAY - now.getTime()) / 1000
              )
            )
          );
        const outgoing = await tx.adultContactRequest.count({
          where: { senderId: ownerId, ...pending(now) }
        });
        const incoming = await tx.adultContactRequest.count({
          where: { recipientId, ...pending(now) }
        });
        if (outgoing >= 20 || incoming >= 100)
          throw new PortalError(
            429,
            "Another request cannot be accepted right now. Keep your unsent entries."
          );
        const secret = accountConfig().rateSecret;
        for (const [kind, count, seconds] of [
          ["short", 5, 600],
          ["daily", 20, 86400]
        ] as const) {
          const retryAfter = await activityBudget(
            tx,
            secret,
            ownerId,
            `contact-${kind}`,
            count,
            seconds
          );
          if (retryAfter)
            throw new PortalError(
              429,
              "Please wait before sending another contact request.",
              retryAfter
            );
        }
        const saved = await tx.adultContactRequest.create({
          data: {
            senderId: ownerId,
            recipientId,
            purpose,
            expiresAt: new Date(now.getTime() + 14 * DAY)
          }
        });
        await recordMessageActivity(tx, {
          key: `adult-request:${saved.id}`,
          kind: "ADULT_REQUEST_CREATED",
          actorId: ownerId,
          recipientId,
          requestId: saved.id,
          createdAt: saved.createdAt
        });
        return receipt(
          saved,
          "Request sent. A conversation opens only if the recipient accepts."
        );
      }
      if (!["accept", "decline", "withdraw"].includes(String(input.operation)))
        throw new PortalError(400, "Choose a supported contact action.");
      const row = await tx.adultContactRequest.findFirst({
        where: { id: postId(input.id), ...ownRequests(ownerId) }
      });
      if (!row) throw new PortalError(404, "This request is unavailable.");
      const senderAction = input.operation === "withdraw";
      if ((senderAction ? row.senderId : row.recipientId) !== ownerId)
        throw new PortalError(404, "This request is unavailable.");
      expected(input.expectedVersion, row.version);
      if (statusAt(row, now) !== "PENDING")
        throw new PortalError(
          409,
          "This request is no longer awaiting a decision. Refresh its status."
        );
      let conversationId: string | undefined;
      if (input.operation === "accept") {
        await requireAvailable(tx);
        if (!(await contactPolicy(tx, row.senderId, row.recipientId))?.allowed)
          throw new PortalError(
            404,
            "Contact is unavailable for this account."
          );
        const pair = conversationPair(row.senderId, row.recipientId);
        const conversation = await tx.adultConversation.upsert({
          where: { participantAId_participantBId: pair },
          create: { ...pair, sendingAllowed: true },
          update: { sendingAllowed: true, version: { increment: 1 } }
        });
        conversationId = conversation.id;
      }
      const status =
        input.operation === "accept"
          ? "ACCEPTED"
          : senderAction
            ? "WITHDRAWN"
            : "DECLINED";
      const saved = await tx.adultContactRequest.update({
        where: { id: row.id },
        data: { status, conversationId, version: { increment: 1 } }
      });
      if (conversationId)
        await recordMessageActivity(tx, {
          key: `adult-request-accepted:${saved.id}`,
          kind: "ADULT_REQUEST_ACCEPTED",
          actorId: ownerId,
          recipientId: row.senderId,
          requestId: saved.id,
          conversationId,
          createdAt: saved.updatedAt
        });
      return receipt(
        saved,
        status === "ACCEPTED"
          ? "Request accepted. Refresh the conversation's current access."
          : status === "DECLINED"
            ? "Request declined."
            : "Request withdrawn."
      );
    },
    requireContactActor
  );
}

export function readAdultContact(
  db: PrismaClient,
  token: unknown,
  query: Record<string, unknown>
): Promise<ContactView> {
  socialInput(query, ["view", "recipientId", "id", "after"]);
  return withAccountRead(db, token, async (tx, ownerId) => {
    if (!ownerId)
      throw new PortalError(401, "Sign in to use private contact requests.");
    await requireContactActor(tx, ownerId);
    const available = await communityReportIntakeAvailable(tx, null);
    if (query.view === "preferences")
      return {
        ownerId,
        available,
        preferences: await preferences(tx, ownerId)
      };
    if (query.view === "target") {
      const recipientId = postId(query.recipientId);
      const policy = await contactPolicy(tx, ownerId, recipientId);
      if (!policy)
        throw new PortalError(404, "Contact is unavailable for this account.");
      const request = await tx.adultContactRequest.findFirst({
        where: { ...contactPair(ownerId, recipientId), ...pending(new Date()) },
        select: { id: true, senderId: true }
      });
      const conversation = await tx.adultConversation.findUnique({
        where: {
          participantAId_participantBId: conversationPair(ownerId, recipientId)
        },
        select: { id: true, version: true, sendingAllowed: true }
      });
      return {
        ownerId,
        available: available && policy.allowed,
        target: policy.recipient,
        expectedRecipientVersion: policy.version,
        activeRequest: request,
        conversation
      };
    }
    const view = query.view ?? "received";
    if (!["received", "sent", "receipt"].includes(String(view)))
      throw new PortalError(400, "Choose a supported contact view.");
    const where =
      view === "receipt"
        ? { ...ownRequests(ownerId), id: postId(query.id) }
        : view === "sent"
          ? { senderId: ownerId }
          : { recipientId: ownerId };
    const after = query.after ? postId(query.after) : null;
    if (
      after &&
      (view === "receipt" ||
        !(await tx.adultContactRequest.findFirst({
          where: { ...where, id: after },
          select: { id: true }
        })))
    )
      throw new PortalError(
        409,
        "This request page changed. Open Requests again."
      );
    const rows = await tx.adultContactRequest.findMany({
      where,
      include: requestInclude,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: view === "receipt" ? 1 : PAGE + 1,
      ...(after ? { cursor: { id: after }, skip: 1 } : {})
    });
    if (view === "receipt" && !rows.length)
      throw new PortalError(404, "This request is unavailable.");
    const page = rows.slice(0, PAGE),
      now = new Date();
    const context = await socialPolicy(tx, ownerId);
    const choice = (await preferences(tx, ownerId)).audience;
    const followed =
      choice === "FOLLOWED"
        ? new Set(
            (
              await tx.platformFollow.findMany({
                where: {
                  followerId: ownerId,
                  followingId: { in: page.map((r) => r.senderId) }
                },
                select: { followingId: true }
              })
            ).map((r) => r.followingId)
          )
        : new Set<string>();
    const project = (row: (typeof rows)[number]): ContactRequest => {
      const other = row.senderId === ownerId ? row.recipient : row.sender;
      const reachable =
        isEligible(other) && !context.blockedIds?.includes(other.id);
      const status = statusAt(row, now);
      const allowed =
        reachable &&
        (choice === "EVERYONE" ||
          (choice === "FOLLOWED" && followed.has(row.senderId)));
      return {
        id: row.id,
        version: row.version,
        direction: row.senderId === ownerId ? "sent" : "received",
        purpose: row.purpose,
        status,
        createdAt: row.createdAt.toISOString(),
        expiresAt: row.expiresAt.toISOString(),
        person: reachable
          ? { id: other.id, name: other.name, username: other.username }
          : null,
        canAccept:
          available &&
          row.recipientId === ownerId &&
          status === "PENDING" &&
          allowed,
        canDecline: row.recipientId === ownerId && status === "PENDING",
        canWithdraw: row.senderId === ownerId && status === "PENDING",
        conversation: row.conversation
          ? {
              ...row.conversation,
              sendingAllowed:
                available && reachable && row.conversation.sendingAllowed
            }
          : null
      };
    };
    return {
      ownerId,
      available,
      ...(view === "receipt"
        ? { request: project(rows[0]) }
        : {
            requests: page.map(project),
            after: rows.length > PAGE ? (page.at(-1)?.id ?? null) : null
          })
    };
  });
}
