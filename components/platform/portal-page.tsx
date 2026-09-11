import Link from "next/link";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { PortalError, publicChurches } from "@/lib/platform/portal";
import { churchDiscoveryHref } from "@/lib/platform/church-search";
import { readPortalPage } from "@/lib/platform/portal-session";
import type { PortalSnapshot, PortalView } from "@/lib/platform/portal-types";
import { PlatformShell } from "@/components/platform/platform-shell";
import {
  PortalDirectory,
  PortalDiscover,
  PortalHelp,
  PortalMyChurch,
  PortalPublicDiscover,
  PortalReview,
  PortalSharing
} from "@/components/platform/portal-member-views";
import { PortalOperator } from "@/components/platform/portal-operator";
import { PortalRetry } from "@/components/platform/portal-retry";
import { ChurchPosts } from "./church-posts";
import {
  PortalEmpty,
  PortalHeading,
  PortalHelpContact,
  portalLinkClass
} from "@/components/platform/portal-ui";

function reviewerNavigation(snapshot: PortalSnapshot) {
  const links = snapshot.reviewerChurches.map((church) => ({
    href: `/platform/churches/${encodeURIComponent(church.id)}/review`,
    label: `Review: ${church.name}`
  }));
  if (snapshot.operatorCapabilities.includes("REVIEW_CHURCH_CLAIMS"))
    links.push({
      href: "/platform/church-claims/review",
      label: "Review church representatives"
    });
  if (snapshot.operatorCapabilities.includes("REVIEW_CHURCH_LISTINGS"))
    links.push({
      href: "/platform/operator/listings",
      label: "Review church listings"
    });
  if (
    snapshot.operatorCapabilities.length ||
    snapshot.coordinatorChurches.length
  ) {
    links.push({
      href: "/platform/operator/churches",
      label: snapshot.operatorCapabilities.length
        ? "Church administration"
        : "Contact appointments"
    });
  }
  return links;
}

function PortalViewContent({
  snapshot,
  view,
  churchId,
  focus
}: {
  snapshot: PortalSnapshot;
  view: PortalView;
  churchId?: string;
  focus?: string;
}) {
  switch (view) {
    case "discover":
      return <PortalDiscover snapshot={snapshot} detail={!!churchId} />;
    case "my-church":
      return <PortalMyChurch snapshot={snapshot} />;
    case "sharing":
      return <PortalSharing snapshot={snapshot} />;
    case "directory":
      return <PortalDirectory snapshot={snapshot} focus={focus} />;
    case "review":
      return <PortalReview snapshot={snapshot} />;
    case "help":
      return <PortalHelp snapshot={snapshot} />;
    case "operator":
      return snapshot.operator ? (
        <PortalOperator
          churches={snapshot.churches}
          coordinatorChurches={snapshot.coordinatorChurches}
          capabilities={snapshot.operatorCapabilities}
          data={snapshot.operator}
          viewerId={snapshot.viewer.id}
        />
      ) : (
        <PortalEmpty>
          Administration is not available for this account.
        </PortalEmpty>
      );
  }
}

function PublicHelp() {
  return (
    <>
      <PortalHeading
        title="Help and contacts"
        description="Contact Godschurches directly. Church-only contacts are available to approved members after sign-in."
      />
      <div className="max-w-2xl">
        <PortalHelpContact />
      </div>
      <Link href="/platform/login" className={`${portalLinkClass} mt-5`}>
        Sign in for church contacts
      </Link>
    </>
  );
}

async function PublicContent({
  view,
  churchId,
  cursor,
  query = ""
}: {
  view: PortalView;
  churchId?: string;
  cursor?: string;
  query?: string;
}) {
  if (view === "help") return <PublicHelp />;
  const result = await publicChurches(prisma, churchId, cursor, query);
  const churches = result.slice(0, 100);
  const last = churches.at(-1);
  return (
    <PortalPublicDiscover
      churches={churches}
      churchId={churchId}
      continued={!!cursor}
      query={query}
      moreHref={
        !churchId && result.length > 100 && last
          ? churchDiscoveryHref(query, last.id)
          : undefined
      }
    />
  );
}

export async function PortalPage({
  view,
  churchId,
  cursor,
  query = "",
  postBefore,
  postCursor,
  focus
}: {
  view: PortalView;
  churchId?: string;
  cursor?: string;
  query?: string;
  postBefore?: string;
  postCursor?: string;
  focus?: string;
}) {
  // Next's development Flight debugger can serialize awaited request/DB values.
  // Do not read credentials or private portal data in that renderer.
  if (process.env.NODE_ENV !== "production") {
    if (view === "discover")
      return (
        <PlatformShell user={null}>
          <section className="container-shell py-8 sm:py-10">
            <PublicContent
              view={view}
              churchId={churchId}
              cursor={cursor}
              query={query}
            />
            {churchId && (
              <ChurchPosts
                churchId={churchId}
                before={postBefore}
                cursor={postCursor}
              />
            )}
          </section>
        </PlatformShell>
      );
    return (
      <PlatformShell user={null}>
        <section className="container-shell py-8 sm:py-10">
          <PortalHeading
            title="Open the private portal preview"
            description="These church pages use the isolated production preview so private information is not included in development debugging output."
          />
          <PortalEmpty>
            Ask Codex to start the local church portal preview, or run{" "}
            <code>npm run preview:portal</code> in the project directory. Use
            the HTTPS address printed by that command. This is not a live
            deployment.
          </PortalEmpty>
        </section>
      </PlatformShell>
    );
  }
  let snapshot: PortalSnapshot | undefined;
  let content: React.ReactNode;
  let failure: number | undefined;
  const isPublic = view === "discover" || view === "help";

  try {
    snapshot =
      (await readPortalPage(view, churchId, query, cursor)) ?? undefined;
    if (!snapshot && isPublic) {
      content = await PublicContent({ view, churchId, cursor, query });
    } else if (snapshot) {
      content = (
        <PortalViewContent
          snapshot={snapshot}
          view={view}
          churchId={churchId}
          focus={focus}
        />
      );
    }
  } catch (error) {
    failure = error instanceof PortalError ? error.status : 500;
    if (failure === 401 && isPublic) {
      try {
        content = await PublicContent({ view, churchId, cursor, query });
        failure = undefined;
      } catch {
        failure = 500;
      }
    }
  }

  if (failure === 401) redirect("/platform/login");

  if (failure) {
    const permission = failure === 403;
    const missing = failure === 404;
    // Never render exception messages or partial snapshots on a failed read.
    return (
      <PlatformShell user={null}>
        <section className="container-shell py-8 sm:py-10">
          <div role="alert">
            <PortalHeading
              title={
                permission
                  ? "Access not available"
                  : missing
                    ? "Page not available"
                    : "We could not load this page"
              }
              description={
                permission
                  ? "This view requires the appropriate church connection, eligibility, or assigned permission. No private information has been displayed."
                  : missing
                    ? "The requested church or view is not available. No private information has been displayed."
                    : "Your information could not be loaded. Please try again. No private information has been displayed."
              }
            />
          </div>
          <div className="mb-6 flex flex-wrap items-center gap-5">
            <PortalRetry />
            <Link href="/platform/my-church" className={portalLinkClass}>
              My church and eligibility
            </Link>
            <Link href="/platform/churches" className={portalLinkClass}>
              Find a church
            </Link>
          </div>
          {view === "help" && (
            <div className="max-w-2xl">
              <PortalHelpContact />
            </div>
          )}
        </section>
      </PlatformShell>
    );
  }

  return (
    <PlatformShell
      user={snapshot?.viewer ?? null}
      reviewerNavigation={snapshot ? reviewerNavigation(snapshot) : []}
    >
      <section className="container-shell py-8 sm:py-10">
        {content}
        {view === "discover" && churchId && (
          <ChurchPosts
            churchId={churchId}
            before={postBefore}
            cursor={postCursor}
          />
        )}
      </section>
    </PlatformShell>
  );
}
