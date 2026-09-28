import { PostCardContent, type PostCardProps } from "./post-card-content";
import { PostParticipation } from "./post-participation";

// Public/server readers retain their existing server participation slot. The
// private followed stream shares the same card with an authenticated client slot.
export function PostCard(props: PostCardProps) {
  const post =
    props.post.repost?.kind === "PLAIN" ? props.post.repost.source : props.post;
  const participation =
    post &&
    (!post.contentNote || props.fullDiscussion) &&
    (post.hasParticipation ||
      !!post.eventOccurrenceId ||
      (props.fullDiscussion && (post.canEdit || post.canOrganize))) ? (
      <PostParticipation postId={post.id} manage={!!props.fullDiscussion} />
    ) : null;
  return <PostCardContent {...props} participation={participation} />;
}
