import { getCurrentPlatformUser } from "@/lib/platform/session";
import { PlatformShell } from "./platform-shell";
import { PortalHeading } from "./portal-ui";
import { FeedbackIdeas } from "./feedback-ideas";
export async function FeedbackIdeasPage({
  id,
  q,
  page
}: {
  id?: string;
  q?: string;
  page?: string;
}) {
  const user =
    process.env.NODE_ENV === "production"
      ? await getCurrentPlatformUser()
      : null;
  const query = new URLSearchParams({
    ...(id ? { id } : {}),
    ...(q ? { q } : {}),
    ...(page ? { page } : {})
  }).toString();
  return (
    <PlatformShell user={user}>
      <section className="container-shell max-w-4xl py-8 sm:py-10">
        <PortalHeading
          title="Reviewed ideas"
          description="Public suggestions, current plans and released changes."
        />
        <FeedbackIdeas
          key={`${user?.id ?? "guest"}:${query}`}
          owner={user?.id ?? null}
          query={query}
        />
      </section>
    </PlatformShell>
  );
}
