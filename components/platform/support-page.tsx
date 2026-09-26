import { redirect } from "next/navigation";
import type { SupportView } from "@/lib/platform/support-types";
import { PlatformShell } from "./platform-shell";
import { PortalHeading, PortalEmpty } from "./portal-ui";
import { getCurrentPlatformUser } from "@/lib/platform/session";
import { SupportIndex } from "./support-index";
import { SupportIntake } from "./support-intake";
import { SupportCaseWorkspace } from "./support-case-workspace";
export async function SupportPage({
  view,
  caseId,
  churchId,
  page,
  received
}: {
  view: SupportView;
  caseId?: string;
  churchId?: string;
  page?: string;
  received?: boolean;
}) {
  // Do not await cookies or private database values in Next's development Flight debugger.
  if (process.env.NODE_ENV !== "production")
    return (
      <PlatformShell user={null}>
        <section className="container-shell py-10">
          <PortalHeading
            title="Open the private support preview"
            description="Private requests use the isolated production preview, not development debugging output."
          />
          <PortalEmpty>
            Use the HTTPS address from <code>npm run preview:support</code>. No
            private request information is loaded by this development page.
          </PortalEmpty>
        </section>
      </PlatformShell>
    );
  const user = await getCurrentPlatformUser();
  if (!user) redirect("/platform/login");
  const url = `/api/platform/support?${new URLSearchParams({ view, ...(caseId ? { caseId } : {}), ...(churchId ? { churchId } : {}), ...(page ? { page } : {}) })}`;
  return (
    <PlatformShell user={user}>
      <section className="container-shell max-w-4xl py-8 sm:py-10">
        {view !== "detail" && view !== "routing" && (
          <PortalHeading
            title={
              view === "inbox"
                ? "Assigned support inbox"
                : view === "new"
                  ? "Get help"
                  : "My requests"
            }
            description={
              view === "inbox"
                ? "Only conversations currently assigned to you appear here. Check the audience before replying."
                : "Ordinary help, clear ownership and updates you can return to. Private to each request’s authorized participants."
            }
          />
        )}
        {view === "detail" || view === "routing" ? (
          <SupportCaseWorkspace
            key={`${user.id}:${url}`}
            owner={user.id}
            url={url}
            view={view}
            received={received}
          />
        ) : view === "new" ? (
          <SupportIntake
            key={`${user.id}:${url}`}
            owner={user.id}
            url={url}
            churchId={churchId}
          />
        ) : (
          <SupportIndex
            key={`${user.id}:${url}`}
            owner={user.id}
            url={url}
            view={view}
          />
        )}
      </section>
    </PlatformShell>
  );
}
