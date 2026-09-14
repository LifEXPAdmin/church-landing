import type { Prisma, PrayerRecord } from "@prisma/client";
import { eligibleWhere, PortalError } from "./portal-policy";
import {
  postCanEdit,
  postCanReply,
  type PostContext,
  type PostTx
} from "./post-access";
import {
  readableComment,
  readableConversation,
  canDeleteComment
} from "./comment-policy";
import { postId } from "./post-input";
import { repostSourceWhere } from "./repost-policy";
import { socialUserWhere } from "./social-policy";
import type { PrayerChoice } from "./prayer-types";

export function prayerTargetKey(post: string, comment?: string | null) {
  return comment ? `comment:${comment}` : `post:${post}`;
}
export function prayerReference(input: {
  postId?: unknown;
  commentId?: unknown;
}) {
  const id = postId(input.postId);
  const commentId = input.commentId == null ? null : postId(input.commentId);
  return { postId: id, commentId, targetKey: prayerTargetKey(id, commentId) };
}
export async function requirePrayerOwner(tx: PostTx, ownerId: string | null) {
  if (!ownerId)
    throw new PortalError(401, "Sign in to use prayer and private follow-up.");
  if (
    !(await tx.platformUser.findFirst({
      where: { id: ownerId, ...eligibleWhere },
      select: { id: true }
    }))
  )
    throw new PortalError(
      403,
      "Verify your email and finish adult account setup before using prayer controls."
    );
  return ownerId;
}
export async function prayerTargetIn(
  tx: PostTx,
  context: PostContext,
  input: { postId?: unknown; commentId?: unknown }
) {
  const reference = prayerReference(input);
  let post = await readableConversation(tx, context, reference.postId);
  // Use the same original distribution authority as other canonical actions.
  if (post.repostKind === "PLAIN") {
    const original = post.repostSourceId
      ? await tx.platformPost.findFirst({
          where: {
            AND: [{ id: post.repostSourceId }, repostSourceWhere(context)]
          }
        })
      : null;
    if (!original)
      throw new PortalError(404, "This prayer target is unavailable.");
    post = original;
  }
  const comment = reference.commentId
    ? await readableComment(tx, context, post.id, reference.commentId)
    : null;
  const canUpdate = comment
    ? canDeleteComment(context, comment)
    : postCanEdit(context, post);
  const occurrence = post.eventOccurrenceId
    ? await tx.calendarOccurrence.findUnique({
        where: { id: post.eventOccurrenceId },
        select: {
          event: {
            select: {
              visibility: true,
              calendar: { select: { churchId: true } }
            }
          }
        }
      })
    : null;
  const requiredChurches = [
    ...new Set([
      ...(post.audience === "CHURCH" && post.audienceChurchId
        ? [post.audienceChurchId]
        : []),
      ...(occurrence?.event.visibility === "CHURCH" &&
      occurrence.event.calendar.churchId
        ? [occurrence.event.calendar.churchId]
        : [])
    ])
  ];
  return {
    post,
    comment,
    requiredChurches,
    postId: post.id,
    commentId: comment?.id ?? null,
    targetKey: prayerTargetKey(post.id, comment?.id),
    href: `/platform/posts/${post.id}${comment ? `?comment=${comment.id}` : ""}`,
    canAcknowledge: postCanReply(context, post),
    canUpdate: canUpdate && postCanReply(context, post),
    authorChurchId: comment ? comment.authorChurchId : post.authorChurchId
  };
}
export type PrayerTarget = Awaited<ReturnType<typeof prayerTargetIn>>;
export function prayerParticipantWhere(
  context: PostContext,
  target: PrayerTarget
): Prisma.PrayerRecordWhereInput {
  const sourcePeople = [
    ...(target.post.authorChurchId ? [] : [target.post.authorId]),
    ...(target.comment && !target.comment.authorChurchId
      ? [target.comment.authorId]
      : [])
  ];
  return {
    targetKey: target.targetKey,
    acknowledgedAt: { not: null },
    owner: {
      AND: [
        eligibleWhere,
        socialUserWhere(context),
        ...target.requiredChurches.map((churchId) => ({
          connections: { some: { churchId, state: "APPROVED" as const } }
        }))
      ],
      socialRelations: {
        none: { blocked: true, targetUserId: { in: sourcePeople } }
      },
      socialTargets: { none: { blocked: true, ownerId: { in: sourcePeople } } }
    }
  };
}
export function prayerChoice(row: PrayerRecord | null): PrayerChoice {
  return {
    version: row?.version ?? 0,
    acknowledged: !!row?.acknowledgedAt,
    shareName: row?.shareName ?? false,
    saved: !!row?.savedAt,
    updates: !!row?.savedAt && !!row.updatesSince
  };
}
