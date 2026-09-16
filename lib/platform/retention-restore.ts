import { Prisma, type PrismaClient } from "@prisma/client";
import { clearRestoredMeasurements } from "./platform-measurement";
import { createSessionToken, hashSessionToken } from "./auth";
import { revokePushSubscriptions } from "./push-subscriptions";
import { replayAccountDeletions } from "./account-deletion-journal";
import { replayMessagingDeletions } from "./retention-journal";
import {
  replayRetentionControls,
  inspectRestoredHolds,
  inspectRestoredModeration,
  inspectRestoredAppeals,
  inspectRestoredAccountRestrictions
} from "./retention-controls";
import type { RetentionJournals } from "./retention-maintenance";

async function requireIsolatedRestore(db: PrismaClient) {
  if (
    process.env.RETENTION_RESTORE_ISOLATED !== "true" ||
    process.env.VERCEL ||
    process.env.ACCOUNT_DELIVERY_MODE !== "disabled" ||
    [
      "PUSH_ENABLED",
      "FOUNDER_WELCOME_ENABLED",
      "COMMUNITY_REPORTS_ENABLED",
      "RETENTION_CLEANUP_ENABLED"
    ].some((k) => process.env[k] === "true")
  )
    throw Error(
      "Restoration requires isolated, traffic-disabled configuration with outbound work disabled"
    );
  const [target] = await db.$queryRaw<
    Array<{ name: string; address: string }>
  >`SELECT current_database() AS name, host(inet_server_addr()) AS address`;
  if (
    !target ||
    !/^godschurches_[a-z_]+_restore$/.test(target.name) ||
    !["127.0.0.1", "::1"].includes(target.address)
  )
    throw Error(
      "Only an isolated local Godschurches restoration database is permitted"
    );
}

// A restore is a recovery operation, never a web endpoint. All bearer credentials
// and queued work are retired before replay. Current elevated authority must be
// appointed again through its normal verified process before any traffic opens.
export async function quarantineRestoredAccess(db: PrismaClient) {
  await requireIsolatedRestore(db);
  return db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(730221, 2)`;
      const now = new Date();
      const pendingDeliveries = await tx.notificationDelivery.count({
        where: { state: { not: "FINISHED" } }
      });
      const devices = await revokePushSubscriptions(tx, {}, now);
      // Restored plan agreement cannot authorize new disclosure or reminders.
      // Explicit report evidence remains canonical but hidden from participants.
      await tx.exchangeInquiry.updateMany({ where: { state: { in: ["INQUIRED", "SELECTED", "RESERVED"] } },
        data: { state: "REVOKED", endedAt: now, wakeAt: null, dispatchedAt: null, dispatchClaimedAt: null, version: { increment: 1 } } });
      await tx.$executeRaw`UPDATE "ExchangeInquiry" i SET "pickupDetails"='' WHERE i.state='REVOKED'
        AND NOT EXISTS (SELECT 1 FROM "CommunityReport" r WHERE r."targetType"='EXCHANGE_HANDOFF' AND r."targetId"=i.id)
        AND NOT EXISTS (SELECT 1 FROM "RetentionHold" h WHERE h.target='EXCHANGE_INQUIRY' AND h."targetId"=i.id AND h."releasedAt" IS NULL)`;
      await tx.exchangeListing.updateMany({ where: { inquiriesEnabled: true }, data: {
        inquiriesEnabled: false, inquiryReceiverId: null, inquiryAuthorityKey: null, inquiryContactVersion: { increment: 1 },
        state: "DRAFT", recoveryRequired: true, version: { increment: 1 }
      } });
      const scheduledPosts = await tx.platformPost.updateMany({
        where: { status: "SCHEDULED" },
        data: {
          status: "DRAFT",
          publishedAt: null,
          scheduleAt: null,
          scheduleLocal: null,
          scheduleZone: null,
          scheduledById: null,
          scheduleDispatchedAt: null,
          scheduleDispatchedVersion: null,
          version: { increment: 1 }
        }
      });
      const activityJobs = await tx.notificationFanoutJob.updateMany({
        where: { completedAt: null },
        data: { completedAt: now, dispatchedAt: null }
      });
      const conversationJobs = await tx.commentFollowerJob.updateMany({
        where: { completedAt: null },
        data: { completedAt: now, dispatchedAt: null }
      });
      await tx.notificationDelivery.updateMany({
        where: { state: { not: "FINISHED" } },
        data: {
          state: "FINISHED",
          outcome: "CANCELLED",
          finishedAt: now,
          leaseToken: null,
          leaseUntil: null
        }
      });
      const sessions = await tx.platformSession.deleteMany();
      await tx.platformAccountGrant.deleteMany();
      await tx.platformEmailChange.deleteMany();
      await tx.platformGoogleAttempt.deleteMany();
      await tx.platformRecentAuthentication.deleteMany();
      const googleAssociations = await tx.platformGoogleIdentity.deleteMany();
      await tx.platformUser.updateMany({
        data: {
          pendingFounderWelcomeAt: null,
          credentialVersion: { increment: 1 }
        }
      });
      await tx.founderWelcome.updateMany({
        where: { revokedAt: null },
        data: { revokedAt: now }
      });
      await tx.$executeRaw`UPDATE "FounderAnnouncement" SET status = 'CANCELLED', content = NULL,
      "completedAt" = ${now.toISOString()}::timestamp, "updatedAt" = ${now.toISOString()}::timestamp,
      "skippedCount" = "selectedCount" - "sentCount", version = version + 1 WHERE status IN ('DRAFT','SENDING')`;
      await tx.founderAnnouncementRecipient.updateMany({
        where: { status: { in: ["SELECTED", "PENDING"] } },
        data: { status: "SKIPPED", finishedAt: now }
      });
      await tx.adultConversation.updateMany({
        where: { sendingAllowed: true },
        data: { sendingAllowed: false, version: { increment: 1 } }
      });
      await tx.adultContactRequest.updateMany({
        where: { status: "PENDING" },
        data: { status: "REVOKED", version: { increment: 1 } }
      });
      await tx.friendInvitation.updateMany({
        where: { revokedAt: null },
        data: { revokedAt: now, version: { increment: 1 } }
      });
      await tx.friendAcceptance.updateMany({
        where: { state: "PENDING" },
        data: { state: "UNAVAILABLE" }
      });
      const operators = await tx.platformOperatorGrant.updateMany({
        where: { revokedAt: null },
        data: { revokedAt: now }
      });
      await tx.adminSavedView.deleteMany({});
      // Keep an opaque retired-factor marker: deleting it would let a restored
      // primary account bypass lost-factor review by enrolling from scratch.
      await tx.adminAuthenticator.updateMany({ data: {
        quarantinedAt: now, recoveryRequired: true, secretCiphertext: "",
        recoveryHashes: [], confirmedAt: null, expiresAt: now,
        sessionId: "", version: { increment: 1 }
      } });
      await tx.privilegedSessionProof.deleteMany({});
      await tx.privilegedSecurityNotice.deleteMany({});
      const measurementsRetired = await clearRestoredMeasurements(tx);
      const topicRoles = await tx.topicMembership.updateMany({
        where: { OR: [{ moderator: true }, { pendingRole: { not: null } }] },
        data: {
          moderator: false,
          pendingRole: null,
          invitedById: null,
          version: { increment: 1 }
        }
      });
      const topics = await tx.topicCommunity.updateMany({
        where: { ownerId: { not: null } },
        data: { recoveryRequired: true }
      });
      const churchCapabilities = await tx.churchCapabilityGrant.updateMany({
        where: { revokedAt: null },
        data: { revokedAt: now, version: { increment: 1 } }
      });
      const churchRoles = await tx.churchRoleGrant.updateMany({
        where: { revokedAt: null },
        data: { revokedAt: now, version: { increment: 1 } }
      });
      const supportCapabilities = await tx.supportCapabilityGrant.updateMany({
        where: { revokedAt: null },
        data: { revokedAt: now, version: { increment: 1 } }
      });
      await tx.supportIntakeSetting.updateMany({
        where: { enabled: true },
        data: { enabled: false }
      });
      // Old progress links are bearer credentials too; no restored hash is reused.
      // The ordinary request trigger deliberately forbids changing its proof. In
      // this quarantined restore only, recreate the same receipt and fixed clocks
      // with a fresh undisclosed proof; no live request is retargeted or postponed.
      for (const row of await tx.accountDeletion.findMany()) {
        await tx.accountDeletion.delete({ where: { id: row.id } });
        await tx.accountDeletion.create({
          data: {
            ...row,
            exceptions: row.exceptions as Prisma.InputJsonValue,
            proofHash: hashSessionToken(createSessionToken())
          }
        });
      }
      return {
        sessions: sessions.count,
        devices: devices.count,
        scheduledPosts: scheduledPosts.count,
        deliveries: pendingDeliveries,
        activityJobs: activityJobs.count,
        conversationJobs: conversationJobs.count,
        googleAssociations: googleAssociations.count,
        topicsNeedingOwnershipReview: topics.count,
        measurementsRetired,
        elevatedGrants:
          operators.count +
          churchCapabilities.count +
          churchRoles.count +
          supportCapabilities.count +
          topicRoles.count
      };
    },
    { maxWait: 10000, timeout: 60000 }
  );
}
// Complete every protected page with the source frozen against new writes. A
// truncated/failed page aborts recovery; this function never changes traffic or
// feature flags. Journal completion dates and existing source clocks survive.
export async function replayProtectedRestoration(
  db: PrismaClient,
  journals: RetentionJournals
) {
  const quarantine = await quarantineRestoredAccess(db);
  let cursor: string | undefined,
    messageRecords = 0,
    accountRecords = 0,
    controlRecords = 0;
  const missing = new Set<string>();
  do {
    const page = await journals.controls.page(cursor);
    const result = await replayRetentionControls(db, page.entries);
    result.missingReports.forEach((id) => missing.add(id));
    controlRecords += page.entries.length;
    cursor = page.cursor;
  } while (cursor);
  do {
    const page = await journals.messages.page(cursor);
    await replayMessagingDeletions(db, page.entries);
    messageRecords += page.entries.length;
    cursor = page.cursor;
  } while (cursor);
  do {
    const page = await journals.accounts.page(cursor);
    await replayAccountDeletions(db, page.entries, journals.accounts);
    accountRecords += page.entries.length;
    cursor = page.cursor;
  } while (cursor);
  // A newer protected purge legitimately explains a case absent from the backup.
  const unresolvedReports: string[] = [];
  for (const id of missing)
    if (
      !(await db.retentionPurge.count({
        where: { target: "REPORT", targetId: id }
      }))
    )
      unresolvedReports.push(id);
  const holdsNeedingReasonReview = await inspectRestoredHolds(db);
  const contentNeedingReinspection = await inspectRestoredModeration(db);
  const appealsNeedingRecovery = await inspectRestoredAppeals(db);
  const accountsNeedingRestrictionReview =
    await inspectRestoredAccountRestrictions(db);
  const replayComplete = unresolvedReports.length === 0 &&
    holdsNeedingReasonReview === 0 && contentNeedingReinspection === 0 &&
    appealsNeedingRecovery === 0 && accountsNeedingRestrictionReview === 0;
  // A backup cannot reconstruct every lifecycle event since its snapshot.
  // Begin a new explicit baseline after protected replay; keep earlier buckets
  // under their old version instead of presenting restore-time edges as history.
  const metricBaseline = replayComplete ? await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(730221, 2)`;
    const prior = await tx.platformMetricConfiguration.findFirstOrThrow({ orderBy: { version: "desc" } });
    const [counts] = await tx.$queryRaw<{ enabled: bigint; deactivated: bigint; suspended: bigint }[]>`
      SELECT count(*) FILTER(WHERE gc_metric_account_state(u)='ENABLED') AS enabled,
        count(*) FILTER(WHERE gc_metric_account_state(u)='DEACTIVATED') AS deactivated,
        count(*) FILTER(WHERE gc_metric_account_state(u)='SUSPENDED') AS suspended FROM "PlatformUser" u`;
    const baseline = await tx.platformMetricConfiguration.create({ data: {
      version: prior.version + 1, zone: prior.zone, openingStates: {
        ENABLED: Number(counts.enabled), DEACTIVATED: Number(counts.deactivated), SUSPENDED: Number(counts.suspended)
      }
    } });
    return { version: baseline.version, zone: baseline.zone, startedAt: baseline.startedAt.toISOString() };
  }) : null;
  return {
    quarantine,
    messageRecords,
    accountRecords,
    controlRecords,
    unresolvedReports,
    holdsNeedingReasonReview,
    contentNeedingReinspection,
    appealsNeedingRecovery,
    accountsNeedingRestrictionReview,
    metricBaseline,
    replayComplete,
    trafficEnabled: false,
    currentAuthorizationReviewRequired: true
  };
}
