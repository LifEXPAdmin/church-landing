import { recordFanout } from "./domain-activity";
import { feedbackFollowupEnabled } from "./feedback-followup-policy";
import { Prisma, type PrismaClient } from "@prisma/client";
import {
  withAdmin,
  requireAdminCapability,
  type AdminAuthority
} from "./admin-authority";
import {
  requireAdminCase,
  adminPriorOperation,
  recordAdminOperation
} from "./admin-cases";
import { socialInput } from "./social-operations";
import { expected, PortalError } from "./portal-policy";
import { postField, postId } from "./post-input";
import { releaseEntry, releases } from "./release-content";
import { feedbackIdeaStates } from "./feedback-idea-types";
import {
  ideaFamilies,
  requirePublicIdea,
  publicIdeaRows,
  publicIdeaRoot,
  ideaUnavailable
} from "./feedback-idea-access";
import { recordFeedbackPrivacyControl } from "./retention-controls";
type Tx = Prisma.TransactionClient;
async function sourceIn(tx: Tx, authority: AdminAuthority, caseId: string) {
  await requireAdminCase(tx, authority, {
    sourceType: "SUPPORT",
    sourceId: caseId
  });
  const feedback = await tx.feedbackSubmission.findUnique({
    where: { caseId },
    include: {
      case: { select: { version: true, subject: true, description: true } },
      idea: true
    }
  });
  if (!feedback || feedback.kind !== "SUGGESTION" || feedback.redactedAt)
    throw ideaUnavailable();
  return feedback;
}
async function administrativeRoot(
  tx: Tx,
  authority: AdminAuthority,
  id: string
) {
  const visited = new Set<string>();
  for (;;) {
    if (visited.has(id) || visited.size > 4) throw ideaUnavailable();
    visited.add(id);
    const row = await tx.feedbackIdea.findUnique({
      where: { id },
      select: {
        id: true,
        version: true,
        title: true,
        withdrawnAt: true,
        sourceCaseId: true,
        mergedIntoId: true
      }
    });
    if (!row) throw ideaUnavailable();
    if (!row.mergedIntoId) {
      await sourceIn(tx, authority, row.sourceCaseId);
      return row;
    }
    id = row.mergedIntoId;
  }
}
export function readFeedbackIdeaAdministration(
  db: PrismaClient,
  token: unknown,
  input: { caseId?: unknown; ideaId?: unknown; q?: unknown }
) {
  return withAdmin(db, token, async (tx, authority) => {
    const grant = requireAdminCapability(authority, "MANAGE_PRODUCT_FEEDBACK");
    const idea =
      input.ideaId == null
        ? null
        : await tx.feedbackIdea.findUnique({
            where: { id: postId(input.ideaId) }
          });
    const caseId =
      idea?.sourceCaseId ??
      (input.caseId == null ? null : postId(input.caseId));
    if (!caseId) throw ideaUnavailable();
    const source = await sourceIn(tx, authority, caseId);
    const query = postField(input.q ?? "", 80),
      literal = "%" + query.replace(/[\\%_]/g, "\\$&") + "%";
    const candidates = await publicIdeaRows(
      tx,
      Prisma.sql`i."mergedIntoId" IS NULL AND i."sourceCaseId"<>${caseId} AND (${query}='' OR i.title ILIKE ${literal})`,
      21
    );
    const destination = source.idea?.mergedIntoId
      ? await administrativeRoot(tx, authority, source.idea.mergedIntoId).catch(
          (error) => {
            if (error instanceof PortalError && error.status === 404)
              return null;
            throw error;
          }
        )
      : null;
    return {
      ideaReview: true as const,
      navigation: authority.navigation,
      grantVersion: grant.version,
      available: process.env.FEEDBACK_IDEAS_ENABLED === "true",
      source: {
        caseId,
        version: source.case.version,
        feedbackVersion: source.version,
        sharingVersion: source.sharingVersion,
        subject: source.case.subject,
        description: source.case.description,
        allowIdea: source.allowIdea,
        publicAttribution: source.publicAttribution
      },
      query,
      destinations: candidates
        .slice(0, 20)
        .map((i) => ({ id: i.id, version: i.version, title: i.title })),
      moreDestinations: candidates.length > 20,
      destination: destination
        ? {
            id: destination.id,
            version: destination.version,
            title: destination.title
          }
        : null,
      idea: source.idea
        ? {
            id: source.idea.id,
            version: source.idea.version,
            title: source.idea.title,
            summary: source.idea.summary,
            status: source.idea.status,
            explanation: source.idea.explanation,
            releaseId: source.idea.releaseId,
            published: !!source.idea.publishedAt && !source.idea.withdrawnAt,
            mergedIntoId: source.idea.mergedIntoId
          }
        : null,
      releases: releases
        .filter((r) => r.date <= new Date().toISOString().slice(0, 10))
        .map((r) => ({ id: r.id, version: r.version, summary: r.summary }))
    };
  });
}
export type FeedbackIdeaAdministration = Awaited<
  ReturnType<typeof readFeedbackIdeaAdministration>
>;
/** Retraction uses a public projection; this grant never opens a private case. */
export function readFeedbackIdeaModeration(
  db: PrismaClient,
  token: unknown,
  input: { ideaId?: unknown; q?: unknown; page?: unknown }
) {
  return withAdmin(db, token, async (tx, authority) => {
    const grant = requireAdminCapability(authority, "MANAGE_PRODUCT_FEEDBACK");
    if (process.env.FEEDBACK_IDEAS_ENABLED !== "true") throw ideaUnavailable();
    const query = postField(input.q ?? "", 80),
      page = input.page == null ? 0 : Number(input.page);
    if (!Number.isInteger(page) || page < 0 || page > 99)
      throw new PortalError(400, "Choose a supported idea page.");
    const literal = "%" + query.replace(/[\\%_]/g, "\\$&") + "%";
    const rows =
      input.ideaId != null
        ? [await requirePublicIdea(tx, postId(input.ideaId))]
        : await publicIdeaRows(
            tx,
            Prisma.sql`(${query}='' OR i.title ILIKE ${literal})`,
            21,
            page * 20
          );
    return {
      ideaModeration: true as const,
      navigation: authority.navigation,
      grantVersion: grant.version,
      query,
      page,
      more: rows.length > 20,
      detail: input.ideaId != null,
      ideas: rows
        .slice(0, 20)
        .map(({ id, version, title, summary, status, explanation }) => ({
          id,
          version,
          title,
          summary,
          status,
          explanation
        }))
    };
  });
}
export type FeedbackIdeaModeration = Awaited<
  ReturnType<typeof readFeedbackIdeaModeration>
>;
function reviewedText(value: unknown, max: number) {
  const text = postField(value, max);
  if (
    text.trim().length < 3 ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)
  )
    throw new PortalError(
      400,
      "Use meaningful ordinary public text within the field limits."
    );
  return text.trim();
}
function publicText(input: Record<string, unknown>) {
  if (input.reviewed !== true)
    throw new PortalError(
      400,
      "Review the public text and confirm that it excludes private case material."
    );
  if (
    typeof input.status !== "string" ||
    !Object.hasOwn(feedbackIdeaStates, input.status)
  )
    throw new PortalError(400, "Choose a supported roadmap state.");
  const release =
    input.releaseId == null || input.releaseId === ""
      ? null
      : releaseEntry(input.releaseId);
  if (
    input.status === "RELEASED" &&
    (!release || release.date > new Date().toISOString().slice(0, 10))
  )
    throw new PortalError(
      400,
      "Released needs an actual available release entry. Planned work has no release receipt yet."
    );
  if (
    input.status !== "RELEASED" &&
    input.releaseId != null &&
    input.releaseId !== ""
  )
    throw new PortalError(
      400,
      "Only a released idea can carry a release entry."
    );
  return {
    title: reviewedText(input.title, 120),
    summary: reviewedText(input.summary, 1600),
    status: input.status,
    explanation: reviewedText(input.explanation, 1000),
    releaseId: input.status === "RELEASED" ? release!.id : null
  };
}
async function eventIn(
  tx: Tx,
  authority: AdminAuthority,
  idea: {
    id: string;
    version: number;
    status: string;
    releaseId: string | null;
    mergedIntoId: string | null;
  },
  previous: { status: string; mergedIntoId: string | null } | null,
  action: string,
  explanation: string
) {
  const grant = requireAdminCapability(authority, "MANAGE_PRODUCT_FEEDBACK");
  const event = await tx.feedbackIdeaEvent.create({
    data: {
      ideaId: idea.id,
      version: idea.version,
      actorId: authority.actor.id,
      operatorGrantId: grant.id,
      operatorGrantVersion: grant.version,
      action,
      fromState: previous?.status ?? null,
      toState: idea.status,
      explanation,
      releaseId: idea.releaseId,
      fromMergedIntoId: previous?.mergedIntoId ?? null,
      toMergedIntoId: idea.mergedIntoId,
      createdAt: new Date()
    }
  });
  if (action === "STATUS" && feedbackFollowupEnabled())
    await recordFanout(
      tx,
      "FEEDBACK_IDEA",
      idea.id,
      idea.version,
      authority.actor.id,
      event.createdAt
    );
  return event;
}
export function feedbackIdeaAdminCommand(
  db: PrismaClient,
  token: unknown,
  input: Record<string, unknown>
) {
  socialInput(input, [
    "operation",
    "requestKey",
    "grantVersion",
    "caseId",
    "ideaId",
    "expectedVersion",
    "sourceVersion",
    "feedbackVersion",
    "sharingVersion",
    "title",
    "summary",
    "status",
    "explanation",
    "releaseId",
    "reviewed",
    "destinationId",
    "destinationVersion"
  ]);
  if (
    !["idea-save", "idea-withdraw", "idea-merge", "idea-unmerge"].includes(
      String(input.operation)
    )
  )
    throw new PortalError(400, "Choose a supported reviewed-idea action.");
  return withAdmin(
    db,
    token,
    async (tx, authority) => {
      if (process.env.FEEDBACK_IDEAS_ENABLED !== "true")
        throw ideaUnavailable();
      const grant = requireAdminCapability(
        authority,
        "MANAGE_PRODUCT_FEEDBACK"
      );
      expected(input.grantVersion, grant.version);
      const previous =
        input.ideaId == null
          ? null
          : await tx.feedbackIdea.findUnique({
              where: { id: postId(input.ideaId) }
            });
      if (input.ideaId != null && !previous) throw ideaUnavailable();
      const caseId = previous?.sourceCaseId ?? postId(input.caseId);
      const source =
        input.operation === "idea-withdraw"
          ? null
          : await sourceIn(tx, authority, caseId);
      const retry = await adminPriorOperation(tx, authority.actor.id, input);
      if (retry.prior) {
        const { id, version, message } = retry.prior;
        if (typeof id !== "string" || typeof message !== "string")
          throw Error("Invalid saved idea receipt");
        return { id, version, message };
      }
      const current = previous ?? source?.idea ?? null;
      expected(input.expectedVersion, current?.version ?? 0);
      const now = new Date();
      let saved;
      if (input.operation === "idea-save") {
        if (!source?.allowIdea)
          throw new PortalError(
            409,
            "The submitter has not given current permission to publish an idea."
          );
        expected(input.sourceVersion, source.case.version);
        expected(input.feedbackVersion, source.version);
        expected(input.sharingVersion, source.sharingVersion);
        if (current?.mergedIntoId)
          throw new PortalError(
            409,
            "Unmerge this idea before publishing a separate update."
          );
        const text = publicText(input),
          data = {
            ...text,
            reviewedSharingVersion: source.sharingVersion,
            reviewedGrantId: grant.id,
            publishedAt:
              current?.publishedAt && !current.withdrawnAt
                ? current.publishedAt
                : now,
            withdrawnAt: null
          };
        saved = current
          ? await tx.feedbackIdea.update({
              where: { id: current.id },
              data: { ...data, version: { increment: 1 } }
            })
          : await tx.feedbackIdea.create({
              data: { sourceCaseId: caseId, ...data }
            });
        await eventIn(
          tx,
          authority,
          saved,
          current,
          !current || current.withdrawnAt
            ? "PUBLISH"
            : current.status !== saved.status
              ? "STATUS"
              : "EDIT",
          text.explanation
        );
      } else if (input.operation === "idea-withdraw") {
        if (!current) throw ideaUnavailable();
        const explanation = reviewedText(input.explanation, 1000);
        // Product reviewers can retract a public copy without receiving the private case.
        saved = await tx.feedbackIdea.update({
          where: { id: current.id },
          data: { withdrawnAt: now, version: { increment: 1 } }
        });
        await eventIn(tx, authority, saved, current, "WITHDRAW", explanation);
        await recordFeedbackPrivacyControl(
          tx,
          "FEEDBACK_IDEA",
          saved.id,
          authority.actor.id,
          saved.version
        );
      } else {
        if (!current || input.reviewed !== true)
          throw new PortalError(
            400,
            "Review the public merge or reversal before continuing."
          );
        const explanation = reviewedText(input.explanation, 1000);
        if (input.operation === "idea-merge") {
          await requirePublicIdea(tx, current.id);
          if (current.mergedIntoId)
            throw new PortalError(
              409,
              "Choose the current public destination before merging again."
            );
          const destination = await publicIdeaRoot(
            tx,
            await requirePublicIdea(tx, postId(input.destinationId))
          );
          if (
            destination.id !== input.destinationId ||
            destination.id === current.id
          )
            throw new PortalError(
              409,
              "Choose a different current public destination."
            );
          expected(input.destinationVersion, destination.version);
          const destinationPrivate = await tx.feedbackIdea.findUniqueOrThrow({
            where: { id: destination.id }
          });
          await sourceIn(tx, authority, destinationPrivate.sourceCaseId);
          const members = await ideaFamilies(tx, [current.id]);
          if (members.some((r) => r.id === destination.id))
            throw new PortalError(409, "An idea merge cannot create a loop.");
          saved = await tx.feedbackIdea.update({
            where: { id: current.id },
            data: { mergedIntoId: destination.id, version: { increment: 1 } }
          });
          await tx.feedbackIdea.update({
            where: { id: destination.id },
            data: { version: { increment: 1 } }
          });
          await ideaFamilies(tx, [destination.id]);
          await eventIn(tx, authority, saved, current, "MERGE", explanation);
        } else {
          if (!current.mergedIntoId)
            throw new PortalError(409, "This idea is not merged.");
          const destination = await administrativeRoot(
            tx,
            authority,
            current.mergedIntoId
          );
          expected(input.destinationVersion, destination.version);
          saved = await tx.feedbackIdea.update({
            where: { id: current.id },
            data: { mergedIntoId: null, version: { increment: 1 } }
          });
          await tx.feedbackIdea.update({
            where: { id: destination.id },
            data: { version: { increment: 1 } }
          });
          await eventIn(tx, authority, saved, current, "UNMERGE", explanation);
        }
      }
      const result = {
        id: saved.id,
        version: saved.version,
        message:
          input.operation === "idea-withdraw"
            ? "The public idea was withdrawn. Its private feedback receipt remains unchanged."
            : "The reviewed idea change was saved. Private feedback and original interest records remain separate."
      };
      await recordAdminOperation(
        tx,
        authority.actor.id,
        input,
        { sourceType: "SUPPORT", sourceId: caseId },
        result,
        saved.id
      );
      return result;
    },
    true
  );
}
