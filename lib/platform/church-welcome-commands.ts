import type { PrismaClient } from "@prisma/client";
import {
  postContext,
  postCanEdit,
  withPostRead,
  type PostContext,
  type PostTx
} from "./post-access";
import { socialCommand, socialInput } from "./social-operations";
import { expected, PortalError } from "./portal-policy";
import { postId } from "./post-input";
import { welcomePurposes } from "./onboarding-options";
import {
  churchWelcomePosts,
  requireWelcomeMember
} from "./church-welcome-policy";

async function source(
  tx: PostTx,
  context: PostContext,
  churchId: string,
  id: string
) {
  await requireWelcomeMember(tx, context, churchId);
  const post = await tx.platformPost.findFirst({
    where: { AND: [churchWelcomePosts(context, churchId), { id }] }
  });
  if (!post) throw new PortalError(404, "This church post is unavailable.");
  return post;
}
export function readWelcomePost(
  db: PrismaClient,
  token: unknown,
  churchIdValue: unknown,
  postIdValue: unknown
) {
  const churchId = postId(churchIdValue),
    id = postId(postIdValue);
  return withPostRead(db, token, async (tx, context) => {
    const post = await source(tx, context, churchId, id);
    if (!postCanEdit(context, post))
      throw new PortalError(
        403,
        "Only the current author can label this post."
      );
    const thread = await tx.churchWelcomeThread.findUnique({
      where: { postId: id },
      select: { purpose: true, version: true }
    });
    return {
      ownerId: context.actorId!,
      postId: id,
      churchId,
      purpose: thread?.purpose ?? "NONE",
      version: thread?.version ?? 0
    };
  });
}
export type WelcomePostView = Awaited<ReturnType<typeof readWelcomePost>>;

export function saveChurchWelcome(
  db: PrismaClient,
  token: unknown,
  input: Record<string, unknown>
) {
  const operation = input.operation;
  if (!["welcome", "tag", "handled"].includes(String(operation)))
    throw new PortalError(400, "Choose a supported church welcome change.");
  const fields = [
    "operation",
    "churchId",
    "postId",
    "expectedVersion",
    "mutationId"
  ];
  socialInput(input, [
    ...fields,
    ...(operation === "tag"
      ? ["purpose"]
      : operation === "handled"
        ? ["handled"]
        : [])
  ]);
  const churchId = postId(input.churchId),
    id =
      operation === "welcome" && input.postId === null
        ? null
        : postId(input.postId);
  if (
    operation === "tag" &&
    (typeof input.purpose !== "string" ||
      !Object.hasOwn(welcomePurposes, input.purpose))
  )
    throw new PortalError(
      400,
      "Choose Ordinary post, Introduction or Question."
    );
  if (operation === "handled" && typeof input.handled !== "boolean")
    throw new PortalError(400, "Choose whether follow-up is handled.");
  const authorize = async (tx: PostTx, ownerId: string) => {
    const context = await postContext(tx, ownerId);
    await requireWelcomeMember(tx, context, churchId, operation === "handled");
    const post = id ? await source(tx, context, churchId, id) : null;
    if (
      operation === "welcome" &&
      (!context.publishers.has(churchId) ||
        (post && post.authorChurchId !== churchId))
    )
      throw new PortalError(
        403,
        "A current church publisher may choose an existing church-authored welcome post."
      );
    if (operation === "tag" && (!post || !postCanEdit(context, post)))
      throw new PortalError(
        403,
        "Only the current author can label this post."
      );
    if (
      operation === "handled" &&
      !(await tx.churchWelcomeThread.findFirst({
        where: {
          postId: id!,
          churchId,
          purpose: { in: ["INTRODUCTION", "QUESTION"] }
        },
        select: { postId: true }
      }))
    )
      throw new PortalError(404, "This welcome thread is unavailable.");
  };
  return socialCommand(
    db,
    token,
    "church-welcome",
    input,
    async (tx, ownerId) => {
      let version: number;
      if (operation === "welcome") {
        const church = await tx.church.findUniqueOrThrow({
          where: { id: churchId },
          select: { welcomeVersion: true }
        });
        expected(input.expectedVersion, church.welcomeVersion);
        const row = await tx.church.update({
          where: { id: churchId },
          data: { welcomePostId: id, welcomeVersion: { increment: 1 } },
          select: { welcomeVersion: true }
        });
        version = row.welcomeVersion;
      } else {
        const old = await tx.churchWelcomeThread.findUnique({
          where: { postId: id! }
        });
        expected(input.expectedVersion, old?.version ?? 0);
        const row =
          operation === "handled"
            ? await tx.churchWelcomeThread.update({
                where: { postId: id! },
                data: {
                  handled: input.handled as boolean,
                  version: { increment: 1 }
                }
              })
            : await tx.churchWelcomeThread.upsert({
                where: { postId: id! },
                create: {
                  postId: id!,
                  churchId,
                  purpose: String(input.purpose),
                  version: 1
                },
                update: {
                  churchId,
                  purpose: String(input.purpose),
                  handled: false,
                  version: { increment: 1 }
                }
              });
        version = row.version;
      }
      await tx.churchAuditEvent.create({
        data: {
          churchId,
          actorId: ownerId,
          targetId: id ?? churchId,
          action: "WELCOME_" + String(operation).toUpperCase(),
          toState:
            operation === "tag"
              ? String(input.purpose)
              : operation === "handled"
                ? String(input.handled)
                : id
                  ? "SELECTED"
                  : "CLEARED",
          version
        }
      });
      return {
        id: id ?? churchId,
        version,
        message:
          operation === "welcome"
            ? "Church welcome updated."
            : operation === "tag"
              ? "Post label saved."
              : input.handled
                ? "Follow-up marked handled."
                : "Follow-up reopened."
      };
    },
    authorize
  );
}
