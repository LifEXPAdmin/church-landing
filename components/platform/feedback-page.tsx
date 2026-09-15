import { redirect } from "next/navigation";
import { getCurrentPlatformUser } from "@/lib/platform/session";
import { safeAccountReturn } from "@/lib/platform/account-entry";
import { currentRelease } from "@/lib/platform/release-content";
import { PlatformShell } from "./platform-shell";
import { PortalHeading, PortalEmpty } from "./portal-ui";
import { FeedbackWorkspace } from "./feedback-workspace";
export async function FeedbackPage({
  view,
  caseId,
  page,
  received,
  promptClaimId
}: {
  view: "new" | "requests" | "detail";
  caseId?: string;
  page?: string;
  received?: boolean;
  promptClaimId?: string;
}) {
  if (process.env.NODE_ENV !== "production")
    return (
      <PlatformShell user={null}>
        <section className="container-shell py-10">
          <PortalEmpty>
            Use the isolated HTTPS production preview for private feedback. This
            development page does not read private accounts or cases.
          </PortalEmpty>
        </section>
      </PlatformShell>
    );
  const user = await getCurrentPlatformUser();
  const path =
    view === "detail"
      ? `/platform/feedback/cases/${encodeURIComponent(caseId ?? "")}`
      : view === "requests"
        ? "/platform/feedback/requests"
        : "/platform/feedback";
  if (!user)
    redirect(
      `/platform/login?next=${encodeURIComponent(safeAccountReturn(path))}`
    );
  const query = new URLSearchParams({
    view,
    ...(caseId ? { caseId } : {}),
    ...(page ? { page } : {})
  }).toString();
  return (
    <PlatformShell user={user}>
      <section className="container-shell max-w-4xl py-8 sm:py-10">
        <PortalHeading
          title={
            view === "new"
              ? "Share feedback"
              : view === "requests"
                ? "My feedback"
                : "Feedback receipt"
          }
          description="Optional website feedback, private receipts and choices you can return to."
        />
        <FeedbackWorkspace
          key={`${user.id}:${view}:${caseId ?? ""}:${page ?? ""}`}
          owner={user.id}
          query={query}
          view={view}
          release={currentRelease.version}
          received={received}
          promptClaimId={promptClaimId}
        />
      </section>
    </PlatformShell>
  );
}
