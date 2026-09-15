import { Prisma, type PrismaClient } from "@prisma/client";
import { withAccountRead } from "./account-read";
import { postField, postId } from "./post-input";
import { expected, PortalError } from "./portal-policy";
import { socialCommand, socialInput } from "./social-operations";
import {
  publicIdeaRows,
  requirePublicIdea,
  publicIdeaRoot,
  ideaFamilies,
  ideaInterest,
  ideaVoteCounts,
  projectPublicIdea,
  ideaUnavailable
} from "./feedback-idea-access";
import {
  feedbackIdeaStates,
  type FeedbackIdeasSnapshot,
  type FeedbackIdeaState
} from "./feedback-idea-types";
import { recordFeedbackPrivacyControl } from "./retention-controls";

export function readFeedbackIdeas(
  db: PrismaClient,
  token: unknown,
  input: { id?: unknown; q?: unknown; page?: unknown } = {}
) {
  const query = postField(input.q ?? "", 80),
    page = input.page == null ? 0 : Number(input.page);
  if (!Number.isInteger(page) || page < 0 || page > 99)
    throw new PortalError(400, "Choose a supported ideas page.");
  return withAccountRead(
    db,
    token,
    async (tx, ownerId): Promise<FeedbackIdeasSnapshot> => {
      const empty = {
        ownerId,
        available: process.env.FEEDBACK_IDEAS_ENABLED === "true",
        ideas: [],
        page,
        more: false,
        query
      };
      if (!empty.available) {
        if (input.id != null) throw ideaUnavailable();
        return empty;
      }
      if (input.id != null) {
        const source = await requirePublicIdea(tx, postId(input.id)),
          root = await publicIdeaRoot(tx, source);
        const counts = await ideaVoteCounts(tx, [root.id]);
        const history = await tx.feedbackIdeaEvent.findMany({
          where: {
            ideaId: root.id,
            createdAt: { gte: root.publishedAt },
            action: { in: ["PUBLISH", "EDIT", "STATUS"] }
          },
          select: {
            version: true,
            toState: true,
            explanation: true,
            releaseId: true,
            createdAt: true
          },
          orderBy: { version: "desc" },
          take: 30
        });
        return {
          ...empty,
          detail: projectPublicIdea(root, counts.get(root.id) ?? 0),
          ...(source.id !== root.id
            ? { destination: { id: root.id, title: root.title } }
            : {}),
          interest: await ideaInterest(tx, root.id, ownerId),
          history: history
            .filter((e) => Object.hasOwn(feedbackIdeaStates, e.toState))
            .map((e) => ({
              version: e.version,
              status: e.toState as FeedbackIdeaState,
              explanation: e.explanation,
              releaseId: e.releaseId,
              createdAt: e.createdAt.toISOString()
            }))
        };
      }
      const literal = "%" + query.replace(/[\\%_]/g, "\\$&") + "%";
      const rows = await publicIdeaRows(
        tx,
        Prisma.sql`i."mergedIntoId" IS NULL AND (${query}='' OR i.title ILIKE ${literal} OR i.summary ILIKE ${literal})`,
        21,
        page * 20
      );
      const shown = rows.slice(0, 20),
        counts = await ideaVoteCounts(
          tx,
          shown.map((row) => row.id)
        );
      return {
        ...empty,
        ideas: shown.map((row) =>
          projectPublicIdea(row, counts.get(row.id) ?? 0)
        ),
        more: rows.length > 20
      };
    }
  );
}
export function feedbackIdeaInterestCommand(
  db: PrismaClient,
  token: unknown,
  input: Record<string, unknown>
) {
  socialInput(input, [
    "operation",
    "mutationId",
    "ideaId",
    "expectedVersion",
    "interestVersion",
    "active",
    "inApp",
    "email",
    "push"
  ]);
  if (input.operation !== "idea-vote" && input.operation !== "idea-subscribe")
    throw new PortalError(400, "Choose an idea action.");
  const ideaId = postId(input.ideaId);
  return socialCommand(
    db,
    token,
    "feedback-idea-interest",
    input,
    async (tx, ownerId) => {
      if (process.env.FEEDBACK_IDEAS_ENABLED !== "true")
        throw ideaUnavailable();
      const original = await requirePublicIdea(tx, ideaId),
        idea = await publicIdeaRoot(tx, original);
      if (idea.id !== ideaId)
        throw new PortalError(
          409,
          "This idea was merged. Review the current destination first."
        );
      expected(input.expectedVersion, idea.version);
      const interest = await ideaInterest(tx, idea.id, ownerId);
      if (!interest.canVote)
        throw new PortalError(
          403,
          "Verify your email and confirm adult account eligibility before voting or subscribing."
        );
      const voting = input.operation === "idea-vote";
      if (
        input.interestVersion !==
        (voting ? interest.voteVersion : interest.subscriptionVersion)
      )
        throw new PortalError(
          409,
          "Your interest choices changed. Review the current idea before saving again."
        );
      const ids = (await ideaFamilies(tx, [idea.id])).map((row) => row.id);
      if (voting) {
        if (
          typeof input.active !== "boolean" ||
          [input.inApp, input.email, input.push].some(
            (value) => value !== undefined
          )
        )
          throw new PortalError(
            400,
            "Choose whether to add or remove your vote."
          );
        // Removing interest clears every original vote in this merged group.
        if (input.active !== interest.voted) {
          if (!input.active)
            await tx.feedbackIdeaVote.updateMany({
              where: { userId: ownerId, ideaId: { in: ids }, active: true },
              data: { active: false, version: { increment: 1 } }
            });
          else
            await tx.feedbackIdeaVote.upsert({
              where: { ideaId_userId: { ideaId: idea.id, userId: ownerId } },
              create: { ideaId: idea.id, userId: ownerId },
              update: { active: true, version: { increment: 1 } }
            });
        }
      } else {
        if (
          input.active !== undefined ||
          [input.inApp, input.email, input.push].some(
            (value) => typeof value !== "boolean"
          )
        )
          throw new PortalError(400, "Review each subscription channel.");
        const now = new Date(),
          previous = await tx.feedbackIdeaSubscription.findMany({
            where: { userId: ownerId, ideaId: { in: ids } }
          });
        // Keep original subscriptions through a merge/reversal. A disabled channel
        // clears every member; a newly enabled channel starts only at the root.
        const root = previous.find((row) => row.ideaId === idea.id);
        const since = (
          key: "inAppSince" | "emailSince" | "pushSince",
          active: unknown
        ) =>
          active
            ? (root?.[key] ?? (previous.some((row) => row[key]) ? null : now))
            : null;
        const data = {
          inAppSince: since("inAppSince", input.inApp),
          emailSince: since("emailSince", input.email),
          pushSince: since("pushSince", input.push)
        };
        await tx.feedbackIdeaSubscription.updateMany({
          where: {
            userId: ownerId,
            ideaId: { in: ids },
            NOT: { ideaId: idea.id }
          },
          data: {
            ...(!input.inApp ? { inAppSince: null } : {}),
            ...(!input.email ? { emailSince: null } : {}),
            ...(!input.push ? { pushSince: null } : {}),
            version: { increment: 1 }
          }
        });
        await tx.feedbackIdeaSubscription.upsert({
          where: { ideaId_userId: { ideaId: idea.id, userId: ownerId } },
          create: { ideaId: idea.id, userId: ownerId, ...data },
          update: { ...data, version: { increment: 1 } }
        });
        for (const row of await tx.feedbackIdeaSubscription.findMany({
          where: { userId: ownerId, ideaId: { in: ids } }
        }))
          await recordFeedbackPrivacyControl(
            tx,
            "FEEDBACK_SUBSCRIPTION",
            row.id,
            ownerId,
            row.version
          );
      }
      return {
        id: idea.id,
        version: idea.version,
        message: voting
          ? "Your vote choice was saved. Votes express interest, without promising a delivery date."
          : "Your update choices were saved. Actual delivery also depends on current account preferences and availability."
      };
    },
    undefined,
    "shared"
  );
}
