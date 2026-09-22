import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { emptyFeedback } from "./feedback-policy";
import { retireFeedbackImages } from "./feedback-image-lifecycle";
import { mergeFeedbackSuppression } from "./feedback-prompt-preferences";
import {
  feedbackPromptOutcomes,
  type FeedbackPromptOutcome
} from "./feedback-prompt-policy";
import {
  Prisma,
  type PrismaClient,
  type CommunityReport,
  type CommunityReportDecision,
  type RetentionHold
} from "@prisma/client";
import {
  privateRetentionStore,
  type RetentionJournalStore
} from "./retention-journal";
import {
  MESSAGING_RETENTION_POLICY as policy,
  retentionDate
} from "./messaging-retention";
type Tx = Prisma.TransactionClient;
const PREFIX = "retention-v1/controls/";
export type RetentionControlEntry = {
  id: string;
  kind:
    | "REPORT"
    | "HOLD"
    | "MODERATION_POST"
    | "MODERATION_COMMENT"
    | "MODERATION_TOPIC"
    | "MODERATION_GROUP"
    | "MODERATION_EXCHANGE"
    | "GROUP_ACCESS"
    | "TOPIC_ACCESS"
    | "POST_DISCOVERY"
    | "EXCHANGE_VISIBILITY"
    | "EXCHANGE_FAVORITE"
    | "EXCHANGE_SAVED_SEARCH"
    | "EXCHANGE_NEED"
    | "VOLUNTEER_OPPORTUNITY"
    | "VOLUNTEER_APPLICATION"
    | "PANTRY_HUB"
    | "EXCHANGE_INQUIRY"
    | "EXCHANGE_CONTACT"
    | "EXCHANGE_DEFAULTS"
    | "DISCOVERY_PREFERENCES"
    | "CALENDAR_LAYER"
    | "FOLLOWING_LISTS"
    | "PROFILE_LOCATION"
    | "PROFILE_MODULES"
    | "NOTIFICATION_PREFERENCES"
    | "AUTHOR_BELL"
    | "PHOTO_TAG"
    | "PHOTO_TAG_PREFERENCES"
    | "ADMIN_SUPPORT"
    | "ADMIN_REPORT"
    | "ADMIN_CLAIM"
    | "SUPPORT_MESSAGE"
    | "SUPPORT_ATTACHMENT"
    | "FEEDBACK_PROMPT"
    | "FEEDBACK_CHOICES"
    | "FEEDBACK_IDEA"
    | "FEEDBACK_SUBSCRIPTION"
    | "FEEDBACK_REVIEW"
    | "APPEAL"
    | "ACCOUNT_STATE"
    | "AUTHOR_WITHDRAW_POST"
    | "AUTHOR_WITHDRAW_COMMENT";
  target: "REPORT" | "MESSAGE" | "ACCOUNT" | "ASSET" | "EXCHANGE_INQUIRY";
  targetId: string;
  sourceId: string;
  version: number;
  policy: typeof policy;
  outcome: string;
  operatorId: string | null;
  recordedAt: string;
  startedAt: string;
  reviewDueAt: string;
  endedAt: string | null;
};
export interface RetentionControlJournal {
  record(entry: RetentionControlEntry): Promise<void>;
}
const opaque = (v: unknown) =>
  typeof v === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(v);
const date = (v: unknown) =>
  typeof v === "string" &&
  Number.isFinite(Date.parse(v)) &&
  new Date(v).toISOString() === v;
function validate(value: unknown): RetentionControlEntry {
  const r = value as RetentionControlEntry;
  if (
    !r ||
    typeof r !== "object" ||
    Array.isArray(r) ||
    Object.keys(r).sort().join() !==
      "endedAt,id,kind,operatorId,outcome,policy,recordedAt,reviewDueAt,sourceId,startedAt,target,targetId,version" ||
    ![r.id, r.targetId, r.sourceId].every(opaque) ||
    (r.operatorId !== null && !opaque(r.operatorId)) ||
    !Number.isSafeInteger(r.version) ||
    r.version < 1 ||
    r.policy !== policy ||
    (["PROFILE_LOCATION", "PROFILE_MODULES", "FOLLOWING_LISTS"].includes(
      r.kind
    ) &&
      (r.sourceId !== r.targetId || r.operatorId !== r.targetId)) ||
    ![r.recordedAt, r.startedAt, r.reviewDueAt].every(date) ||
    (r.endedAt !== null && !date(r.endedAt)) ||
    !([
      "GROUP_ACCESS",
      "TOPIC_ACCESS",
      "POST_DISCOVERY",
      "EXCHANGE_VISIBILITY",
      "EXCHANGE_FAVORITE",
      "EXCHANGE_SAVED_SEARCH",
      "EXCHANGE_NEED",
      "VOLUNTEER_OPPORTUNITY",
      "VOLUNTEER_APPLICATION",
      "PANTRY_HUB",
      "EXCHANGE_INQUIRY",
      "EXCHANGE_CONTACT",
      "EXCHANGE_DEFAULTS",
      "DISCOVERY_PREFERENCES",
      "CALENDAR_LAYER",
      "FOLLOWING_LISTS",
      "PROFILE_LOCATION",
      "PROFILE_MODULES",
      "NOTIFICATION_PREFERENCES",
      "AUTHOR_BELL",
      "PHOTO_TAG",
      "PHOTO_TAG_PREFERENCES",
      "ADMIN_SUPPORT",
      "ADMIN_REPORT",
      "ADMIN_CLAIM",
      "FEEDBACK_CHOICES",
      "FEEDBACK_IDEA",
      "FEEDBACK_SUBSCRIPTION",
      "FEEDBACK_REVIEW"
    ].includes(r.kind)
      ? r.target === "ACCOUNT" &&
        r.operatorId !== null &&
        (r.outcome === "QUARANTINED" ||
          (r.kind === "ADMIN_SUPPORT" && r.outcome === "CASE_REDACTED"))
      : r.kind === "FEEDBACK_PROMPT"
        ? r.target === "ACCOUNT" &&
          r.sourceId === r.targetId &&
          r.operatorId === r.targetId &&
          feedbackPromptOutcomes.includes(r.outcome as FeedbackPromptOutcome)
        : r.kind === "SUPPORT_ATTACHMENT"
          ? r.target === "ASSET" &&
            r.operatorId !== null &&
            r.outcome === "REDACTED"
          : r.kind === "SUPPORT_MESSAGE"
            ? r.target === "MESSAGE" &&
              r.operatorId !== null &&
              r.outcome === "REDACTED"
            : r.kind === "ACCOUNT_STATE"
              ? r.target === "ACCOUNT" &&
                r.sourceId === r.targetId &&
                r.operatorId !== null &&
                ["SUSPENDED", "RESTORED"].includes(r.outcome)
              : r.kind === "REPORT"
                ? r.target === "REPORT" &&
                  r.sourceId === r.targetId &&
                  ["RECEIVED", "FOLLOW_UP_REQUIRED", "CLOSED"].includes(
                    r.outcome
                  )
                : r.kind === "MODERATION_POST" ||
                    r.kind === "MODERATION_COMMENT" ||
                    r.kind === "MODERATION_TOPIC" ||
                    r.kind === "MODERATION_GROUP" ||
                    r.kind === "MODERATION_EXCHANGE"
                  ? r.target === "REPORT" &&
                    ["VISIBLE", "HIDDEN", "REMOVED"].includes(r.outcome)
                  : r.kind === "AUTHOR_WITHDRAW_POST" ||
                      r.kind === "AUTHOR_WITHDRAW_COMMENT"
                    ? r.target === "REPORT" &&
                      r.outcome === "WITHDRAWN" &&
                      r.endedAt === null
                    : r.kind === "APPEAL"
                      ? r.target === "REPORT" &&
                        [
                          "RECEIVED",
                          "IN_PROGRESS",
                          "WAITING_FOR_REQUESTER",
                          "RESOLVED",
                          "CLOSED"
                        ].includes(r.outcome)
                      : r.kind === "HOLD" &&
                        ["REPORT", "MESSAGE", "EXCHANGE_INQUIRY"].includes(
                          r.target
                        ) &&
                        ["PRESERVE", "REVIEW", "RELEASE"].includes(
                          r.outcome
                        )) ||
    ["CLOSED", "RESOLVED", "RELEASE"].includes(r.outcome) !==
      (r.endedAt !== null)
  )
    throw Error("Invalid protected retention control");
  return r;
}
async function record(tx: Tx, entry: RetentionControlEntry) {
  validate(entry);
  await tx.retentionControl.upsert({
    where: {
      kind_sourceId_version: {
        kind: entry.kind,
        sourceId: entry.sourceId,
        version: entry.version
      }
    },
    create: {
      id: entry.id,
      target: entry.target,
      targetId: entry.targetId,
      sourceId: entry.sourceId,
      kind: entry.kind,
      version: entry.version,
      payload: entry,
      createdAt: new Date(entry.recordedAt)
    },
    update: {}
  });
}
export function recordReportControl(
  tx: Tx,
  report: CommunityReport,
  operatorId: string | null
) {
  return record(tx, {
    id: randomUUID(),
    kind: "REPORT",
    target: "REPORT",
    targetId: report.id,
    sourceId: report.id,
    version: report.version,
    policy,
    outcome: report.status,
    operatorId,
    recordedAt: report.updatedAt.toISOString(),
    startedAt: report.createdAt.toISOString(),
    reviewDueAt: report.reviewDueAt.toISOString(),
    endedAt: report.closedAt?.toISOString() ?? null
  });
}
// Opaque privacy versions only: never replicate internal notes, bug reports or
// credentials into the separately protected recovery journal.
export function recordAdminPrivacyControl(
  tx: Tx,
  source: { sourceType: "SUPPORT" | "REPORT" | "CLAIM"; sourceId: string },
  actorId: string,
  version: number,
  wholeCase = false
) {
  const now = new Date();
  return record(tx, {
    id: randomUUID(),
    kind: `ADMIN_${source.sourceType}`,
    target: "ACCOUNT",
    targetId: actorId,
    sourceId: source.sourceId,
    version,
    policy,
    outcome:
      wholeCase && source.sourceType === "SUPPORT"
        ? "CASE_REDACTED"
        : "QUARANTINED",
    operatorId: actorId,
    recordedAt: now.toISOString(),
    startedAt: now.toISOString(),
    reviewDueAt: retentionDate(now, 90).toISOString(),
    endedAt: null
  });
}
export function recordSupportMessagePrivacyControl(
  tx: Tx,
  caseId: string,
  messageId: string,
  actorId: string,
  version: number
) {
  const now = new Date();
  return record(tx, {
    id: randomUUID(),
    kind: "SUPPORT_MESSAGE",
    target: "MESSAGE",
    targetId: messageId,
    sourceId: caseId,
    version,
    policy,
    outcome: "REDACTED",
    operatorId: actorId,
    recordedAt: now.toISOString(),
    startedAt: now.toISOString(),
    reviewDueAt: retentionDate(now, 90).toISOString(),
    endedAt: null
  });
}
export function recordSupportAttachmentPrivacyControl(
  tx: Tx,
  sourceId: string,
  assetId: string,
  actorId: string,
  version: number
) {
  const now = new Date();
  return record(tx, {
    id: randomUUID(),
    kind: "SUPPORT_ATTACHMENT",
    target: "ASSET",
    targetId: assetId,
    sourceId,
    version,
    policy,
    outcome: "REDACTED",
    operatorId: actorId,
    recordedAt: now.toISOString(),
    startedAt: now.toISOString(),
    reviewDueAt: retentionDate(now, 90).toISOString(),
    endedAt: null
  });
}
export function recordFeedbackPromptControl(
  tx: Tx,
  userId: string,
  version: number,
  outcome: FeedbackPromptOutcome,
  now: Date
) {
  return record(tx, {
    id: randomUUID(),
    kind: "FEEDBACK_PROMPT",
    target: "ACCOUNT",
    targetId: userId,
    sourceId: userId,
    version,
    policy,
    outcome,
    operatorId: userId,
    recordedAt: now.toISOString(),
    startedAt: now.toISOString(),
    reviewDueAt: retentionDate(now, 90).toISOString(),
    endedAt: null
  });
}
export function recordFeedbackPrivacyControl(
  tx: Tx,
  kind:
    | "FEEDBACK_CHOICES"
    | "FEEDBACK_IDEA"
    | "FEEDBACK_SUBSCRIPTION"
    | "FEEDBACK_REVIEW",
  sourceId: string,
  actorId: string,
  version: number
) {
  const now = new Date();
  return record(tx, {
    id: randomUUID(),
    kind,
    target: "ACCOUNT",
    targetId: actorId,
    sourceId,
    version,
    policy,
    outcome: "QUARANTINED",
    operatorId: actorId,
    recordedAt: now.toISOString(),
    startedAt: now.toISOString(),
    reviewDueAt: retentionDate(now, 90).toISOString(),
    endedAt: null
  });
}
// Account recovery controls contain no login contact, report text or reason.
export function recordAccountRestrictionControl(
  tx: Tx,
  userId: string,
  version: number,
  suspended: boolean,
  operatorId: string,
  now: Date
) {
  return record(tx, {
    id: randomUUID(),
    kind: "ACCOUNT_STATE",
    target: "ACCOUNT",
    targetId: userId,
    sourceId: userId,
    version,
    policy,
    outcome: suspended ? "SUSPENDED" : "RESTORED",
    operatorId,
    recordedAt: now.toISOString(),
    startedAt: now.toISOString(),
    reviewDueAt: retentionDate(now, 90).toISOString(),
    endedAt: null
  });
}
// Only opaque topic/account references and a monotonic security version leave
// the database. An older backup must be quarantined, never guessed forward into
// newer ownership, membership restrictions or role consent.
export async function recordTopicAccessControl(
  tx: Tx,
  communityId: string,
  actorId: string
) {
  const row = await tx.topicCommunity.update({
    where: { id: communityId },
    data: { securityVersion: { increment: 1 } },
    select: { securityVersion: true }
  });
  const now = new Date();
  await record(tx, {
    id: randomUUID(),
    kind: "TOPIC_ACCESS",
    target: "ACCOUNT",
    targetId: actorId,
    sourceId: communityId,
    version: row.securityVersion,
    policy,
    outcome: "QUARANTINED",
    operatorId: actorId,
    recordedAt: now.toISOString(),
    startedAt: now.toISOString(),
    reviewDueAt: retentionDate(now, 90).toISOString(),
    endedAt: null
  });
}
export async function recordGroupAccessControl(
  tx: Tx,
  groupId: string,
  actorId: string
) {
  const row = await tx.gatherGroup.update({
    where: { id: groupId },
    data: { securityVersion: { increment: 1 } },
    select: { securityVersion: true }
  });
  const now = new Date();
  await record(tx, {
    id: randomUUID(),
    kind: "GROUP_ACCESS",
    target: "ACCOUNT",
    targetId: actorId,
    sourceId: groupId,
    version: row.securityVersion,
    policy,
    outcome: "QUARANTINED",
    operatorId: actorId,
    recordedAt: now.toISOString(),
    startedAt: now.toISOString(),
    reviewDueAt: retentionDate(now, 90).toISOString(),
    endedAt: null
  });
}
export async function recordDiscoveryControl(
  tx: Tx,
  kind:
    | "POST_DISCOVERY"
    | "EXCHANGE_VISIBILITY"
    | "EXCHANGE_FAVORITE"
    | "EXCHANGE_SAVED_SEARCH"
    | "EXCHANGE_NEED"
    | "VOLUNTEER_OPPORTUNITY"
    | "VOLUNTEER_APPLICATION"
    | "PANTRY_HUB"
    | "EXCHANGE_INQUIRY"
    | "EXCHANGE_CONTACT"
    | "EXCHANGE_DEFAULTS"
    | "DISCOVERY_PREFERENCES"
    | "CALENDAR_LAYER"
    | "FOLLOWING_LISTS"
    | "PROFILE_LOCATION"
    | "PROFILE_MODULES"
    | "NOTIFICATION_PREFERENCES"
    | "AUTHOR_BELL"
    | "PHOTO_TAG"
    | "PHOTO_TAG_PREFERENCES",
  actorId: string,
  sourceId: string,
  version: number
) {
  const now = new Date();
  await record(tx, {
    id: randomUUID(),
    kind,
    target: "ACCOUNT",
    targetId: actorId,
    sourceId,
    version,
    policy,
    outcome: "QUARANTINED",
    operatorId: actorId,
    recordedAt: now.toISOString(),
    startedAt: now.toISOString(),
    reviewDueAt: retentionDate(now, 90).toISOString(),
    endedAt: null
  });
}
export function recordHoldControl(
  tx: Tx,
  hold: RetentionHold,
  outcome: "PRESERVE" | "REVIEW" | "RELEASE"
) {
  return record(tx, {
    id: randomUUID(),
    kind: "HOLD",
    target: hold.target,
    targetId: hold.targetId,
    sourceId: hold.id,
    version: hold.version,
    policy,
    outcome,
    operatorId: hold.operatorId,
    recordedAt: new Date().toISOString(),
    startedAt: hold.createdAt.toISOString(),
    reviewDueAt: hold.reviewDueAt.toISOString(),
    endedAt: hold.releasedAt?.toISOString() ?? null
  });
}
// The separately protected journal contains only the selected source reference,
// resulting restriction and version. It never copies content or author reasons.
export function recordContentControl(
  tx: Tx,
  report: CommunityReport,
  decision: CommunityReportDecision
) {
  if (decision.fromVisibility === decision.toVisibility) return;
  return record(tx, {
    id: randomUUID(),
    kind:
      report.targetType === "EXCHANGE_LISTING"
        ? "MODERATION_EXCHANGE"
        : report.targetType === "POST"
          ? "MODERATION_POST"
          : report.targetType === "GROUP"
            ? "MODERATION_GROUP"
            : report.targetType === "TOPIC"
              ? "MODERATION_TOPIC"
              : "MODERATION_COMMENT",
    target: "REPORT",
    targetId: report.id,
    sourceId: report.targetId,
    version: decision.sourceVersion!,
    policy,
    outcome: decision.toVisibility!,
    operatorId: decision.actorId,
    recordedAt: decision.createdAt.toISOString(),
    startedAt: decision.createdAt.toISOString(),
    reviewDueAt: report.reviewDueAt.toISOString(),
    endedAt: null
  });
}
export async function recordAppealControl(
  tx: Tx,
  caseId: string,
  actorId: string
) {
  const row = await tx.supportCase.findUniqueOrThrow({
    where: { id: caseId },
    select: {
      id: true,
      version: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      moderationDecision: {
        select: { reportId: true, report: { select: { reviewDueAt: true } } }
      }
    }
  });
  if (!row.moderationDecision) return;
  return record(tx, {
    id: randomUUID(),
    kind: "APPEAL",
    target: "REPORT",
    targetId: row.moderationDecision.reportId,
    sourceId: row.id,
    version: row.version,
    policy,
    outcome: row.status,
    operatorId: actorId,
    recordedAt: row.updatedAt.toISOString(),
    startedAt: row.createdAt.toISOString(),
    reviewDueAt: row.moderationDecision.report.reviewDueAt.toISOString(),
    endedAt: ["RESOLVED", "CLOSED"].includes(row.status)
      ? row.updatedAt.toISOString()
      : null
  });
}
export async function selectedSourceReport(
  tx: Tx,
  type: "POST" | "COMMENT",
  id: string
) {
  return tx.communityReport.findFirst({
    where: { targetType: type, targetId: id },
    orderBy: { createdAt: "asc" },
    select: { id: true, targetType: true, targetId: true, reviewDueAt: true }
  });
}
export function recordReportedWithdrawal(
  tx: Tx,
  report: Pick<
    CommunityReport,
    "id" | "targetType" | "targetId" | "reviewDueAt"
  >,
  actorId: string,
  version: number,
  now: Date
) {
  return record(tx, {
    id: randomUUID(),
    kind:
      report.targetType === "POST"
        ? "AUTHOR_WITHDRAW_POST"
        : "AUTHOR_WITHDRAW_COMMENT",
    target: "REPORT",
    targetId: report.id,
    sourceId: report.targetId,
    version,
    policy,
    outcome: "WITHDRAWN",
    operatorId: actorId,
    recordedAt: now.toISOString(),
    startedAt: now.toISOString(),
    reviewDueAt: report.reviewDueAt.toISOString(),
    endedAt: null
  });
}
export function protectedRetentionControls(
  store: RetentionJournalStore<RetentionControlEntry> = privateRetentionStore(
    PREFIX
  )
) {
  const path = (id: string) => `${PREFIX}${id}.json`;
  async function read(key: string) {
    const raw = await store.read(key);
    if (raw === null) return null;
    const entry = validate(raw);
    if (key !== path(entry.id)) throw Error("Protected control key mismatch");
    return entry;
  }
  return {
    async record(entry: RetentionControlEntry) {
      validate(entry);
      const key = path(entry.id),
        old = await read(key);
      if (old) {
        if (!isDeepStrictEqual(old, entry))
          throw Error("Protected control decision changed");
        return;
      }
      try {
        await store.write(key, entry);
      } catch (error) {
        if (!isDeepStrictEqual(await read(key), entry)) throw error;
      }
    },
    async page(cursor?: string) {
      const page = await store.page(cursor),
        entries: RetentionControlEntry[] = [];
      for (const key of page.paths) {
        if (!key.startsWith(PREFIX))
          throw Error("Unexpected protected control path");
        const entry = await read(key);
        if (!entry)
          throw Error("Protected control disappeared during restoration");
        entries.push(entry);
      }
      return { entries, cursor: page.cursor };
    },
    async expire(entry: RetentionControlEntry, completedAt: Date, now: Date) {
      validate(entry);
      if (
        !Number.isFinite(completedAt.getTime()) ||
        !Number.isFinite(now.getTime())
      )
        throw Error("Valid purge completion and expiry times are required");
      if (retentionDate(completedAt, 90) > now) return false;
      await store.remove(path(entry.id));
      return true;
    }
  } satisfies RetentionControlJournal & Record<string, unknown>;
}
// Scoped publication is outside the permission transaction. The durable row
// remains pending on failure; the reviewer retries the same canonical command.
export async function journalRetentionControls(
  db: PrismaClient,
  journal: RetentionControlJournal,
  targetId?: string | string[],
  signal?: AbortSignal
) {
  const scope = targetId
    ? { targetId: Array.isArray(targetId) ? { in: targetId } : targetId }
    : {};
  const rows = await db.retentionControl.findMany({
    where: { journaledAt: null, ...scope },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: 100
  });
  let recorded = 0,
    failed = 0;
  for (let start = 0; start < rows.length && !signal?.aborted; start += 8) {
    const results = await Promise.allSettled(
      rows.slice(start, start + 8).map(async (row) => {
        await journal.record(validate(row.payload));
        await db.retentionControl.updateMany({
          where: { id: row.id, journaledAt: null },
          data: { journaledAt: new Date() }
        });
      })
    );
    for (const result of results) {
      if (result.status === "fulfilled") recorded++;
      else failed++;
    }
  }
  return {
    recorded,
    failed,
    pending: await db.retentionControl.count({
      where: { journaledAt: null, ...scope }
    })
  };
}
// Withdrawal already committed before this provider call. Do not turn a saved
// deletion into an apparent failed edit: maintenance retries durable pending
// controls, and the response explicitly distinguishes pending recovery protection.
export async function protectReportedWithdrawal(
  db: PrismaClient,
  type: "POST" | "COMMENT",
  sourceId: string,
  journal?: RetentionControlJournal
) {
  try {
    const entry = await db.retentionControl.findFirst({
      where: {
        kind:
          type === "POST" ? "AUTHOR_WITHDRAW_POST" : "AUTHOR_WITHDRAW_COMMENT",
        sourceId,
        journaledAt: null
      },
      select: { targetId: true }
    });
    if (!entry) return true;
    const result = await journalRetentionControls(
      db,
      journal ?? protectedRetentionControls(),
      entry.targetId
    );
    return !result.failed && !result.pending;
  } catch {
    return false;
  }
}
const RESTORED_REASON =
  "Protected preservation restored; the original case reason requires authorized review.";
// Replay before purge/account receipts. Newer source versions win regardless of
// object-store page order. Missing cases are a recovery discrepancy, never a
// reason to silently drop a hold or invent the lost report's free-form evidence.
export async function replayRetentionControls(
  db: PrismaClient,
  entries: RetentionControlEntry[]
) {
  if (entries.length > 100) throw Error("Replay bounded control pages");
  entries.forEach(validate);
  const missingReports = new Set<string>();
  await db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(730221, 2)`;
      for (const entry of entries) {
        if (
          [
            "FEEDBACK_CHOICES",
            "FEEDBACK_IDEA",
            "FEEDBACK_SUBSCRIPTION",
            "FEEDBACK_REVIEW"
          ].includes(entry.kind)
        ) {
          if (entry.kind === "FEEDBACK_REVIEW") {
            await tx.feedbackWeeklyReview.updateMany({
              where: {
                id: entry.sourceId,
                userId: entry.targetId,
                version: { lt: entry.version }
              },
              data: {
                learned: "",
                tryNext: "",
                checkNext: "",
                buildUrl: "",
                version: entry.version
              }
            });
          } else if (entry.kind === "FEEDBACK_CHOICES") {
            await tx.feedbackSubmission.updateMany({
              where: {
                caseId: entry.sourceId,
                case: { requesterId: entry.targetId },
                version: { lt: entry.version }
              },
              data: {
                contactAllowed: false,
                contactInApp: false,
                contactEmail: false,
                contactPush: false,
                contactInAppSince: null,
                contactEmailSince: null,
                contactPushSince: null,
                allowIdea: false,
                publicAttribution: false,
                version: entry.version,
                sharingVersion: { increment: 1 }
              }
            });
          } else if (entry.kind === "FEEDBACK_IDEA") {
            await tx.feedbackIdea.updateMany({
              where: { id: entry.sourceId, version: { lt: entry.version } },
              data: {
                withdrawnAt: new Date(entry.recordedAt),
                version: entry.version
              }
            });
          } else {
            await tx.feedbackIdeaSubscription.updateMany({
              where: {
                id: entry.sourceId,
                userId: entry.targetId,
                version: { lt: entry.version }
              },
              data: {
                inAppSince: null,
                emailSince: null,
                pushSince: null,
                version: entry.version
              }
            });
          }
          await record(tx, entry);
          await tx.retentionControl.updateMany({
            where: { id: entry.id, journaledAt: null },
            data: { journaledAt: new Date() }
          });
          continue;
        }
        if (entry.kind === "FEEDBACK_PROMPT") {
          if (
            await tx.platformUser.findFirst({
              where: { id: entry.targetId, erasedAt: null },
              select: { id: true }
            })
          )
            await mergeFeedbackSuppression(
              tx,
              entry.targetId,
              entry.outcome as FeedbackPromptOutcome,
              new Date(entry.recordedAt),
              entry.version
            );
          await record(tx, entry);
          await tx.retentionControl.updateMany({
            where: { id: entry.id, journaledAt: null },
            data: { journaledAt: new Date() }
          });
          continue;
        }
        if (entry.kind === "SUPPORT_ATTACHMENT") {
          await retireFeedbackImages(tx, {
            id: entry.targetId,
            ...(entry.sourceId === entry.targetId
              ? { feedbackCaseId: null }
              : { feedbackCaseId: entry.sourceId })
          });
          await record(tx, entry);
          await tx.retentionControl.updateMany({
            where: { id: entry.id, journaledAt: null },
            data: { journaledAt: new Date() }
          });
          continue;
        }
        if (entry.kind === "SUPPORT_MESSAGE") {
          const message = await tx.supportMessage.findFirst({
            where: { id: entry.targetId, caseId: entry.sourceId },
            select: { id: true, kind: true, version: true }
          });
          if (message) {
            await tx.supportMessage.update({
              where: { id: message.id },
              data: {
                body: "[Removed for privacy.]",
                redactedAt: new Date(entry.recordedAt)
              }
            });
            if (
              message.kind === "RESOLUTION" &&
              !(await tx.supportMessage.findFirst({
                where: {
                  caseId: entry.sourceId,
                  kind: "RESOLUTION",
                  version: { gt: message.version },
                  redactedAt: null
                },
                select: { id: true }
              }))
            )
              await tx.supportCase.updateMany({
                where: { id: entry.sourceId },
                data: { resolution: "[Removed for privacy.]" }
              });
          }
          await record(tx, entry);
          await tx.retentionControl.updateMany({
            where: { id: entry.id, journaledAt: null },
            data: { journaledAt: new Date() }
          });
          continue;
        }
        if (
          ["ADMIN_SUPPORT", "ADMIN_REPORT", "ADMIN_CLAIM"].includes(entry.kind)
        ) {
          if (
            entry.kind === "ADMIN_SUPPORT" &&
            entry.outcome === "CASE_REDACTED"
          ) {
            // Original requester text is immutable except for privacy removal.
            // A newer unrelated admin control may replay first, so its version
            // must never mask an earlier full-source redaction. Later replies
            // and later resolution text remain distinct from the removed source.
            const source = { id: entry.sourceId };
            const removedAt = new Date(entry.recordedAt);
            const marker = "[Removed for privacy.]";
            await retireFeedbackImages(tx, {
              feedbackCaseId: entry.sourceId,
              createdAt: { lte: removedAt }
            });
            await tx.feedbackSubmission.updateMany({
              where: { case: source, redactedAt: null },
              data: {
                ...emptyFeedback,
                redactedAt: removedAt,
                version: { increment: 1 },
                sharingVersion: { increment: 1 }
              }
            });
            await tx.supportMessage.updateMany({
              where: { case: source, createdAt: { lte: removedAt } },
              data: { body: marker, redactedAt: removedAt }
            });
            const laterResolution = await tx.supportMessage.findFirst({
              where: {
                caseId: entry.sourceId,
                kind: "RESOLUTION",
                redactedAt: null,
                createdAt: { gt: removedAt }
              },
              select: { id: true }
            });
            await tx.supportCase.updateMany({
              where: source,
              data: {
                subject: "Content removed for privacy",
                description: marker,
                ...(laterResolution ? {} : { resolution: null })
              }
            });
          }
          const table =
            entry.kind === "ADMIN_SUPPORT"
              ? Prisma.sql`"SupportCase"`
              : entry.kind === "ADMIN_REPORT"
                ? Prisma.sql`"CommunityReport"`
                : Prisma.sql`"ChurchClaim"`;
          const noteKey =
            entry.kind === "ADMIN_SUPPORT"
              ? Prisma.sql`"supportCaseId"`
              : entry.kind === "ADMIN_REPORT"
                ? Prisma.sql`"reportId"`
                : Prisma.sql`"claimId"`;
          // Clear older internal text. Do not advance the native version: a
          // missing appeal/review must still fail its independent recovery check.
          await tx.$executeRaw(
            Prisma.sql`UPDATE "AdminCaseGroup" SET title='[Removed for privacy.]',"engineeringUrl"='' WHERE id IN (SELECT "adminGroupId" FROM ${table} WHERE id=${entry.sourceId} AND "adminVersion"<${entry.version})`
          );
          await tx.$executeRaw(
            Prisma.sql`UPDATE "AdminCaseNote" SET body='[Removed for privacy.]',"redactedAt"=coalesce("redactedAt",${entry.recordedAt}::timestamp) WHERE ${noteKey} IN (SELECT id FROM ${table} WHERE id=${entry.sourceId} AND "adminVersion"<${entry.version})`
          );
          const extra =
            entry.kind === "ADMIN_SUPPORT"
              ? Prisma.sql`,"bugSteps"='',"bugExpected"='',"bugActual"='',"bugEnvironment"='',"reproducibility"='UNREVIEWED',"engineeringUrl"=''`
              : Prisma.sql`,"assignedReviewerId"=NULL,"assignedReviewerProof"=NULL`;
          await tx.$executeRaw(
            Prisma.sql`UPDATE ${table} SET "adminVersion"=${entry.version},"nextAction"='',"triageTags"=ARRAY[]::text[],"reminderAt"=NULL,"adminGroupId"=NULL ${extra} WHERE id=${entry.sourceId} AND "adminVersion"<${entry.version}`
          );
          await record(tx, entry);
          await tx.retentionControl.updateMany({
            where: { id: entry.id, journaledAt: null },
            data: { journaledAt: new Date() }
          });
          continue;
        }
        if (
          entry.kind === "PHOTO_TAG" ||
          entry.kind === "PHOTO_TAG_PREFERENCES"
        ) {
          if (entry.kind === "PHOTO_TAG") {
            await tx.photoTag.updateMany({
              where: { id: entry.sourceId, version: { lt: entry.version } },
              data: {
                state: "REMOVED",
                version: entry.version,
                decidedAt: new Date(entry.recordedAt)
              }
            });
          } else {
            const owner = await tx.platformUser.findFirst({
              where: { id: entry.sourceId, erasedAt: null },
              select: { id: true }
            });
            if (owner) {
              await tx.socialPreferences.upsert({
                where: { ownerId: owner.id },
                create: {
                  ownerId: owner.id,
                  photoTagRequests: "NOBODY",
                  photoTagVersion: entry.version,
                  photoTagRecoveryRequired: true
                },
                update: {}
              });
              await tx.socialPreferences.updateMany({
                where: {
                  ownerId: owner.id,
                  photoTagVersion: { lt: entry.version }
                },
                data: {
                  photoTagRequests: "NOBODY",
                  photoTagVersion: entry.version,
                  photoTagRecoveryRequired: true
                }
              });
            }
          }
          await record(tx, entry);
          await tx.retentionControl.updateMany({
            where: { id: entry.id, journaledAt: null },
            data: { journaledAt: new Date() }
          });
          continue;
        }
        if (
          entry.kind === "AUTHOR_BELL" ||
          entry.kind === "NOTIFICATION_PREFERENCES"
        ) {
          if (entry.kind === "AUTHOR_BELL") {
            await tx.socialRelationship.updateMany({
              where: {
                id: entry.sourceId,
                authorBellVersion: { lt: entry.version }
              },
              data: {
                authorBellSince: null,
                authorBellVersion: entry.version,
                version: { increment: 1 }
              }
            });
          } else {
            const owner = await tx.platformUser.findUnique({
              where: { id: entry.sourceId },
              select: { id: true, erasedAt: true }
            });
            if (owner && !owner.erasedAt) {
              await tx.socialPreferences.upsert({
                where: { ownerId: owner.id },
                create: {
                  ownerId: owner.id,
                  notificationVersion: entry.version,
                  notificationRecoveryRequired: true
                },
                update: {}
              });
              await tx.socialPreferences.updateMany({
                where: {
                  ownerId: owner.id,
                  notificationVersion: { lt: entry.version }
                },
                data: {
                  notificationVersion: entry.version,
                  notificationRecoveryRequired: true,
                  pushCategories: [],
                  notificationPushSince: Prisma.DbNull,
                  feedbackEmailSince: null,
                  notificationEmailSince: Prisma.DbNull,
                  conversationPushSince: null,
                  prayerPushSince: null,
                  version: { increment: 1 }
                }
              });
            }
          }
          await record(tx, entry);
          await tx.retentionControl.updateMany({
            where: { id: entry.id, journaledAt: null },
            data: { journaledAt: new Date() }
          });
          continue;
        }
        if (entry.kind === "FOLLOWING_LISTS") {
          const owner = await tx.platformUser.findUnique({
            where: { id: entry.sourceId },
            select: { id: true, erasedAt: true }
          });
          if (owner && !owner.erasedAt) {
            await tx.socialPreferences.upsert({
              where: { ownerId: owner.id },
              create: {
                ownerId: owner.id,
                followingListsVersion: entry.version,
                followingListsRecoveryRequired: true
              },
              update: {}
            });
            await tx.socialPreferences.updateMany({
              where: {
                ownerId: owner.id,
                followingListsVersion: { lt: entry.version }
              },
              data: {
                followingLists: Prisma.DbNull,
                followingListsVersion: entry.version,
                followingListsRecoveryRequired: true
              }
            });
          }
          await record(tx, entry);
          await tx.retentionControl.updateMany({
            where: { id: entry.id, journaledAt: null },
            data: { journaledAt: new Date() }
          });
          continue;
        }
        if (entry.kind === "PROFILE_MODULES") {
          // A newer optional-section edit or removal is opaque in the journal.
          // Clear stale restored content rather than republishing an older value.
          const owner = await tx.platformUser.findFirst({
            where: { id: entry.sourceId, erasedAt: null },
            select: { id: true }
          });
          if (owner) {
            await tx.profilePresentation.upsert({
              where: { userId: owner.id },
              create: {
                userId: owner.id,
                modules: {},
                modulesVersion: entry.version,
                version: entry.version + 1
              },
              update: {}
            });
            await tx.$executeRaw`UPDATE "ProfilePresentation" SET modules='{}'::jsonb,
              "modulesVersion"=${entry.version}, version=GREATEST(version+1, ${entry.version + 1})
              WHERE "userId"=${owner.id} AND "modulesVersion" < ${entry.version}`;
          }
          await record(tx, entry);
          await tx.retentionControl.updateMany({
            where: { id: entry.id, journaledAt: null },
            data: { journaledAt: new Date() }
          });
          continue;
        }
        if (entry.kind === "CALENDAR_LAYER") {
          const owner = await tx.platformUser.findFirst({
            where: { id: entry.targetId, erasedAt: null },
            select: { id: true }
          });
          const calendar = await tx.platformCalendar.findUnique({
            where: { id: entry.sourceId },
            select: { id: true }
          });
          if (owner && calendar) {
            // A newer opaque receipt cannot reconstruct private choices. Keep
            // the layer off until its owner explicitly reviews it; never reopen
            // a hidden/unfollowed overlay from an older backup or a missing row.
            const data = {
              followed: false,
              visible: false,
              color: "DEFAULT",
              recoveryRequired: true,
              requestKey: null,
              version: entry.version
            };
            await tx.calendarLayerPreference.upsert({
              where: {
                ownerId_calendarId: {
                  ownerId: owner.id,
                  calendarId: calendar.id
                }
              },
              create: { ownerId: owner.id, calendarId: calendar.id, ...data },
              update: {}
            });
            await tx.calendarLayerPreference.updateMany({
              where: {
                ownerId: owner.id,
                calendarId: calendar.id,
                version: { lt: entry.version }
              },
              data
            });
          }
          await record(tx, entry);
          await tx.retentionControl.updateMany({
            where: { id: entry.id, journaledAt: null },
            data: { journaledAt: new Date() }
          });
          continue;
        }
        if (entry.kind === "PROFILE_LOCATION") {
          const changed = await tx.platformUser.updateMany({
            where: {
              id: entry.sourceId,
              erasedAt: null,
              locationVersion: { lt: entry.version }
            },
            data: {
              location: null,
              locationAudience: "ONLY_ME",
              locationRecoveryRequired: true,
              locationVersion: entry.version
            }
          });
          if (changed.count)
            await tx.profilePresentation.upsert({
              where: { userId: entry.sourceId },
              create: { userId: entry.sourceId, version: 1 },
              update: { version: { increment: 1 } }
            });
          await record(tx, entry);
          await tx.retentionControl.updateMany({
            where: { id: entry.id, journaledAt: null },
            data: { journaledAt: new Date() }
          });
          continue;
        }
        if (
          entry.kind === "POST_DISCOVERY" ||
          entry.kind === "DISCOVERY_PREFERENCES"
        ) {
          if (entry.kind === "POST_DISCOVERY") {
            // A newer author's classification cannot be reconstructed from an
            // opaque receipt. Clear the older public classification before traffic.
            await tx.$executeRaw`UPDATE "PlatformPost" SET
              "discoveryLanguage"=NULL, "discoveryDenomination"=NULL,
              "discoveryCountry"=NULL, "discoveryPlaceId"=NULL,
              "discoveryRegion"=NULL, "discoveryLatitude"=NULL,
              "discoveryLongitude"=NULL, "discoveryVersion"=${entry.version}, version=version+1
              WHERE id=${entry.sourceId} AND "discoveryVersion" < ${entry.version}`;
          } else {
            // Missing newer private filters must not silently reopen a wider feed.
            const owner = await tx.platformUser.findUnique({
              where: { id: entry.sourceId },
              select: { id: true, erasedAt: true }
            });
            if (owner && !owner.erasedAt) {
              await tx.socialPreferences.upsert({
                where: { ownerId: owner.id },
                create: {
                  ownerId: owner.id,
                  discoveryVersion: entry.version,
                  discoveryRecoveryRequired: true
                },
                update: {}
              });
              await tx.socialPreferences.updateMany({
                where: {
                  ownerId: owner.id,
                  discoveryVersion: { lt: entry.version }
                },
                data: {
                  discovery: Prisma.DbNull,
                  discoveryVersion: entry.version,
                  discoveryRecoveryRequired: true
                }
              });
            }
          }
          await record(tx, entry);
          await tx.retentionControl.updateMany({
            where: { id: entry.id, journaledAt: null },
            data: { journaledAt: new Date() }
          });
          continue;
        }
        if (entry.kind === "PANTRY_HUB") {
          const prior = await tx.pantryHub.findUnique({
            where: { id: entry.sourceId }
          });
          const data = {
            version: entry.version,
            recoveryRequired: true,
            published: false,
            intakeEnabled: false,
            coordinatorKey: null
          };
          if (!prior)
            await tx.pantryHub.create({
              data: { id: entry.sourceId, ...data }
            });
          else if (prior.version < entry.version) {
            await tx.pantryHub.update({ where: { id: prior.id }, data });
            await tx.pantryRequest.updateMany({
              where: { hubId: prior.id },
              data: {
                authorityKey: null,
                note: "",
                pickupContact: "",
                coordinatorNote: ""
              }
            });
          }
          await record(tx, entry);
          await tx.retentionControl.updateMany({
            where: { id: entry.id, journaledAt: null },
            data: { journaledAt: new Date() }
          });
          continue;
        }
        if (entry.kind === "VOLUNTEER_OPPORTUNITY") {
          const prior = await tx.volunteerOpportunity.findUnique({
            where: { id: entry.sourceId }
          });
          if (!prior) {
            await tx.volunteerOpportunity.create({
              data: {
                id: entry.sourceId,
                version: entry.version,
                recoveryRequired: true,
                closedAt: new Date(entry.recordedAt)
              }
            });
          } else if (prior.version < entry.version) {
            await tx.volunteerOpportunity.update({
              where: { id: prior.id },
              data: {
                version: entry.version,
                recoveryRequired: true,
                closedAt: new Date(entry.recordedAt)
              }
            });
            if (prior.slotId)
              await tx.postVolunteerSlot.update({
                where: { id: prior.slotId },
                data: {
                  closedAt: new Date(entry.recordedAt),
                  version: { increment: 1 }
                }
              });
          }
          await record(tx, entry);
          await tx.retentionControl.updateMany({
            where: { id: entry.id, journaledAt: null },
            data: { journaledAt: new Date() }
          });
          continue;
        }
        if (entry.kind === "VOLUNTEER_APPLICATION") {
          const prior = await tx.volunteerApplication.findUnique({
            where: { id: entry.sourceId }
          });
          const data = {
            version: entry.version,
            recoveryRequired: true,
            state: "WITHDRAWN" as const,
            statement: "",
            decisionNote: ""
          };
          if (!prior)
            await tx.volunteerApplication.create({
              data: { id: entry.sourceId, ...data }
            });
          else if (prior.version < entry.version) {
            await tx.volunteerApplication.update({
              where: { id: prior.id },
              data
            });
            await tx.volunteerApplicationEvent.updateMany({
              where: { applicationId: prior.id },
              data: { note: "" }
            });
            if (prior.signupId)
              await tx.postVolunteerSignup.updateMany({
                where: {
                  id: prior.signupId,
                  completedAt: null,
                  state: "ACTIVE"
                },
                data: { state: "CANCELED", version: { increment: 1 } }
              });
          }
          await record(tx, entry);
          await tx.retentionControl.updateMany({
            where: { id: entry.id, journaledAt: null },
            data: { journaledAt: new Date() }
          });
          continue;
        }
        if (entry.kind === "EXCHANGE_NEED") {
          const prior = await tx.exchangeNeed.findUnique({
            where: { id: entry.sourceId }
          });
          const data = {
            version: entry.version,
            recoveryRequired: true,
            coordinatorKey: null,
            closedAt: new Date(entry.recordedAt),
            closeReason: "Protected recovery requires review."
          };
          if (!prior)
            await tx.exchangeNeed.create({
              data: { id: entry.sourceId, ...data }
            });
          else if (prior.version < entry.version) {
            await tx.exchangeNeed.update({ where: { id: prior.id }, data });
            if (prior.listingId)
              await tx.exchangeListing.updateMany({
                where: { id: prior.listingId, erasedAt: null },
                data: {
                  state: "DRAFT",
                  recoveryRequired: true,
                  version: { increment: 1 }
                }
              });
          }
          await record(tx, entry);
          await tx.retentionControl.updateMany({
            where: { id: entry.id, journaledAt: null },
            data: { journaledAt: new Date() }
          });
          continue;
        }
        if (
          entry.kind === "EXCHANGE_INQUIRY" ||
          entry.kind === "EXCHANGE_CONTACT" ||
          entry.kind === "EXCHANGE_DEFAULTS"
        ) {
          const at = new Date(entry.recordedAt);
          if (entry.kind === "EXCHANGE_INQUIRY") {
            const prior = await tx.exchangeInquiry.findUnique({
              where: { id: entry.sourceId }
            });
            const data = {
              version: entry.version,
              state: "REVOKED" as const,
              recoveryRequired: true,
              purpose: "",
              pickupDetails: "",
              cancelNote: "",
              endedAt: at,
              wakeAt: null,
              dispatchedAt: null,
              dispatchClaimedAt: null
            };
            // A missing row becomes a body-free tombstone. Never reconstruct
            // the pair or its original pickup plan from an opaque receipt.
            if (!prior)
              await tx.exchangeInquiry.create({
                data: { id: entry.sourceId, ...data, expiresAt: at }
              });
            else if (prior.version < entry.version) {
              await tx.exchangeInquiry.update({
                where: { id: prior.id },
                data
              });
              if (prior.listingId)
                await tx.exchangeListing.updateMany({
                  where: { id: prior.listingId, erasedAt: null },
                  data: {
                    state: "DRAFT",
                    inquiriesEnabled: false,
                    recoveryRequired: true,
                    version: { increment: 1 }
                  }
                });
            }
          } else if (entry.kind === "EXCHANGE_CONTACT") {
            await tx.exchangeListing.updateMany({
              where: {
                id: entry.sourceId,
                inquiryContactVersion: { lt: entry.version }
              },
              data: {
                inquiriesEnabled: false,
                inquiryContactVersion: entry.version,
                inquiryReceiverId: null,
                inquiryAuthorityKey: null,
                state: "DRAFT",
                recoveryRequired: true,
                version: { increment: 1 }
              }
            });
            // Every inquiry will also receive its own newer quarantine receipt.
            // The source switch itself is sufficient to conceal old plan reads.
          } else {
            const owner = await tx.platformUser.findFirst({
              where: { id: entry.targetId, erasedAt: null },
              select: { id: true }
            });
            if (owner) {
              const data = {
                version: entry.version,
                pickupDetails: "",
                recoveryRequired: true
              };
              await tx.exchangeDefaults.upsert({
                where: { ownerId: owner.id },
                create: { ownerId: owner.id, ...data },
                update: {}
              });
              await tx.exchangeDefaults.updateMany({
                where: { ownerId: owner.id, version: { lt: entry.version } },
                data: {
                  ...data,
                  intent: "FREE",
                  audience: "PUBLIC",
                  audienceChurchId: null,
                  country: null,
                  placeId: null
                }
              });
            }
          }
          await record(tx, entry);
          await tx.retentionControl.updateMany({
            where: { id: entry.id, journaledAt: null },
            data: { journaledAt: new Date() }
          });
          continue;
        }
        if (
          entry.kind === "EXCHANGE_FAVORITE" ||
          entry.kind === "EXCHANGE_SAVED_SEARCH"
        ) {
          const owner = await tx.platformUser.findFirst({
            where: { id: entry.targetId, erasedAt: null },
            select: { id: true }
          });
          if (owner) {
            const deletedAt = new Date(entry.recordedAt);
            if (entry.kind === "EXCHANGE_FAVORITE") {
              await tx.exchangeFavorite.upsert({
                where: { id: entry.sourceId },
                create: {
                  id: entry.sourceId,
                  ownerId: owner.id,
                  version: entry.version,
                  deletedAt
                },
                update: {}
              });
              await tx.exchangeFavorite.updateMany({
                where: {
                  id: entry.sourceId,
                  ownerId: owner.id,
                  version: { lt: entry.version }
                },
                data: { deletedAt, version: entry.version }
              });
            } else {
              const data = {
                name: "",
                criteria: {},
                alertsSince: null,
                deletedAt,
                recoveryRequired: true,
                version: entry.version
              };
              await tx.exchangeSavedSearch.upsert({
                where: { id: entry.sourceId },
                create: { id: entry.sourceId, ownerId: owner.id, ...data },
                update: {}
              });
              await tx.exchangeSavedSearch.updateMany({
                where: {
                  id: entry.sourceId,
                  ownerId: owner.id,
                  version: { lt: entry.version }
                },
                data
              });
            }
          }
          await record(tx, entry);
          await tx.retentionControl.updateMany({
            where: { id: entry.id, journaledAt: null },
            data: { journaledAt: new Date() }
          });
          continue;
        }
        if (entry.kind === "EXCHANGE_VISIBILITY") {
          // Privacy versions are independent of moderation and image versions.
          // A newer opaque listing receipt cannot reconstruct the intended
          // audience, so restore privately until its owner reviews and publishes.
          await tx.exchangeListing.updateMany({
            where: {
              id: entry.sourceId,
              visibilityVersion: { lt: entry.version },
              erasedAt: null
            },
            data: {
              state: "DRAFT",
              recoveryRequired: true,
              visibilityVersion: entry.version,
              version: { increment: 1 }
            }
          });
          await record(tx, entry);
          await tx.retentionControl.updateMany({
            where: { id: entry.id, journaledAt: null },
            data: { journaledAt: new Date() }
          });
          continue;
        }
        if (entry.kind === "GROUP_ACCESS") {
          const changed = await tx.gatherGroup.updateMany({
            where: {
              id: entry.sourceId,
              securityVersion: { lt: entry.version }
            },
            data: {
              recoveryRequired: true,
              ownerAuthorityKey: null,
              securityVersion: entry.version,
              version: { increment: 1 }
            }
          });
          if (changed.count)
            await tx.gatherGroupMembership.updateMany({
              where: { groupId: entry.sourceId },
              data: {
                pendingRole: null,
                offeredById: null,
                offerExpiresAt: null,
                offerGroupVersion: null,
                leaderAuthorityKey: null,
                version: { increment: 1 }
              }
            });
          // Quarantine prevents every old invite/read/role from authorizing an
          // action. No membership or successor is guessed from opaque history.
          await record(tx, entry);
          await tx.retentionControl.updateMany({
            where: { id: entry.id, journaledAt: null },
            data: { journaledAt: new Date() }
          });
          continue;
        }
        if (entry.kind === "TOPIC_ACCESS") {
          await tx.$executeRaw`UPDATE "TopicCommunity" SET "recoveryRequired"=true,
            "securityVersion"=${entry.version} WHERE id=${entry.sourceId} AND "securityVersion" < ${entry.version}`;
          await record(tx, entry);
          await tx.retentionControl.updateMany({
            where: { id: entry.id, journaledAt: null },
            data: { journaledAt: new Date() }
          });
          continue;
        }
        if (entry.kind === "ACCOUNT_STATE") {
          // A newer restoration cannot authorize an older backup's account
          // credentials/assignments. Keep it suspended for current reinspection.
          // Equal-version state already preserved in the backup is left intact.
          await tx.$executeRaw`UPDATE "PlatformUser" SET
            "suspendedAt"=coalesce("suspendedAt",${entry.recordedAt}::timestamp),
            "portalVersion"=greatest("portalVersion",${entry.version})
            WHERE id=${entry.sourceId} AND
              ("portalVersion" < ${entry.version} OR
                ("portalVersion"=${entry.version} AND ${entry.outcome === "SUSPENDED"}))`;
          await record(tx, entry);
          await tx.retentionControl.updateMany({
            where: { id: entry.id, journaledAt: null },
            data: { journaledAt: new Date() }
          });
          continue;
        }
        if (
          entry.kind === "AUTHOR_WITHDRAW_POST" ||
          entry.kind === "AUTHOR_WITHDRAW_COMMENT"
        ) {
          // Source withdrawal has no reversal operation. Preserve it even when
          // a later moderation version is replayed first, without republishing.
          if (entry.kind === "AUTHOR_WITHDRAW_POST")
            await tx.$executeRaw`UPDATE "PlatformPost" SET status='WITHDRAWN', "withdrawnAt"=coalesce("withdrawnAt",${entry.recordedAt}::timestamp), "discussionClosed"=true,
              "discoveryLanguage"=NULL, "discoveryDenomination"=NULL, "discoveryCountry"=NULL, "discoveryPlaceId"=NULL,
              "discoveryRegion"=NULL, "discoveryLatitude"=NULL, "discoveryLongitude"=NULL,
              version=greatest(version,${entry.version}) WHERE id=${entry.sourceId}`;
          else
            await tx.$executeRaw`UPDATE "PlatformPostComment" SET "deletedAt"=coalesce("deletedAt",${entry.recordedAt}::timestamp), version=greatest(version,${entry.version}) WHERE id=${entry.sourceId}`;
          await record(tx, entry);
          await tx.retentionControl.updateMany({
            where: { id: entry.id, journaledAt: null },
            data: { journaledAt: new Date() }
          });
          continue;
        }
        if (entry.kind === "APPEAL") {
          // This records the latest version that must exist. An older case or
          // missing reply cannot be fabricated from a content-free journal.
          await record(tx, entry);
          await tx.retentionControl.updateMany({
            where: { id: entry.id, journaledAt: null },
            data: { journaledAt: new Date() }
          });
          continue;
        }
        if (entry.kind === "MODERATION_EXCHANGE") {
          const visibility =
            entry.outcome === "VISIBLE"
              ? "HIDDEN"
              : (entry.outcome as "HIDDEN" | "REMOVED");
          await tx.$executeRaw`UPDATE "ExchangeListing" SET
            "moderationState"=${visibility}::"ContentModerationState",
            "moderationVersion"=${entry.version}, version=greatest(version,${entry.version})
            WHERE id=${entry.sourceId} AND ("moderationVersion" < ${entry.version}
              OR ("moderationVersion"=${entry.version} AND ${entry.outcome !== "VISIBLE"}))`;
          await record(tx, entry);
          await tx.retentionControl.updateMany({
            where: { id: entry.id, journaledAt: null },
            data: { journaledAt: new Date() }
          });
          continue;
        }
        if (
          entry.kind === "MODERATION_POST" ||
          entry.kind === "MODERATION_COMMENT" ||
          entry.kind === "MODERATION_TOPIC" ||
          entry.kind === "MODERATION_GROUP"
        ) {
          // An old backup cannot prove the text, audience and attachments that
          // were approved when a restriction was lifted. Keep that source hidden
          // for explicit reinspection; never reconstruct or republish old text.
          const visibility =
            entry.outcome === "VISIBLE"
              ? "HIDDEN"
              : (entry.outcome as "HIDDEN" | "REMOVED");
          const table =
            entry.kind === "MODERATION_POST"
              ? Prisma.sql`"PlatformPost"`
              : entry.kind === "MODERATION_GROUP"
                ? Prisma.sql`"GatherGroup"`
                : entry.kind === "MODERATION_TOPIC"
                  ? Prisma.sql`"TopicCommunity"`
                  : Prisma.sql`"PlatformPostComment"`;
          await tx.$executeRaw(Prisma.sql`UPDATE ${table} SET "moderationState"=${visibility}::"ContentModerationState", version=${entry.version}
            WHERE id=${entry.sourceId} AND (version < ${entry.version} OR (version=${entry.version} AND ${entry.outcome !== "VISIBLE"}))`);
          await record(tx, entry);
          await tx.retentionControl.updateMany({
            where: { id: entry.id, journaledAt: null },
            data: { journaledAt: new Date() }
          });
          continue;
        }
        const sealed = await tx.retentionPurge.findUnique({
          where: {
            target_targetId: { target: entry.target, targetId: entry.targetId }
          }
        });
        if (sealed) continue;
        if (entry.kind === "REPORT") {
          const report = await tx.communityReport.findUnique({
            where: { id: entry.targetId }
          });
          if (!report) {
            missingReports.add(entry.targetId);
            continue;
          }
          if (report.version < entry.version)
            await tx.communityReport.update({
              where: { id: report.id },
              data: {
                status: entry.outcome as CommunityReport["status"],
                version: entry.version,
                closedAt: entry.endedAt ? new Date(entry.endedAt) : null,
                reviewDueAt: new Date(entry.reviewDueAt)
              }
            });
        } else {
          const targetExists =
            entry.target === "REPORT"
              ? await tx.communityReport.count({
                  where: { id: entry.targetId }
                })
              : entry.target === "EXCHANGE_INQUIRY"
                ? await tx.exchangeInquiry.count({
                    where: { id: entry.targetId }
                  })
                : await tx.adultMessage.count({
                    where: { id: entry.targetId }
                  });
          if (!targetExists) {
            if (entry.target === "REPORT") missingReports.add(entry.targetId);
            continue;
          }
          const hold = await tx.retentionHold.findUnique({
            where: { id: entry.sourceId }
          });
          if (!hold || hold.version < entry.version) {
            const data = {
              target: entry.target,
              targetId: entry.targetId,
              version: entry.version,
              operatorId: entry.operatorId ?? "restoration",
              reviewDueAt: new Date(entry.reviewDueAt),
              releasedAt: entry.endedAt ? new Date(entry.endedAt) : null
            };
            await tx.retentionHold.upsert({
              where: { id: entry.sourceId },
              create: {
                id: entry.sourceId,
                ...data,
                reason: RESTORED_REASON,
                createdAt: new Date(entry.startedAt)
              },
              update: data
            });
            await tx.retentionHoldEvent.upsert({
              where: { id: entry.id },
              create: {
                id: entry.id,
                holdId: entry.sourceId,
                operatorId: data.operatorId,
                action: entry.outcome,
                version: entry.version,
                createdAt: new Date(entry.recordedAt),
                reason: RESTORED_REASON
              },
              update: {}
            });
          }
        }
        await record(tx, entry);
        await tx.retentionControl.updateMany({
          where: { id: entry.id, journaledAt: null },
          data: { journaledAt: new Date() }
        });
      }
    },
    { maxWait: 10000, timeout: 30000 }
  );
  return { missingReports: [...missingReports] };
}
export async function inspectRestoredHolds(db: PrismaClient) {
  return db.retentionHold.count({
    where: { reason: RESTORED_REASON, releasedAt: null }
  });
}
export async function inspectRestoredModeration(db: PrismaClient) {
  const [row] = await db.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
    WITH latest AS (SELECT DISTINCT ON (kind, "sourceId") kind, "sourceId", version, payload FROM "RetentionControl" WHERE kind IN ('MODERATION_POST','MODERATION_COMMENT','MODERATION_TOPIC','MODERATION_GROUP','MODERATION_EXCHANGE') ORDER BY kind, "sourceId", version DESC)
    SELECT count(*)::bigint AS count FROM latest r
    LEFT JOIN "PlatformPost" p ON r.kind='MODERATION_POST' AND p.id=r."sourceId"
    LEFT JOIN "PlatformPostComment" c ON r.kind='MODERATION_COMMENT' AND c.id=r."sourceId"
    LEFT JOIN "TopicCommunity" t ON r.kind='MODERATION_TOPIC' AND t.id=r."sourceId"
    LEFT JOIN "GatherGroup" g ON r.kind='MODERATION_GROUP' AND g.id=r."sourceId"
    LEFT JOIN "ExchangeListing" e ON r.kind='MODERATION_EXCHANGE' AND e.id=r."sourceId"
    WHERE r.payload->>'outcome'='VISIBLE' AND
      (p.version <= r.version AND p."moderationState" <> 'VISIBLE' OR c.version <= r.version AND c."moderationState" <> 'VISIBLE'
       OR t.version <= r.version AND t."moderationState" <> 'VISIBLE'
       OR g.version <= r.version AND g."moderationState" <> 'VISIBLE'
       OR e."moderationVersion" <= r.version AND e."moderationState" <> 'VISIBLE')`);
  return Number(row.count);
}
export async function inspectRestoredAppeals(db: PrismaClient) {
  const [row] = await db.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
    WITH latest AS (SELECT DISTINCT ON ("sourceId") "sourceId", "targetId", version FROM "RetentionControl" WHERE kind='APPEAL' ORDER BY "sourceId", version DESC)
    SELECT count(*)::bigint AS count FROM latest r LEFT JOIN "SupportCase" s ON s.id=r."sourceId"
    WHERE (s.id IS NULL OR s.version < r.version) AND NOT EXISTS (SELECT 1 FROM "RetentionPurge" purge WHERE purge.target='REPORT' AND purge."targetId"=r."targetId")`);
  return Number(row.count);
}

export async function inspectRestoredAccountRestrictions(db: PrismaClient) {
  const [row] = await db.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
    WITH latest AS (SELECT DISTINCT ON ("sourceId") "sourceId", version, payload, "journaledAt"
      FROM "RetentionControl" WHERE kind='ACCOUNT_STATE' ORDER BY "sourceId", version DESC)
    SELECT count(*)::bigint AS count FROM latest r
    LEFT JOIN "PlatformUser" u ON u.id=r."sourceId"
    WHERE r."journaledAt" IS NULL OR
      (u.id IS NULL AND NOT EXISTS (SELECT 1 FROM "AccountDeletion" d WHERE d."userId"=r."sourceId" AND d."completedAt" IS NOT NULL)) OR
      (u.id IS NOT NULL AND (
        (r.payload->>'outcome'='SUSPENDED' AND u."suspendedAt" IS NULL) OR
        (r.payload->>'outcome'='RESTORED' AND u."suspendedAt" IS NOT NULL AND u."portalVersion"<=r.version)))`);
  return Number(row.count);
}
