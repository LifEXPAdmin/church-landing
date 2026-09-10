import { randomUUID } from "node:crypto";
import { readPostParticipation } from "@/lib/platform/post-session";
import { PortalError } from "@/lib/platform/portal";
import { PostParticipationControls } from "./post-participation-form";
export async function PostParticipation({
  postId,
  manage
}: {
  postId: string;
  manage: boolean;
}) {
  try {
    const view = await readPostParticipation(postId);
    return (
      <PostParticipationControls
        view={view}
        manage={manage}
        requestKey={randomUUID()}
        defaultClose={new Date(Date.now() + 86400000)
          .toISOString()
          .slice(0, 16)}
      />
    );
  } catch (error) {
    return (
      <p role="status" className="my-4 text-sm text-gc-muted">
        {error instanceof PortalError
          ? error.message
          : "Polls and volunteer roles could not load. Refresh to try again."}
      </p>
    );
  }
}
