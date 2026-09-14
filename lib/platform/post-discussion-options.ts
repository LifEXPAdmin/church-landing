export const discussionModerationReasons = {
  SPAM: "Spam or repeated disruption",
  HARASSMENT: "Harassment or bullying",
  PRIVACY: "Protecting personal information",
  SAFETY: "A safety concern",
  REVIEW_NEEDED: "Pause while a concern is reviewed",
  REVIEW_COMPLETE: "The concern has been reviewed"
} as const;

export type DiscussionModerationReason =
  keyof typeof discussionModerationReasons;

export function discussionSettingsState(post: {
  discussionClosed: boolean;
  replyAudience: "VIEWERS" | "CHURCH_MEMBERS";
}) {
  return `${post.discussionClosed ? "CLOSED" : "OPEN"}:${post.replyAudience}`;
}

export function discussionSettingsLabel(value: string | null) {
  switch (value) {
    case "OPEN:VIEWERS":
      return "Open to eligible viewers";
    case "OPEN:CHURCH_MEMBERS":
      return "Open to approved church members";
    case "CLOSED:VIEWERS":
      return "Closed; eligible-viewer reply setting retained";
    case "CLOSED:CHURCH_MEMBERS":
      return "Closed; church-member reply setting retained";
    default:
      return "Earlier discussion setting";
  }
}
