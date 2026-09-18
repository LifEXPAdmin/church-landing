import type { PostContext, PostTx } from "./post-access";
import { groupCategories, groupChoice } from "./group-input";
import { requireGroupParticipation } from "./group-policy";
import { postId } from "./post-input";
import { PortalError } from "./portal-policy";
export function groupPostDestination(input: Record<string, unknown>) {
  const groupId = input.groupId ? postId(input.groupId) : null;
  if (!groupId) {
    if (
      input.audience === "GROUP" ||
      input.groupThreadKind ||
      input.groupCategory
    )
      throw new PortalError(
        400,
        "Choose the current group destination for this discussion."
      );
    return { groupId: null, groupThreadKind: null, groupCategory: null };
  }
  if (
    input.audience !== "GROUP" ||
    input.authorChurchId ||
    input.audienceChurchId ||
    input.topicCommunityId ||
    input.eventOccurrenceId ||
    input.quoteSourceId ||
    input.scheduleLocal ||
    input.scheduleZone ||
    input.allowReposts === true ||
    (input.replyAudience !== undefined && input.replyAudience !== "VIEWERS")
  )
    throw new PortalError(
      400,
      "Group discussions stay within their current group. Use your personal identity without a church, topic, event, quote or publication schedule."
    );
  return {
    groupId,
    groupThreadKind: groupChoice(input.groupThreadKind, {
      DISCUSSION: true,
      QUESTION: true
    }),
    groupCategory: groupChoice(input.groupCategory, groupCategories)
  };
}
export async function requireGroupPostParticipation(
  tx: PostTx,
  context: PostContext,
  id: string
) {
  const post = await tx.platformPost.findUnique({
    where: { id },
    select: { groupId: true }
  });
  requireGroupParticipation(context, post?.groupId);
}
