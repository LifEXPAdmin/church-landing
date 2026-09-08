import Link from "next/link";
import { redirect } from "next/navigation";
import type {
  SupportSnapshot,
  SupportView
} from "@/lib/platform/support-types";
import { SupportError } from "@/lib/platform/support";
import { readSupportPage } from "@/lib/platform/support-session";
import { PlatformShell } from "./platform-shell";
import {
  PortalHeading,
  PortalEmpty,
  PortalHelpContact,
  portalLinkClass
} from "./portal-ui";
import { SupportViews } from "./support-views";
import { PortalRetry } from "./portal-retry";
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
  let snapshot: SupportSnapshot | undefined;
  let failure: number | undefined;
  try {
    snapshot = await readSupportPage(view, caseId, churchId, page);
  } catch (error) {
    failure = error instanceof SupportError ? error.status : 503;
  }
  if (failure === 401) redirect("/platform/login");
  if (!snapshot)
    return (
      <PlatformShell user={null}>
        <section className="container-shell max-w-3xl space-y-6 py-10">
          <div role="alert">
            <PortalHeading
              title={
                failure === 404
                  ? "Request not available"
                  : "We could not load your requests"
              }
              description={
                failure === 404
                  ? "This request or view is not available to this account. No private information is displayed."
                  : "Please try again. We have not shown an empty history in place of an error."
              }
            />
          </div>
          <PortalRetry />
          <Link className={portalLinkClass} href="/platform/help/requests">
            Back to My requests
          </Link>
          <PortalHelpContact />
        </section>
      </PlatformShell>
    );
  const titles = {
    new: "Get help",
    requests: "My requests",
    inbox: "Assigned support inbox",
    routing: "Assign requests",
    detail: snapshot.detail?.subject ?? "Request"
  };
  return (
    <PlatformShell user={snapshot.viewer}>
      <section className="container-shell max-w-4xl py-8 sm:py-10">
        <PortalHeading
          title={titles[view]}
          description={
            view === "inbox"
              ? "Only conversations currently assigned to you appear here. Check the audience before replying."
              : "Ordinary help, clear ownership and updates you can return to. Private to each request's authorized participants."
          }
        />
        <SupportViews
          snapshot={snapshot}
          view={view}
          churchId={churchId}
          received={received}
        />
      </section>
    </PlatformShell>
  );
}
