import { requirePrivilegedAuthentication } from "./privileged-auth-policy";
import {
  Prisma,
  type PrismaClient,
  type FounderAnnouncement
} from "@prisma/client";
import { withAccountRead } from "./account-read";
import { founderAuthorized, founderAvailable } from "./founder-welcome";
import {
  eligibleWhere,
  expected,
  isEligible,
  PortalError
} from "./portal-policy";
import { postField, postId } from "./post-input";
import { socialCommand, socialInput } from "./social-operations";
import { notificationWrite } from "./notification-outbox";
import { recordMessageActivity } from "./message-activity";
type Tx = Prisma.TransactionClient;
const MAX_RECIPIENTS = 100,
  PREVIEW_MS = 15 * 60000,
  DAY = 86400000;
async function requireFounder(tx: Tx, ownerId: string) {
  if (!(await founderAuthorized(tx, ownerId)))
    throw new PortalError(
      403,
      "Founder announcement controls are unavailable for this account."
    );
  await requirePrivilegedAuthentication(tx, ownerId);
}
function audienceWhere(
  founderId: string,
  ids?: string[]
): Prisma.FounderWelcomeWhereInput {
  return {
    founderId,
    revokedAt: null,
    ...(ids ? { recipientId: { in: ids } } : {}),
    recipient: {
      ...eligibleWhere,
      OR: [
        { socialPreferences: { is: null } },
        { socialPreferences: { is: { founderAnnouncements: true } } }
      ],
      socialRelations: { none: { targetUserId: founderId, blocked: true } },
      socialTargets: { none: { ownerId: founderId, blocked: true } }
    }
  };
}
function selectedRecipients(value: unknown) {
  if (!Array.isArray(value) || !value.length || value.length > MAX_RECIPIENTS)
    throw new PortalError(
      400,
      "Select between one and 100 members for this send."
    );
  const ids = value.map(postId);
  if (new Set(ids).size !== ids.length)
    throw new PortalError(400, "Select each member once.");
  return ids;
}
async function ownedAnnouncement(tx: Tx, founderId: string, id: unknown) {
  const row = await tx.founderAnnouncement.findFirst({
    where: { id: postId(id), founderId }
  });
  if (!row) throw new PortalError(404, "This announcement is unavailable.");
  return row;
}
export async function readFounderAnnouncements(
  db: PrismaClient,
  token: unknown,
  query: Record<string, unknown>
) {
  socialInput(query, ["view", "id", "after"]);
  return withAccountRead(db, token, async (tx, ownerId) => {
    if (!ownerId)
      throw new PortalError(401, "Sign in to use founder announcements.");
    await requireFounder(tx, ownerId);
    if (query.view === "audience") {
      const where = audienceWhere(ownerId),
        after = query.after ? postId(query.after) : null;
      if (
        after &&
        !(await tx.founderWelcome.findFirst({
          where: { ...where, id: after },
          select: { id: true }
        }))
      )
        throw new PortalError(
          409,
          "The eligible member list changed. Refresh it before selecting members."
        );
      const rows = await tx.founderWelcome.findMany({
        where,
        select: {
          id: true,
          recipientId: true,
          recipient: { select: { name: true, username: true } }
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 51,
        ...(after ? { cursor: { id: after }, skip: 1 } : {})
      });
      return {
        ownerId,
        audience: rows
          .slice(0, 50)
          .map((row) => ({ id: row.recipientId, ...row.recipient })),
        after: rows.length > 50 ? rows[49].id : null
      };
    }
    if (query.id) {
      const announcement = await ownedAnnouncement(tx, ownerId, query.id);
      const recipients = await tx.founderAnnouncementRecipient.findMany({
        where: { announcementId: announcement.id },
        select: {
          recipientId: true,
          status: true,
          messageId: true,
          message: { select: { conversationId: true } },
          recipient: {
            select: {
              name: true,
              username: true,
              deletionRequestedAt: true,
              suspendedAt: true,
              deactivatedAt: true,
              emailVerifiedAt: true,
              adultAcknowledgedAt: true,
              adultPolicyVersion: true,
              socialRelations: {
                where: { targetUserId: ownerId, blocked: true },
                select: { id: true },
                take: 1
              },
              socialTargets: {
                where: { ownerId, blocked: true },
                select: { id: true },
                take: 1
              }
            }
          }
        },
        orderBy: { recipientId: "asc" },
        take: MAX_RECIPIENTS
      });
      return {
        ownerId,
        announcement: {
          ...announcement,
          createdAt: announcement.createdAt.toISOString(),
          updatedAt: announcement.updatedAt.toISOString(),
          previewedAt: announcement.previewedAt?.toISOString() ?? null,
          queuedAt: announcement.queuedAt?.toISOString() ?? null,
          completedAt: announcement.completedAt?.toISOString() ?? null,
          recipients: recipients.map(({ recipient, message, ...row }) => {
            const visible =
              isEligible(recipient) &&
              !recipient.deletionRequestedAt &&
              !recipient.socialRelations.length &&
              !recipient.socialTargets.length;
            return {
              ...row,
              recipient: {
                name: recipient.deletionRequestedAt
                  ? "Deleted member"
                  : visible
                    ? recipient.name
                    : "Unavailable account",
                username: visible ? recipient.username : null
              },
              href:
                visible && message
                  ? `/platform/messages/${message.conversationId}?message=${row.messageId}`
                  : null
            };
          })
        },
        available: !!(await founderAvailable(tx))
      };
    }
    if (query.view && query.view !== "list")
      throw new PortalError(400, "Choose an announcement view.");
    const after = query.after ? postId(query.after) : null;
    if (after) await ownedAnnouncement(tx, ownerId, after);
    const rows = await tx.founderAnnouncement.findMany({
      where: { founderId: ownerId },
      select: {
        id: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        selectedCount: true,
        sentCount: true,
        skippedCount: true
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: 21,
      ...(after ? { cursor: { id: after }, skip: 1 } : {})
    });
    return {
      ownerId,
      announcements: rows
        .slice(0, 20)
        .map((row) => ({
          ...row,
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString()
        })),
      after: rows.length > 20 ? rows[19].id : null,
      available: !!(await founderAvailable(tx))
    };
  });
}
export function founderAnnouncementCommand(
  db: PrismaClient,
  token: unknown,
  input: Record<string, unknown>
) {
  socialInput(input, [
    "operation",
    "mutationId",
    "ownerId",
    "id",
    "expectedVersion",
    "content",
    "recipientIds",
    "confirmed"
  ]);
  return socialCommand(
    db,
    token,
    "founder-announcement",
    input,
    async (tx, ownerId) => {
      if (input.operation === "save" && !input.id) {
        expected(input.expectedVersion, 0);
        if (
          (await tx.founderAnnouncement.count({
            where: { founderId: ownerId, status: "DRAFT" }
          })) >= 20
        )
          throw new PortalError(
            409,
            "Finish or discard an existing announcement draft first."
          );
        const row = await tx.founderAnnouncement.create({
          data: {
            founderId: ownerId,
            content: postField(input.content, 4000, 1)
          }
        });
        return {
          id: row.id,
          version: row.version,
          message: "Announcement draft saved. Nothing was sent."
        };
      }
      const row = await ownedAnnouncement(tx, ownerId, input.id);
      expected(input.expectedVersion, row.version);
      if (row.status !== "DRAFT")
        throw new PortalError(
          409,
          "This announcement has already left draft mode. Check its progress."
        );
      if (input.operation === "save" || input.operation === "discard") {
        await tx.founderAnnouncementRecipient.deleteMany({
          where: { announcementId: row.id }
        });
        const discarded = input.operation === "discard";
        const saved = await tx.founderAnnouncement.update({
          where: { id: row.id },
          data: {
            content: discarded ? null : postField(input.content, 4000, 1),
            status: discarded ? "CANCELLED" : "DRAFT",
            previewedAt: null,
            selectedCount: 0,
            ...(discarded ? { completedAt: new Date() } : {}),
            version: { increment: 1 }
          }
        });
        return {
          id: saved.id,
          version: saved.version,
          message: discarded
            ? "Draft discarded. Nothing was sent."
            : "Draft saved. Preview the revised text and recipients before sending."
        };
      }
      if (input.operation === "preview") {
        const ids = selectedRecipients(input.recipientIds);
        const eligible = await tx.founderWelcome.findMany({
          where: audienceWhere(ownerId, ids),
          select: { recipientId: true }
        });
        if (eligible.length !== ids.length)
          throw new PortalError(
            409,
            "Some selected members are no longer eligible for announcements. Review the current member list."
          );
        await tx.founderAnnouncementRecipient.deleteMany({
          where: { announcementId: row.id }
        });
        await tx.founderAnnouncementRecipient.createMany({
          data: ids.map((recipientId) => ({
            announcementId: row.id,
            recipientId
          }))
        });
        const saved = await tx.founderAnnouncement.update({
          where: { id: row.id },
          data: {
            previewedAt: new Date(),
            selectedCount: ids.length,
            version: { increment: 1 }
          }
        });
        return {
          id: saved.id,
          version: saved.version,
          message:
            "Preview prepared. Nothing was sent. Confirm the text and selected members before sending."
        };
      }
      if (input.operation !== "send")
        throw new PortalError(400, "Choose a supported announcement action.");
      await requirePrivilegedAuthentication(tx, ownerId, "send-announcement");
      if (
        input.confirmed !== true ||
        !row.previewedAt ||
        Date.now() - row.previewedAt.getTime() > PREVIEW_MS ||
        !row.selectedCount
      )
        throw new PortalError(
          409,
          "Prepare a fresh preview and deliberately confirm this send."
        );
      if ((await founderAvailable(tx)) !== ownerId)
        throw new PortalError(
          503,
          "Announcement sending is unavailable while messaging operations are paused. Your draft is saved."
        );
      const selected = await tx.founderAnnouncementRecipient.findMany({
        where: { announcementId: row.id, status: "SELECTED" },
        select: { recipientId: true }
      });
      const eligible = await tx.founderWelcome.findMany({
        where: audienceWhere(
          ownerId,
          selected.map((r) => r.recipientId)
        ),
        select: { recipientId: true }
      });
      const ids = eligible.map((r) => r.recipientId),
        now = new Date();
      await tx.founderAnnouncementRecipient.updateMany({
        where: { announcementId: row.id, recipientId: { in: ids } },
        data: { status: "PENDING" }
      });
      await tx.founderAnnouncementRecipient.updateMany({
        where: { announcementId: row.id, status: "SELECTED" },
        data: { status: "SKIPPED", finishedAt: now }
      });
      const saved = await tx.founderAnnouncement.update({
        where: { id: row.id },
        data: {
          status: ids.length ? "SENDING" : "COMPLETE",
          queuedAt: now,
          skippedCount: row.selectedCount - ids.length,
          ...(!ids.length ? { content: null, completedAt: now } : {}),
          version: { increment: 1 }
        }
      });
      return {
        id: saved.id,
        version: saved.version,
        message: ids.length
          ? "Announcement queued for the selected eligible members. Progress is separate from phone delivery."
          : "No selected members remain eligible. Nothing was sent."
      };
    },
    async (tx, ownerId) => {
      if (input.ownerId !== ownerId)
        throw new PortalError(
          401,
          "Your sign-in changed. Reload before changing announcements."
        );
      await requireFounder(tx, ownerId);
    }
  );
}

async function finishRecipient(
  tx: Tx,
  row: FounderAnnouncement,
  recipientId: string,
  messageId?: string
) {
  await tx.founderAnnouncementRecipient.update({
    where: {
      announcementId_recipientId: { announcementId: row.id, recipientId }
    },
    data: {
      status: messageId ? "SENT" : "SKIPPED",
      messageId: messageId ?? null,
      finishedAt: new Date()
    }
  });
  await tx.founderAnnouncement.update({
    where: { id: row.id },
    data: messageId
      ? { sentCount: { increment: 1 } }
      : { skippedCount: { increment: 1 } }
  });
}
// A single canonical message and its terminal recipient receipt commit together.
// Native-queue retries can safely run concurrently; no provider call holds the lock.
export function deliverAnnouncementRecipient(db: PrismaClient, id: string) {
  return notificationWrite(db, async (tx) => {
    const row = await tx.founderAnnouncement.findUnique({ where: { id } });
    if (!row || row.status !== "SENDING") return { done: true };
    if (
      !row.content ||
      !row.queuedAt ||
      Date.now() - row.queuedAt.getTime() >= 7 * DAY
    ) {
      await tx.founderAnnouncementRecipient.updateMany({
        where: { announcementId: id, status: "PENDING" },
        data: { status: "SKIPPED", finishedAt: new Date() }
      });
    }
    const recipient = await tx.founderAnnouncementRecipient.findFirst({
      where: { announcementId: id, status: "PENDING" },
      orderBy: { recipientId: "asc" }
    });
    if (!recipient) {
      await tx.founderAnnouncement.update({
        where: { id },
        data: {
          status: "COMPLETE",
          content: null,
          completedAt: new Date(),
          skippedCount: row.selectedCount - row.sentCount,
          version: { increment: 1 }
        }
      });
      return { done: true };
    }
    if ((await founderAvailable(tx)) !== row.founderId)
      return { done: false, paused: true };
    const welcome = await tx.founderWelcome.findFirst({
      where: audienceWhere(row.founderId, [recipient.recipientId]),
      include: { conversation: true }
    });
    if (!welcome || welcome.conversation.lastSequence >= 2147483647) {
      await finishRecipient(tx, row, recipient.recipientId);
      return { done: false };
    }
    const conversation = await tx.adultConversation.update({
      where: { id: welcome.conversationId },
      data: { lastSequence: { increment: 1 } }
    });
    const message = await tx.adultMessage.create({
      data: {
        conversationId: conversation.id,
        senderId: row.founderId,
        sequence: conversation.lastSequence,
        kind: "FOUNDER_ANNOUNCEMENT",
        content: row.content!
      }
    });
    await recordMessageActivity(tx, {
      key: `adult-message:${message.id}`,
      kind: "ADULT_MESSAGE_CREATED",
      actorId: row.founderId,
      recipientId: recipient.recipientId,
      conversationId: conversation.id,
      messageId: message.id,
      createdAt: message.createdAt
    });
    await finishRecipient(tx, row, recipient.recipientId, message.id);
    return { done: false, messageId: message.id };
  });
}
export async function cleanFounderAnnouncements(tx: Tx, now = new Date()) {
  await tx.$executeRaw`UPDATE "FounderAnnouncement" SET status = 'COMPLETE', content = NULL,
    "completedAt" = ${now.toISOString()}::timestamp, "updatedAt" = ${now.toISOString()}::timestamp,
    "skippedCount" = "selectedCount" - "sentCount", version = version + 1
    WHERE status = 'SENDING' AND "queuedAt" <= ${new Date(now.getTime() - 7 * DAY).toISOString()}::timestamp`;
  await tx.founderAnnouncementRecipient.updateMany({
    where: {
      status: { in: ["SELECTED", "PENDING"] },
      announcement: { status: { in: ["COMPLETE", "CANCELLED"] } }
    },
    data: { status: "SKIPPED", finishedAt: now }
  });

  return (
    await tx.founderAnnouncementRecipient.deleteMany({
      where: {
        announcement: {
          status: { in: ["COMPLETE", "CANCELLED"] },
          completedAt: { lt: new Date(now.getTime() - 14 * DAY) }
        }
      }
    })
  ).count;
}
