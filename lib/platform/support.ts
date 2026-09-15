import { createHmac } from "node:crypto";
import { accountConfig } from "./account-config";
import {
  Prisma,
  type PrismaClient,
  type SupportCategory,
  type SupportStatus
} from "@prisma/client";
import { readAccountSession } from "./accounts";
import { ADULT_POLICY } from "./portal-types";
import { reconcileSupportAccess } from "./support-revocation";
import { PortalError } from "./portal-policy";
import { recordAppealControl, recordAdminPrivacyControl } from "./retention-controls";
import { emptyAdminText, emptyAdminBug, redactAdminCaseNotes } from "./admin-privacy";
import { postContext } from "./post-access";
import {
  FEEDBACK_NOTICE,
  feedbackCreateFields,
  feedbackChoiceFields,
  parseFeedback,
  parseFeedbackChoices,
  emptyFeedback
} from "./feedback-policy";
import { reportReviewAuthority } from "./community-report-review";
import { reportReviewHref } from "./community-report-types";
import {
  activeContentReviewer,
  contentSupportAccess,
  prepareContentAppeal,
  updateAppealReport,
  visibleSupportIds
} from "./moderation-support";
import {
  SUPPORT_NOTICE,
  supportCategories,
  supportStatuses,
  featureDecisions,
  type SupportSnapshot,
  type SupportView
} from "./support-types";

export class SupportError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
type Tx = Prisma.TransactionClient;
const person = { id: true, name: true } as const;
const actorSelect = {
  ...person,
  username: true,
  adultAcknowledgedAt: true,
  adultPolicyVersion: true,
  emailVerifiedAt: true,
  suspendedAt: true,
  deactivatedAt: true
} as const;
type Actor = Prisma.PlatformUserGetPayload<{ select: typeof actorSelect }>;
const eligible = {
  suspendedAt: null,
  deactivatedAt: null,
  emailVerifiedAt: { not: null },
  adultAcknowledgedAt: { not: null },
  adultPolicyVersion: ADULT_POLICY
} as const;
const grantSelect = {
  id: true,
  version: true,
  userId: true,
  user: { select: person }
} as const;
type Grant = Prisma.SupportCapabilityGrantGetPayload<{
  select: typeof grantSelect;
}>;
const metadataSelect = {
  id: true,
  requesterId: true,
  churchId: true,
  ownerGrantId: true,
  ownerGrantVersion: true,
  status: true,
  version: true,
  category: true,
  moderationDecisionId: true
} as const;
type CaseMeta = Prisma.SupportCaseGetPayload<{ select: typeof metadataSelect }>;
const unavailable =
  "Private request intake is not available yet. No request has been stored. Please use the direct contact option.";
const denied = () =>
  new SupportError(404, "This request is not available to this account.");
const adult = (a: Actor) =>
  !a.suspendedAt &&
  !a.deactivatedAt &&
  !!a.adultAcknowledgedAt &&
  a.adultPolicyVersion === ADULT_POLICY;
const verified = (a: Actor) => adult(a) && !!a.emailVerifiedAt;
function text(v: unknown, max: number, min = 1) {
  if (
    typeof v !== "string" ||
    v.trim().length < min ||
    v.length > max ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v)
  )
    throw new SupportError(
      400,
      "Check the required fields and their length. Use ordinary text only."
    );
  return v.trim();
}
function identifier(v: unknown) {
  return text(v, 100);
}
function expected(v: unknown, actual: number) {
  if (!Number.isSafeInteger(v) || v !== actual)
    throw new SupportError(
      409,
      "This request changed. Refresh before trying again."
    );
}
function pageNumber(v: unknown) {
  if (v == null || v === "") return 0;
  const n = typeof v === "string" && /^\d{1,2}$/.test(v) ? Number(v) : v;
  if (!Number.isInteger(n) || (n as number) < 0 || (n as number) > 99)
    throw new SupportError(400, "Choose a valid page.");
  return n as number;
}
async function audit(
  tx: Tx,
  c: CaseMeta,
  actor: Actor,
  action: string,
  toState?: string,
  targetId?: string
) {
  await tx.supportAuditEvent.create({
    data: {
      caseId: c.id,
      actorId: actor.id,
      action,
      version: c.version + 1,
      fromState: c.status,
      toState,
      targetId
    }
  });
}
async function support<T>(
  db: PrismaClient,
  token: unknown,
  work: (tx: Tx, actor: Actor) => Promise<T>
): Promise<T> {
  return db
    .$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(730221, 2)`;
        const session = await readAccountSession(tx as PrismaClient, token);
        if (!session)
          throw new SupportError(
            401,
            "Sign in to get help with your own requests."
          );
        await tx.$queryRaw`SELECT id FROM "PlatformUser" WHERE id=${session.id} FOR UPDATE`;
        if (!(await readAccountSession(tx as PrismaClient, token)))
          throw new SupportError(401, "Sign in again to continue.");
        const actor = await tx.platformUser.findUniqueOrThrow({
          where: { id: session.id },
          select: actorSelect
        });
        await reconcileSupportAccess(tx);
        return work(tx, actor);
      },
      { maxWait: 10000, timeout: 15000 }
    )
    .catch((error) => {
      if (error instanceof PortalError)
        throw new SupportError(error.status, error.message);
      throw error;
    });
}
async function staffGrant(
  tx: Tx,
  actor: Actor,
  capability: "RESPOND" | "ASSIGN" | "REDACT"
) {
  return verified(actor)
    ? tx.supportCapabilityGrant.findFirst({
        where: { userId: actor.id, capability, revokedAt: null },
        select: grantSelect
      })
    : null;
}
async function recipient(tx: Tx, grantId: unknown): Promise<Grant | null> {
  if (typeof grantId !== "string") return null;
  return tx.supportCapabilityGrant.findFirst({
    where: {
      id: grantId,
      capability: "RESPOND",
      revokedAt: null,
      user: eligible
    },
    select: grantSelect
  });
}
async function ownerChoices(tx: Tx, excludeIds: string[] = []) {
  const grants = await tx.supportCapabilityGrant.findMany({
    where: {
      capability: "RESPOND",
      revokedAt: null,
      user: eligible,
      ...(excludeIds.length ? { userId: { notIn: excludeIds } } : {})
    },
    select: grantSelect,
    orderBy: { id: "asc" },
    take: 20
  });
  return grants.map((g) => ({
    id: g.id,
    version: g.version,
    name: g.user.name
  }));
}
async function context(tx: Tx, actor: Actor, churchId: string | null) {
  if (!churchId) return null;
  if (!verified(actor)) throw denied();
  const c = await tx.churchConnection.findFirst({
    where: {
      userId: actor.id,
      churchId,
      state: { in: ["APPROVED", "PENDING"] }
    },
    select: { id: true, state: true }
  });
  if (!c) throw denied();
  return c;
}
async function intake(tx: Tx, actor: Actor, churchId: string | null) {
  const membership = await context(tx, actor, churchId);
  const config =
    process.env.SUPPORT_INTAKE_ENABLED === "true"
      ? await tx.supportIntakeSetting.findUnique({ where: { id: "default" } })
      : null;
  if (!config?.enabled || config.approvedNoticeVersion !== SUPPORT_NOTICE)
    return null;
  const defaultOwner = await recipient(tx, config.ownerGrantId);
  if (!defaultOwner) return null;
  // A private contact may be a hint only for an already approved member, never pending intake.
  if (membership?.state === "APPROVED" && churchId) {
    const hint = await tx.churchContactAssignment.findFirst({
      where: {
        churchId,
        slot: "RELATIONSHIP_OWNER",
        revokedAt: null,
        user: eligible
      },
      select: { userId: true }
    });
    if (hint && hint.userId !== actor.id) {
      const grant = await tx.supportCapabilityGrant.findFirst({
        where: {
          userId: hint.userId,
          capability: "RESPOND",
          revokedAt: null,
          user: eligible
        },
        select: grantSelect
      });
      if (grant) return grant;
    }
  }
  return defaultOwner.userId !== actor.id ? defaultOwner : null;
}
async function access(tx: Tx, actor: Actor, c: CaseMeta) {
  if (!adult(actor)) throw denied();
  if (c.moderationDecisionId) {
    if (!verified(actor)) throw denied();
    return contentSupportAccess(tx, actor.id, {
      requesterId: c.requesterId,
      moderationDecisionId: c.moderationDecisionId
    });
  }
  const requester = c.requesterId === actor.id;
  const grant = await staffGrant(tx, actor, "RESPOND");
  const owner =
    !!grant &&
    c.ownerGrantId === grant.id &&
    c.ownerGrantVersion === grant.version;
  const share = await tx.supportCoordinatorShare.findFirst({
    where: { caseId: c.id, revokedAt: null, appointment: { userId: actor.id } },
    select: { caseId: true }
  });
  const coordinator = verified(actor) && !!share;
  return {
    requester,
    owner,
    coordinator,
    redact: owner && !!(await staffGrant(tx, actor, "REDACT"))
  };
}
async function visibleWhere(
  tx: Tx,
  actor: Actor,
  onlyAssigned = false,
  options: { id?: string; page?: number; feedbackOnly?: boolean } = {}
): Promise<Prisma.SupportCaseWhereInput> {
  const grant = await staffGrant(tx, actor, "RESPOND");
  const rows = await visibleSupportIds(
    tx,
    { id: actor.id, eligible: verified(actor), adult: adult(actor) },
    grant,
    { ...options, assigned: onlyAssigned }
  );
  return { id: { in: rows.map((row) => row.id) } };
}
async function shareOptions(tx: Tx, actor: Actor, c: CaseMeta) {
  if (
    c.moderationDecisionId ||
    !verified(actor) ||
    actor.id !== c.requesterId ||
    !c.churchId
  )
    return [];
  const own = await tx.churchConnection.findFirst({
    where: { userId: actor.id, churchId: c.churchId, state: "APPROVED" },
    select: { id: true }
  });
  if (!own) return [];
  const options = await tx.churchContactAssignment.findMany({
    where: {
      churchId: c.churchId,
      slot: { in: ["PRIMARY", "BACKUP"] },
      revokedAt: null,
      userId: { not: actor.id },
      user: eligible,
      connection: { state: "APPROVED", churchId: c.churchId }
    },
    select: {
      id: true,
      version: true,
      slot: true,
      userId: true,
      user: { select: person },
      connection: { select: { userId: true } }
    },
    take: 2
  });
  return options
    .filter((a) => a.connection?.userId === a.userId)
    .map((a) => ({
      id: a.id,
      version: a.version,
      name: a.user.name,
      slot: a.slot
    }));
}

export async function readSupport(
  db: PrismaClient,
  token: unknown,
  view: SupportView,
  input: { caseId?: string; churchId?: string; page?: unknown; feedbackOnly?: boolean } = {}
): Promise<SupportSnapshot> {
  return support(db, token, async (tx, actor) => {
    const page = pageNumber(input.page);
    const respond = await staffGrant(tx, actor, "RESPOND");
    const assign = await staffGrant(tx, actor, "ASSIGN");
    const reportAuthority = await reportReviewAuthority(
      tx,
      await postContext(tx, verified(actor) ? actor.id : null)
    );
    const reportReviewer =
      reportAuthority.global || !!reportAuthority.churches.length || !!reportAuthority.topics.length;
    const recipientGrant =
      view === "new" && adult(actor)
        ? await intake(
            tx,
            actor,
            input.churchId ? identifier(input.churchId) : null
          )
        : null;
    const result: SupportSnapshot = {
      viewer: {
        id: actor.id,
        name: actor.name,
        username: actor.username,
        adult: adult(actor),
        verified: verified(actor)
      },
      staff: { respond: !!respond || reportReviewer, assign: !!assign },
      intake: {
        available: !!recipientGrant && (!input.feedbackOnly || process.env.FEEDBACK_INTAKE_ENABLED === "true"),
        recipient: recipientGrant
          ? {
              id: recipientGrant.id,
              version: recipientGrant.version,
              name: recipientGrant.user.name
            }
          : null,
        notice: input.feedbackOnly ? FEEDBACK_NOTICE : SUPPORT_NOTICE
      },
      churches: [],
      rows: [],
      more: false,
      page,
      detail: null,
      routing: [],
      ownerOptions: []
    };
    if (view === "new") {
      if (verified(actor))
        result.churches = (
          await tx.churchConnection.findMany({
            where: { userId: actor.id, state: { in: ["PENDING", "APPROVED"] } },
            select: {
              state: true,
              church: { select: { id: true, name: true } }
            },
            take: 1
          })
        ).map((c) => ({ ...c.church, state: c.state }));
      return result;
    }
    if (view === "routing") {
      if (!assign) throw denied();
      const rows = await tx.supportCase.findMany({
        where: {
          ownerGrantId: null,
          moderationDecisionId: null,
          status: { notIn: ["RESOLVED", "CLOSED"] }
        },
        select: {
          id: true,
          category: true,
          status: true,
          createdAt: true,
          version: true,
          churchId: true
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        skip: page * 20,
        take: 21
      });
      result.routing = rows
        .slice(0, 20)
        .map((c) => ({ ...c, createdAt: c.createdAt.toISOString() }));
      result.more = rows.length > 20;
      result.ownerOptions = await ownerChoices(tx);
      return result;
    }
    if (view === "requests" || view === "inbox") {
      if (view === "inbox" && !respond && !reportReviewer) throw denied();
      const rows = await tx.supportCase.findMany({
        where: await visibleWhere(tx, actor, view === "inbox", { page, feedbackOnly: input.feedbackOnly }),
        select: {
          id: true,
          subject: true,
          category: true,
          status: true,
          version: true,
          updatedAt: true,
          createdAt: true,
          ownerGrantId: true,
          moderationDecisionId: true,
          reads: { where: { userId: actor.id }, select: { version: true } }
        },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        take: 21
      });
      result.more = rows.length > 20;
      result.rows = rows
        .slice(0, 20)
        .map(({ ownerGrantId, moderationDecisionId, reads, ...c }) => ({
          ...c,
          createdAt: c.createdAt.toISOString(),
          updatedAt: c.updatedAt.toISOString(),
          unread: (reads[0]?.version ?? 0) < c.version,
          unassigned: !ownerGrantId && !moderationDecisionId
        }));
      return result;
    }
    if (view !== "detail" || !input.caseId) throw denied();
    // Filter authorization in the query, before selecting even the subject or message bodies.
    const c = await tx.supportCase.findFirst({
      where: {
        AND: [
          { id: identifier(input.caseId) },
          await visibleWhere(tx, actor, false, { id: input.caseId, feedbackOnly: input.feedbackOnly })
        ]
      },
      select: {
        ...metadataSelect,
        subject: true,
        description: true,
        createdAt: true,
        updatedAt: true,
        resolution: true,
        featureDecision: true,
        feedback: {
          select: {
            kind: true, rating: true, entryPoint: true, version: true,
            sharingVersion: true, contactAllowed: true, contactInApp: true,
            contactEmail: true, contactPush: true, allowIdea: true,
            publicAttribution: true, contextRelease: true, contextDevice: true,
            contextBrowser: true, contextErrorRef: true, redactedAt: true
          }
        },
        requester: { select: person },
        church: { select: { id: true, name: true } },
        ownerGrant: { select: { user: { select: person } } },
        moderationDecision: { select: { actorId: true, reportId: true } },
        coordinatorShare: {
          where: { revokedAt: null },
          select: { appointment: { select: { user: { select: person } } } }
        },
        messages: {
          select: {
            id: true,
            kind: true,
            body: true,
            createdAt: true,
            redactedAt: true,
            author: { select: { name: true } }
          },
          orderBy: [{ version: "desc" }, { id: "desc" }],
          skip: page * 20,
          take: 21
        },
        reads: { where: { userId: actor.id }, select: { version: true } }
      }
    });
    if (!c) throw denied();
    const rights = await access(tx, actor, c);
    const appealOwner = c.moderationDecision
      ? await activeContentReviewer(tx, c.moderationDecision)
      : null;
    result.detail = {
      id: c.id,
      subject: c.subject,
      description: c.description,
      category: c.category,
      status: c.status,
      version: c.version,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
      unassigned: c.moderationDecisionId ? !appealOwner : !c.ownerGrantId,
      unread: (c.reads[0]?.version ?? 0) < c.version,
      resolution: c.resolution,
      featureDecision: c.featureDecision,
      feedback: c.feedback ? {
        ...c.feedback,
        redactedAt: c.feedback.redactedAt?.toISOString() ?? null
      } : null,
      church: c.church,
      requester: c.requester,
      owner: appealOwner ?? c.ownerGrant?.user ?? null,
      reconsideration: !!c.moderationDecisionId,
      ...(rights.owner && c.moderationDecision
        ? {
            reviewHref: reportReviewHref(c.moderationDecision.reportId)
          }
        : {}),
      coordinator: c.coordinatorShare?.appointment.user ?? null,
      access: rights,
      messages: c.messages
        .slice(0, 20)
        .reverse()
        .map((m) => ({
          id: m.id,
          author: m.author.name,
          kind: m.kind,
          body: m.body,
          createdAt: m.createdAt.toISOString(),
          redacted: !!m.redactedAt
        })),
      moreMessages: c.messages.length > 20,
      messagePage: page,
      shareOptions: rights.requester ? await shareOptions(tx, actor, c) : [],
      ownerOptions:
        rights.owner && !c.moderationDecisionId
          ? await ownerChoices(tx, [c.requesterId, actor.id])
          : []
    };
    return result;
  });
}

const operationFields: Record<string, string[]> = {
  "feedback-create": feedbackCreateFields,
  "feedback-choices": [...feedbackChoiceFields, "feedbackVersion"],
  appeal: [
    "decisionId",
    "decisionVersion",
    "reportVersion",
    "description",
    "notice",
    "consent"
  ],
  create: [
    "category",
    "churchId",
    "subject",
    "description",
    "recipientId",
    "recipientVersion",
    "notice",
    "consent"
  ],
  reply: ["body"],
  transition: ["status", "reason"],
  reopen: ["reason"],
  share: ["appointmentId", "appointmentVersion", "agreeHistory"],
  revoke: [],
  handoff: ["ownerGrantId", "ownerGrantVersion"],
  feature: ["decision", "reason"],
  redact: ["messageId", "reason"],
  "mark-read": []
};
export async function supportCommand(
  db: PrismaClient,
  token: unknown,
  input: Record<string, unknown>
) {
  return support(db, token, async (tx, actor) => {
    if (!adult(actor))
      throw new SupportError(
        403,
        "Confirm adult eligibility in My church before using private requests."
      );
    const op = input.operation;
    if (typeof op !== "string" || !Object.hasOwn(operationFields, op))
      throw new SupportError(400, "Choose a supported request action.");
    const allowed = [
      "operation",
      "requestKey",
      "caseId",
      "expectedVersion",
      ...operationFields[op]
    ];
    if (Object.keys(input).some((k) => !allowed.includes(k)))
      throw new SupportError(400, "Use the supported request fields.");
    const requestKey = text(input.requestKey, 36);
    if (
      !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
        requestKey
      )
    )
      throw new SupportError(400, "Refresh the form before trying again.");
    const fingerprint = createHmac(
      "sha256",
      accountConfig().rateSecret + ":support-retry"
    )
      .update(
        JSON.stringify(
          Object.fromEntries(
            Object.entries(input).sort(([a], [b]) => a.localeCompare(b))
          )
        )
      )
      .digest("hex");
    const prior = await tx.supportOperation.findUnique({
      where: { actorId_requestKey: { actorId: actor.id, requestKey } },
      select: { fingerprint: true, caseId: true, version: true }
    });
    if (prior) {
      if (prior.fingerprint !== fingerprint)
        throw new SupportError(
          409,
          "That retry belongs to different information. Refresh the form."
        );
      const visible = await tx.supportCase.findFirst({
        where: {
          AND: [
            { id: prior.caseId },
            await visibleWhere(tx, actor, false, { id: prior.caseId })
          ]
        },
        select: { id: true }
      });
      // Routing-only receipts may be acknowledged without returning case content or further rights.
      if (
        !visible &&
        !(op === "handoff" && (await staffGrant(tx, actor, "ASSIGN")))
      )
        throw denied();
      return {
        caseId: prior.caseId,
        version: prior.version,
        message: "This action was already saved."
      };
    }
    const since = new Date(Date.now() - 86400000);
    if (
      op !== "mark-read" &&
      (await tx.supportAuditEvent.count({
        where: { actorId: actor.id, createdAt: { gte: since } }
      })) >= 100
    )
      throw new SupportError(
        429,
        "You have reached today's request update limit. Please try tomorrow."
      );
    if (op === "create" || op === "appeal" || op === "feedback-create") {
      if (input.caseId != null || input.expectedVersion != null)
        throw new SupportError(400, "Use the new request form.");
      let createData: Prisma.SupportCaseUncheckedCreateInput;
      let feedback: ReturnType<typeof parseFeedback> | undefined;
      if (op === "appeal") {
        createData = await prepareContentAppeal(tx, actor.id, input);
      } else {
        if (op === "feedback-create") {
          if (process.env.FEEDBACK_INTAKE_ENABLED !== "true")
            throw new SupportError(503, "Feedback intake is unavailable. Nothing has been submitted.");
          feedback = parseFeedback(input);
        }
        const category = feedback
          ? feedback.metadata.kind === "SUGGESTION" ? "FEATURE_SUGGESTION" : "ACCOUNT_WEBSITE"
          : text(input.category, 30) as SupportCategory;
        if (!Object.hasOwn(supportCategories, category))
          throw new SupportError(400, "Choose an ordinary help category.");
        if (category !== "ACCOUNT_WEBSITE" && !verified(actor))
          throw new SupportError(
            403,
            "Until your email is verified, choose Account or website problem for help with your own account."
          );
        const churchId = input.churchId ? identifier(input.churchId) : null;
        const target = await intake(tx, actor, churchId);
        if (!target) throw new SupportError(503, unavailable);
        if (
          target.id !== input.recipientId ||
          target.version !== input.recipientVersion
        )
          throw new SupportError(
            409,
            "The support recipient changed. Refresh to review who will receive your request."
          );
        if (input.notice !== (feedback ? FEEDBACK_NOTICE : SUPPORT_NOTICE) || input.consent !== true)
          throw new SupportError(
            400,
            "Read and confirm who can see this request before sending it."
          );
        createData = {
          requesterId: actor.id,
          churchId,
          category,
          subject: feedback?.subject ?? text(input.subject, 120, 3),
          description: feedback?.description ?? text(input.description, 3000, 10),
          ...(feedback ? {
            bugActual: feedback.bugActual,
            bugExpected: feedback.bugExpected,
            bugSteps: feedback.bugSteps
          } : {}),
          ownerGrantId: target.id,
          ownerGrantVersion: target.version,
          featureDecision: category === "FEATURE_SUGGESTION" ? "RECEIVED" : null
        };
      }
      if (
        (await tx.supportCase.count({
          where: { requesterId: actor.id, createdAt: { gte: since } }
        })) >= 5
      )
        throw new SupportError(
          429,
          "You have reached today's limit of five new requests. You can still follow up on existing requests."
        );
      const c = await tx.supportCase.create({
        data: createData,
        select: metadataSelect
      });
      if (feedback)
        await tx.feedbackSubmission.create({
          data: { caseId: c.id, ...feedback.metadata }
        });
      await tx.supportAuditEvent.create({
        data: {
          caseId: c.id,
          actorId: actor.id,
          action: "CREATED",
          version: 1,
          toState: "RECEIVED"
        }
      });
      await tx.supportOperation.create({
        data: {
          actorId: actor.id,
          requestKey,
          fingerprint,
          caseId: c.id,
          version: 1
        }
      });
      await tx.supportRead.create({
        data: { caseId: c.id, userId: actor.id, version: 1 }
      });
      if (c.moderationDecisionId)
        await updateAppealReport(tx, c.moderationDecisionId, actor.id, true);
      if (c.moderationDecisionId) await recordAppealControl(tx, c.id, actor.id);
      return {
        caseId: c.id,
        version: 1,
        message: c.moderationDecisionId
          ? "Reconsideration requested. Your explanation is saved in the help case for the assigned report reviewer."
          : feedback ? "Feedback received. Your private receipt is saved here; no email or push was sent."
          : "Request received. Your request is saved here; no email was sent."
      };
    }
    const c = await tx.supportCase.findUnique({
      where: { id: identifier(input.caseId) },
      select: metadataSelect
    });
    if (!c) throw denied();
    const rights = await access(tx, actor, c);
    const routingOnly =
      op === "handoff" &&
      !c.moderationDecisionId &&
      !c.ownerGrantId &&
      !!(await staffGrant(tx, actor, "ASSIGN"));
    if (
      !rights.requester &&
      !rights.owner &&
      !rights.coordinator &&
      !routingOnly
    )
      throw denied();
    if (
      c.moderationDecisionId &&
      ["share", "revoke", "handoff", "redact", "feature"].includes(op)
    )
      throw denied();
    expected(input.expectedVersion, c.version);
    const open = !["RESOLVED", "CLOSED"].includes(c.status);
    const data: Prisma.SupportCaseUncheckedUpdateInput = {
      version: { increment: 1 }
    };
    let body: string | null = null;
    let kind = op.toUpperCase();
    let targetId: string | undefined;
    if (op === "mark-read") {
      await tx.supportRead.upsert({
        where: { caseId_userId: { caseId: c.id, userId: actor.id } },
        create: { caseId: c.id, userId: actor.id, version: c.version },
        update: { version: c.version }
      });
      return {
        caseId: c.id,
        version: c.version,
        message: "Marked as seen for your account."
      };
    } else if (op === "feedback-choices") {
      if (!rights.requester) throw denied();
      const feedback = await tx.feedbackSubmission.findUnique({ where: { caseId: c.id } });
      if (!feedback || feedback.redactedAt) throw denied();
      expected(input.feedbackVersion, feedback.version);
      const choices = parseFeedbackChoices(input, feedback.kind);
      const sharingChanged = choices.allowIdea !== feedback.allowIdea ||
        choices.publicAttribution !== feedback.publicAttribution;
      await tx.feedbackSubmission.update({
        where: { caseId: c.id },
        data: {
          ...choices,
          version: { increment: 1 },
          ...(sharingChanged ? { sharingVersion: { increment: 1 } } : {})
        }
      });
    } else if (op === "reply") {
      if (!open)
        throw new SupportError(
          409,
          "Reopen this request before adding a reply."
        );
      if (!rights.requester) {
        const feedback = await tx.feedbackSubmission.findUnique({
          where: { caseId: c.id }, select: { contactAllowed: true }
        });
        if (feedback && !feedback.contactAllowed)
          throw new SupportError(403, "This requester has not allowed feedback follow-up. You may update the case status without sending a question.");
      }
      body = text(input.body, 2000, 1);
      if (rights.requester && c.status === "WAITING_FOR_REQUESTER")
        data.status =
          c.ownerGrantId || c.moderationDecisionId ? "IN_PROGRESS" : "RECEIVED";
    } else if (op === "transition") {
      if (!rights.owner && !rights.requester) throw denied();
      const target = text(input.status, 30) as SupportStatus;
      if (!Object.hasOwn(supportStatuses, target))
        throw new SupportError(400, "Choose an available status.");
      const ownerAllowed = open
        ? ["IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CLOSED"]
        : c.status === "RESOLVED"
          ? ["CLOSED"]
          : [];
      const requesterAllowed = open
        ? ["RESOLVED", "CLOSED"]
        : c.status === "RESOLVED"
          ? ["CLOSED"]
          : [];
      if (
        !(rights.owner ? ownerAllowed : requesterAllowed).includes(target) ||
        target === c.status
      )
        throw new SupportError(
          409,
          "That status change is not available. Refresh the request."
        );
      body = text(input.reason, 1000, 3);
      data.status = target;
      if (target === "RESOLVED") {
        data.resolution = body;
        kind = "RESOLUTION";
      }
    } else if (op === "reopen") {
      if (!rights.requester && !rights.owner) throw denied();
      if (open) throw new SupportError(409, "This request is already open.");
      body = text(input.reason, 1000, 3);
      if (c.moderationDecisionId) {
        const d = await tx.communityReportDecision.findUniqueOrThrow({
          where: { id: c.moderationDecisionId },
          select: { actorId: true, reportId: true }
        });
        if (!(await activeContentReviewer(tx, d)))
          throw new SupportError(
            503,
            "The assigned report reviewer is not currently authorized. This request cannot be reopened for delivery yet."
          );
      }
      data.status = "RECEIVED";
      data.resolution = null;
      // A changed intake default never silently receives an existing conversation.
      // Unassigned history needs a separate, explicit authorized handoff.
    } else if (op === "share") {
      if (!rights.requester || !open) throw denied();
      if (input.agreeHistory !== true)
        throw new SupportError(
          400,
          "Confirm that this person can read the existing history and future replies."
        );
      const option = (await shareOptions(tx, actor, c)).find(
        (a) =>
          a.id === input.appointmentId && a.version === input.appointmentVersion
      );
      if (!option) throw denied();
      const own = await tx.churchConnection.findFirstOrThrow({
        where: { userId: actor.id, churchId: c.churchId!, state: "APPROVED" },
        select: { id: true }
      });
      const share = {
        appointmentId: option.id,
        appointmentVersion: option.version,
        requesterConnectionId: own.id,
        revokedAt: null,
        createdAt: new Date()
      };
      await tx.supportCoordinatorShare.upsert({
        where: { caseId: c.id },
        create: { caseId: c.id, ...share },
        update: share
      });
      targetId = option.id;
    } else if (op === "revoke") {
      if (!rights.requester) throw denied();
      await tx.supportCoordinatorShare.updateMany({
        where: { caseId: c.id, revokedAt: null },
        data: { revokedAt: new Date() }
      });
    } else if (op === "handoff") {
      if (!rights.owner && !routingOnly) throw denied();
      const target = await recipient(tx, input.ownerGrantId);
      if (
        !target ||
        target.userId === c.requesterId ||
        target.version !== input.ownerGrantVersion ||
        target.id === c.ownerGrantId
      )
        throw new SupportError(
          409,
          "Choose a different, currently authorized support owner."
        );
      data.ownerGrantId = target.id;
      data.ownerGrantVersion = target.version;
      targetId = target.id;
    } else if (op === "feature") {
      if (!rights.owner || c.category !== "FEATURE_SUGGESTION") throw denied();
      const decision = text(
        input.decision,
        30
      ) as keyof typeof featureDecisions;
      if (!Object.hasOwn(featureDecisions, decision))
        throw new SupportError(400, "Choose a supported suggestion decision.");
      body = `${featureDecisions[decision]}: ${text(input.reason, 1000, 3)}`;
      data.featureDecision = decision;
    } else if (op === "redact") {
      if (!rights.redact) throw denied();
      if (input.reason !== "SECRET" && input.reason !== "PRIVATE_INFORMATION")
        throw new SupportError(400, "Choose the structured privacy reason.");
      const marker = "[Removed for privacy.]";
      if (input.messageId) {
        const m = await tx.supportMessage.findFirst({
          where: { id: identifier(input.messageId), caseId: c.id },
          select: { id: true, kind: true }
        });
        if (!m) throw denied();
        await tx.supportMessage.update({
          where: { id: m.id },
          data: { body: marker, redactedAt: new Date() }
        });
        if (m.kind === "RESOLUTION") data.resolution = marker;
        targetId = m.id;
      } else {
        data.subject = "Content removed for privacy";
        data.description = marker;
        data.resolution = null;
        await tx.feedbackSubmission.updateMany({
          where: { caseId: c.id, redactedAt: null },
          data: { ...emptyFeedback, redactedAt: new Date(), version: { increment: 1 }, sharingVersion: { increment: 1 } }
        });
        Object.assign(data,emptyAdminText,emptyAdminBug,{adminVersion:{increment:1}});
        const admin=await tx.supportCase.findUniqueOrThrow({where:{id:c.id},select:{adminGroupId:true}});
        if(admin.adminGroupId) await tx.adminCaseGroup.update({where:{id:admin.adminGroupId},data:{title:marker,engineeringUrl:""}});
        await redactAdminCaseNotes(tx,{supportCaseId:c.id});
        await tx.supportMessage.updateMany({
          where: { caseId: c.id },
          data: { body: marker, redactedAt: new Date() }
        });
      }
      kind = `REDACT_${input.reason}`;
    } else throw new SupportError(400, "Choose a supported request action.");
    const next = await tx.supportCase.update({
      where: { id: c.id },
      data,
      select: { id: true, version: true, ownerGrantId: true,adminVersion:true }
    });
    if(op==="redact"&&!input.messageId) await recordAdminPrivacyControl(tx,{sourceType:"SUPPORT",sourceId:c.id},actor.id,next.adminVersion,true);
    if (body)
      await tx.supportMessage.create({
        data: {
          caseId: c.id,
          authorId: actor.id,
          body,
          kind,
          version: next.version
        }
      });
    if (
      c.moderationDecisionId &&
      (op === "reopen" ||
        (op === "reply" && rights.requester && !rights.owner) ||
        (op === "transition" &&
          rights.owner &&
          ["RESOLVED", "CLOSED"].includes(String(data.status))))
    ) {
      await updateAppealReport(
        tx,
        c.moderationDecisionId,
        actor.id,
        op !== "transition",
        body ?? undefined
      );
    }
    await audit(
      tx,
      c,
      actor,
      kind,
      typeof data.status === "string" ? data.status : undefined,
      targetId
    );
    await tx.supportOperation.create({
      data: {
        actorId: actor.id,
        requestKey,
        fingerprint,
        caseId: c.id,
        version: next.version
      }
    });
    if (c.moderationDecisionId) await recordAppealControl(tx, c.id, actor.id);
    return {
      caseId: c.id,
      version: next.version,
      message: c.moderationDecisionId
        ? "Help case updated. Its current reviewer is shown when you open the case."
        : next.ownerGrantId
          ? "Request updated. Changes are saved here; no email was sent."
          : "Request updated. It is awaiting assignment; no active support owner is assigned."
    };
  });
}
