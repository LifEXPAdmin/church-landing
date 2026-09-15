// Keep the deployed queue/consumer identity. Legacy { id } messages continue to
// mean comment-follower work; new kinds retain their own canonical job owners.
export const NOTIFICATION_WORK_TOPIC = "comment-followers-v1";
export const notificationFanoutMessage = (id: string) => ({
  id,
  kind: "activity" as const
});
export const scheduledPublicationMessage = (plan: {
  id: string;
  version: number;
}) => ({
  id: plan.id,
  version: plan.version,
  kind: "scheduled" as const
});
