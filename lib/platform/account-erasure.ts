import { Prisma, type PrismaClient } from "@prisma/client";
import { retireImage } from "./media";
import {
  accountDeletionRecord,
  refreshAccountDeletionHandoffs,
  type AccountDeletionJournal
} from "./account-deletion";
import { markUnretainedMessages } from "./messaging-retention";

type Tx = Prisma.TransactionClient;
const personalPost = (userId: string) => ({
  authorId: userId,
  authorChurchId: null
});

async function erasePrivateCollections(tx: Tx, userId: string) {
  await tx.savedPostItem.deleteMany({ where: { ownerId: userId } });
  await tx.savedPostCollection.deleteMany({ where: { ownerId: userId } });
  await tx.privatePostDraft.deleteMany({ where: { ownerId: userId } });
  await tx.privateCommentDraft.deleteMany({ where: { ownerId: userId } });
  await tx.postWorkspaceOperation.deleteMany({ where: { ownerId: userId } });
  await tx.socialOperation.deleteMany({ where: { ownerId: userId } });
  await tx.conversationPreference.deleteMany({ where: { ownerId: userId } });
  await tx.socialPreferences.deleteMany({ where: { ownerId: userId } });
  await tx.profilePresentation.deleteMany({ where: { userId } });
  await tx.photoAlbumEntry.deleteMany({ where: { ownerId: userId } });
  await tx.photoAlbum.deleteMany({ where: { ownerId: userId } });
  await tx.postPhotoReference.deleteMany({ where: { ownerId: userId } });
}

async function erasePersonalMedia(tx: Tx, userId: string) {
  const where = {
    OR: [{ profileUserId: userId }, { post: personalPost(userId) }],
    status: { not: "RETIRED" as const }
  };
  // The account stays pending while more batches or provider deletion remain.
  // Reuse retirement/garbage ownership instead of inventing a second asset queue.
  const assets = await tx.mediaAsset.findMany({
    where,
    take: 100,
    orderBy: { id: "asc" }
  });
  for (const asset of assets) await retireImage(tx, asset);
  await tx.mediaAsset.updateMany({
    where: { OR: [{ profileUserId: userId }, { post: personalPost(userId) }] },
    data: { caption: "", alt: "", crop: Prisma.DbNull }
  });
  return tx.mediaAsset.count({ where });
}

async function erasePersonalCalendars(tx: Tx, userId: string, now: Date) {
  const personal = { calendar: { ownerId: userId } };
  const occurrences = { event: personal };
  await tx.calendarShare.deleteMany({
    where: { calendar: { ownerId: userId } }
  });
  await tx.calendarEventShare.deleteMany({ where: { event: personal } });
  await tx.calendarResponse.deleteMany({
    where: { OR: [{ userId }, { occurrence: occurrences }] }
  });
  // Canonical discussion stubs may still be parents of another person's reply.
  // They keep no erased owner's content; detach only the deleted personal event.
  await tx.platformPost.updateMany({
    where: { eventOccurrence: occurrences },
    data: {
      eventOccurrenceId: null,
      withdrawnAt: now,
      status: "WITHDRAWN",
      version: { increment: 1 }
    }
  });
  await tx.calendarOccurrence.deleteMany({ where: occurrences });
  await tx.calendarEvent.deleteMany({ where: personal });
  await tx.calendarAudit.deleteMany({
    where: { OR: [{ actorId: userId }, { calendar: { ownerId: userId } }] }
  });
  await tx.platformCalendar.deleteMany({ where: { ownerId: userId } });
}

async function eraseSocialData(tx: Tx, userId: string, now: Date) {
  await tx.platformFollow.deleteMany({
    where: { OR: [{ followerId: userId }, { followingId: userId }] }
  });
  await tx.socialRelationship.deleteMany({
    where: { OR: [{ ownerId: userId }, { targetUserId: userId }] }
  });
  await tx.friendAcceptance.deleteMany({
    where: { OR: [{ inviterId: userId }, { recipientId: userId }] }
  });
  await tx.friendInvitation.deleteMany({ where: { ownerId: userId } });
  await tx.platformPostLike.deleteMany({ where: { userId } });
  await tx.commentLike.deleteMany({ where: { userId } });
  await tx.commentMention.deleteMany({
    where: { OR: [{ recipientId: userId }, { comment: { authorId: userId } }] }
  });
  await tx.postPollBallot.deleteMany({
    where: { OR: [{ userId }, { poll: { post: personalPost(userId) } }] }
  });
  await tx.postPollOption.deleteMany({
    where: { poll: { post: personalPost(userId) } }
  });
  await tx.postPoll.deleteMany({ where: { post: personalPost(userId) } });
  await tx.postVolunteerSignup.deleteMany({
    where: { OR: [{ userId }, { slot: { post: personalPost(userId) } }] }
  });
  await tx.postVolunteerSlot.deleteMany({
    where: { post: personalPost(userId) }
  });
  await tx.socialEvent.deleteMany({
    where: { OR: [{ actorId: userId }, { recipientId: userId }] }
  });
  await tx.pushSubscription.deleteMany({
    where: { ownerId: userId, revokedAt: { not: null } }
  });
  await tx.postAudit.deleteMany({ where: { actorId: userId } });
  await tx.commentPin.deleteMany({ where: { comment: { authorId: userId } } });
  await tx.platformPost.updateMany({
    where: personalPost(userId),
    data: {
      status: "WITHDRAWN",
      withdrawnAt: now,
      scripture: null,
      linkUrl: null,
      linkTitle: null,
      linkDescription: null,
      linkSourceUrl: null,
      topics: [],
      discussionClosed: true,
      scheduleAt: null,
      scheduleLocal: null,
      scheduleZone: null,
      scheduledById: null,
      pinUntil: null,
      version: { increment: 1 }
    }
  });
  // A canonical selected source remains only for its existing report's lifetime.
  // No whole conversation or copied archive is retained as an erasure exception.
  await tx.$executeRaw`UPDATE "PlatformPost" p SET content = ''
    WHERE p."authorId" = ${userId} AND p."authorChurchId" IS NULL AND NOT EXISTS
      (SELECT 1 FROM "CommunityReport" r WHERE r."targetType" = 'POST' AND r."targetId" = p.id)`;
  // Selected reported comments stay canonical and are hidden by the permanently
  // closed author's existing visibility predicate. Other comments must clear the
  // body and set the tombstone together, as required by the thread constraint.
  await tx.$executeRaw`UPDATE "PlatformPostComment" c SET content = '',
      "deletedAt" = COALESCE(c."deletedAt", ${now.toISOString()}::timestamp),
      version = c.version + 1
    WHERE c."authorId" = ${userId} AND c."authorChurchId" IS NULL AND NOT EXISTS
      (SELECT 1 FROM "CommunityReport" r WHERE r."targetType" = 'COMMENT' AND r."targetId" = c.id)`;
  await tx.$executeRaw`UPDATE "AdultContactRequest" r SET purpose = 'Removed after account deletion.'
    WHERE (r."senderId" = ${userId} OR r."recipientId" = ${userId}) AND NOT EXISTS
      (SELECT 1 FROM "CommunityReport" c WHERE c."targetType" = 'CONTACT_REQUEST' AND c."targetId" = r.id)`;
}

async function eraseAccountSubmissions(tx: Tx, userId: string, now: Date) {
  await tx.churchDirectoryPreference.deleteMany({
    where: { connection: { userId } }
  });
  await tx.churchListingDecision.deleteMany({
    where: { submission: { ownerId: userId } }
  });
  await tx.churchListingSubmission.deleteMany({ where: { ownerId: userId } });
  // Keep opaque authority/source references needed by current shared church
  // records, with personal application evidence removed and access revoked.
  await tx.churchClaimDecision.updateMany({
    where: { claim: { ownerId: userId } },
    data: {
      evidence: {},
      reason: "Personal application data removed after account closure."
    }
  });
  await tx.churchClaim.updateMany({
    where: { ownerId: userId },
    data: {
      authority: {},
      profile: {},
      preparation: "",
      reviewReason: "",
      status: "REVOKED",
      version: { increment: 1 }
    }
  });
  await tx.supportCoordinatorShare.deleteMany({
    where: { case: { requesterId: userId } }
  });
  await tx.supportCase.updateMany({
    where: { requesterId: userId },
    data: {
      subject: "Deleted member request",
      description: "Personal information removed after account deletion.",
      resolution: null,
      status: "CLOSED",
      version: { increment: 1 }
    }
  });
  await tx.supportMessage.updateMany({
    where: { authorId: userId, case: { requesterId: userId } },
    data: { body: "Removed after account deletion.", redactedAt: now }
  });
  await tx.supportRead.deleteMany({ where: { userId } });
  await tx.supportOperation.deleteMany({ where: { actorId: userId } });
}

// Secured operator/maintenance entry point, never a public arbitrary-user delete.
// Call after inspecting the recorded verified request. The account's own request
// fixes scope; current holds and shared ownership are rechecked under the gate.
export async function eraseRequestedAccountData(
  db: PrismaClient,
  requestId: string,
  journal: AccountDeletionJournal
) {
  const request = await db.accountDeletion.findUniqueOrThrow({
    where: { id: requestId }
  });
  await journal.recordAccount(accountDeletionRecord(request));
  return db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(730221, 2)`;
      const row = await tx.accountDeletion.findUniqueOrThrow({
        where: { id: requestId }
      });
      const userId = row.userId,
        now = new Date();
      const user = await tx.platformUser.findUniqueOrThrow({
        where: { id: userId }
      });
      if (!user.deletionRequestedAt || !user.deactivatedAt)
        throw new Error("A verified permanent closure is required");
      await erasePrivateCollections(tx, userId);
      const remainingImages = await erasePersonalMedia(tx, userId);
      await erasePersonalCalendars(tx, userId, now);
      await eraseSocialData(tx, userId, now);
      await eraseAccountSubmissions(tx, userId, now);
      await tx.platformSession.deleteMany({ where: { userId } });
      await tx.platformAccountGrant.deleteMany({ where: { userId } });
      await tx.platformEmailChange.deleteMany({ where: { userId } });
      await tx.platformRecentAuthentication.deleteMany({ where: { userId } });
      await tx.platformGoogleAttempt.deleteMany({
        where: { OR: [{ linkUserId: userId }, { email: user.email }] }
      });
      await tx.platformGoogleIdentity.deleteMany({ where: { userId } });
      await tx.waitlistSignup.deleteMany({ where: { email: user.email } });
      await tx.platformUser.update({
        where: { id: userId },
        data: {
          name: "Deleted member",
          username: `erased-${userId}`,
          email: `deleted-${userId}@deleted.invalid`,
          passwordHash: null,
          emailVerifiedAt: null,
          adultAcknowledgedAt: null,
          adultPolicyVersion: null,
          bio: null,
          location: null,
          website: null,
          interests: [],
          role: "BELIEVER",
          erasedAt: user.erasedAt ?? now
        }
      });
      await markUnretainedMessages(tx, now, undefined, userId);
      await refreshAccountDeletionHandoffs(tx, row);
      return tx.accountDeletion.update({
        where: { id: row.id },
        data: {
          journaledAt: now,
          structuredPurgedAt: remainingImages
            ? null
            : (row.structuredPurgedAt ?? now)
        }
      });
    },
    { maxWait: 10000, timeout: 30000 }
  );
}

// Metadata is removed only after the existing provider cleanup ledger has been
// acknowledged. A failed/uncertain provider delete keeps the request pending.
// Bounded batches also catch a crash between garbage acknowledgement and this job.
export async function finalizeAccountDeletion(
  db: PrismaClient,
  requestId: string,
  journal: AccountDeletionJournal
) {
  if (!journal.completeAccount)
    throw Error("Protected account completion is required");
  const result = await db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(730221, 2)`;
      const row = await tx.accountDeletion.findUniqueOrThrow({
        where: { id: requestId }
      });
      if (!row.structuredPurgedAt || !row.journaledAt)
        return { row, pending: true };
      const assets = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT a.id FROM "MediaAsset" a
      LEFT JOIN "PlatformPost" p ON p.id = a."postId"
      WHERE a.status = 'RETIRED' AND
        (a."profileUserId" = ${row.userId} OR (p."authorId" = ${row.userId} AND p."authorChurchId" IS NULL))
        AND NOT EXISTS (SELECT 1 FROM "MediaGarbage" g WHERE g."storagePrefix" = a."storagePrefix")
      ORDER BY a.id LIMIT 100`;
      const ids = assets.map((a) => a.id);
      await tx.personalPhoto.deleteMany({ where: { assetId: { in: ids } } });
      await tx.mediaAsset.deleteMany({ where: { id: { in: ids } } });
      const latest = await refreshAccountDeletionHandoffs(tx, row);
      const [messages] = await tx.$queryRaw<Array<{ pending: boolean }>>`
      SELECT EXISTS(SELECT 1 FROM "AdultMessage" m
        JOIN "AdultConversation" c ON c.id = m."conversationId"
        WHERE m."unretainedAt" IS NOT NULL
          AND (c."participantAId" = ${row.userId} OR c."participantBId" = ${row.userId})
          AND NOT EXISTS (SELECT 1 FROM "CommunityReport" r
            WHERE r."targetType" = 'MESSAGE' AND r."targetId" = m.id)
          AND NOT EXISTS (SELECT 1 FROM "RetentionHold" h
            WHERE h.target = 'MESSAGE' AND h."targetId" = m.id AND h."releasedAt" IS NULL)
      ) AS pending`;
      const outstanding =
        Object.values(latest.exceptions as Record<string, number>).some(
          Boolean
        ) ||
        !!(await tx.mediaAsset.count({
          where: {
            OR: [
              { profileUserId: row.userId },
              { post: personalPost(row.userId) }
            ]
          }
        })) ||
        messages.pending;
      if (outstanding) return { row: latest, pending: true };
      return {
        row: await tx.accountDeletion.update({
          where: { id: row.id },
          data: { completedAt: row.completedAt ?? new Date() }
        }),
        pending: false
      };
    },
    { maxWait: 10000, timeout: 30000 }
  );
  if (!result.pending) {
    await journal.completeAccount(
      accountDeletionRecord(result.row),
      result.row.completedAt!.toISOString()
    );
    await db.accountDeletion.updateMany({
      where: { id: requestId, completionJournaledAt: null },
      data: { completionJournaledAt: new Date() }
    });
  }
  return { pending: result.pending, completedAt: result.row.completedAt };
}
