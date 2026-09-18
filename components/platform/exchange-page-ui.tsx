import { pantryPage } from "@/lib/platform/pantry-session";
import { PrivilegedAuthenticationError } from "@/lib/platform/privileged-auth-policy";
import { privilegedChallengeHref } from "@/lib/platform/privileged-auth-navigation";
import { ExchangeContactRegion } from "./exchange-handoff-page";
import { createHash } from "node:crypto";
import Link from "next/link";
import { PlatformShell } from "./platform-shell";
import { PrivateSnapshotGuard } from "./private-snapshot-guard";
import { TopicReadBoundary } from "./topic-read-boundary";
import { ExchangeEditor } from "./exchange-editor";
import {
  ExchangeSaveSearchForm,
  ExchangeSavedItems
} from "./exchange-saved-controls";
import { postId } from "@/lib/platform/post-input";
import { ExchangeSearchPosition } from "./exchange-search-position";
import { exchangeReturnHref } from "@/lib/platform/exchange-navigation";
import { ExchangeFilters } from "./exchange-filters";
import { accountEntryHref } from "@/lib/platform/account-entry";
import { PortalError } from "@/lib/platform/portal-policy";
import { getCurrentPlatformUser } from "@/lib/platform/session";
import {
  exchangeSavedPage,
  exchangeContextPage,
  exchangeListPage,
  exchangeListingPage
} from "@/lib/platform/exchange-session";
import {
  exchangeIntentLabels,
  exchangeStateLabels,
  exchangeDisplayPrice,
  exchangeSearchParams
} from "@/lib/platform/exchange-options";
import { discoveryCountryLabel } from "@/lib/platform/discovery-options";
import { parseExchangeListQuery } from "@/lib/platform/exchange-input";

export const exchangeChecksum = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function ExchangeNavigation() {
  return (
    <nav
      aria-label="Exchange navigation"
      className="flex flex-wrap gap-x-5 gap-y-1"
    >
      {[
        ["/platform/exchange", "Browse listings"],
        ["/platform/exchange/mine", "My listings"],
        ["/platform/exchange/saved", "Saved listings and searches"],
        ["/platform/exchange/new", "Create a listing"],
        ["/platform/exchange/handoffs", "My inquiries and handoffs"],
        ["/platform/exchange/needs", "My Needs contributions"],
        ["/platform/pantry", "Church pantry and support hubs"],
        ["/platform/exchange/defaults", "Personal defaults"]
      ].map(([href, label]) => (
        <Link
          key={href}
          prefetch={false}
          className="inline-flex min-h-11 items-center underline"
          href={href}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
export function ExchangeAccountLinks({ next }: { next: string }) {
  return (
    <div className="space-y-3">
      <p>
        Sign in with a verified adult account to manage listings. Creating an
        account does not publish, reserve or contact anyone.
      </p>
      <div className="flex flex-wrap gap-3">
        <Link
          prefetch={false}
          className="gc-button"
          href={accountEntryHref("signup", next)}
        >
          Create an account
        </Link>
        <Link
          prefetch={false}
          className="gc-button gc-button-quiet"
          href={accountEntryHref("login", next)}
        >
          Sign in
        </Link>
      </div>
    </div>
  );
}
export function ExchangeUnavailable({
  error,
  href
}: {
  error: unknown;
  href: string;
}) {
  return (
    <div className="space-y-3 rounded-xl border border-gc-divider p-4">
      <p role="status">
        {error instanceof PortalError
          ? error.message
          : "This listing page could not be loaded. Your saved work is unchanged. Reconnect and try again."}
      </p>
      <div className="flex flex-wrap gap-3">
        <a className="gc-button gc-button-quiet" href={href}>
          Reload current listing page
        </a>
        {error instanceof PrivilegedAuthenticationError && (
          <a
            className="gc-button gc-button-quiet"
            href={privilegedChallengeHref(error.purpose)!}
            target="_blank"
            rel="noopener noreferrer"
          >
            Confirm authenticator in another tab
          </a>
        )}
        {error instanceof PortalError && [401, 403].includes(error.status) && (
          <Link
            prefetch={false}
            className="gc-button gc-button-quiet"
            href="/platform/settings/account"
          >
            Review account verification
          </Link>
        )}
      </div>
    </div>
  );
}
export function ExchangePrice({
  listing
}: {
  listing: Parameters<typeof exchangeDisplayPrice>[0];
}) {
  return <>{exchangeDisplayPrice(listing)}</>;
}
export type ExchangeQuery = Record<string, string | string[] | undefined>;
export async function ExchangeList({
  query: params,
  mine = false
}: {
  query: ExchangeQuery;
  mine?: boolean;
}) {
  const user = await getCurrentPlatformUser(),
    path = mine ? "/platform/exchange/mine" : "/platform/exchange";
  let content,
    retryHref = path;
  if (mine && !user) content = <ExchangeAccountLinks next={path} />;
  else
    try {
      const { savedSearch: selectedSearch, ...filterInput } = params;
      if (mine && selectedSearch)
        throw new PortalError(400, "Saved searches belong to Browse listings.");
      const savedSearch = selectedSearch ? postId(selectedSearch) : undefined;
      const query = { ...parseExchangeListQuery(filterInput, mine), mine };
      const result = await exchangeListPage(query);
      const filters = exchangeSearchParams(query);
      const readUrl = `/api/platform/exchange?${new URLSearchParams({ ...Object.fromEntries(filters), view: mine ? "mine" : "list", after: result.pageCursor })}`;
      const navigationFilters = new URLSearchParams(filters);
      if (savedSearch) navigationFilters.set("savedSearch", savedSearch);
      const first =
        path + (navigationFilters.size ? "?" + navigationFilters : "");
      retryHref = first;
      const pageFilters = exchangeSearchParams(query, true);
      if (savedSearch) pageFilters.set("savedSearch", savedSearch);
      const current = path + (pageFilters.size ? "?" + pageFilters : "");
      const rows = (
        <div className="space-y-4">
          <ExchangeSearchPosition owner={user?.id ?? null} path={current} />
          <ExchangeFilters
            key={filters.toString()}
            path={path}
            query={query}
            churches={result.churches}
            savedSearch={savedSearch}
          />
          {!mine && user && result.canSave && (
            <ExchangeSearchSaveRegion
              owner={user.id}
              query={query}
              searchId={savedSearch}
            />
          )}
          {query.after && (
            <a href={first} className="gc-button gc-button-quiet">
              Refresh this search
            </a>
          )}
          {!result.listings.length && (
            <p>
              {mine
                ? "No saved listings match these choices. Create a private draft to begin."
                : "No available listings match these choices. Clear the filters or check again later."}
            </p>
          )}
          <p className="text-sm text-gc-muted" role="status">
            Showing {result.listings.length} listings on this page
            {result.after ? ". More results are available." : "."}
          </p>
          <ul className="grid gap-4 sm:grid-cols-2">
            {result.listings.map((listing) => (
              <li
                key={listing.id}
                className="min-w-0 space-y-3 rounded-xl border border-gc-divider bg-gc-surface p-5"
              >
                <p className="text-sm">
                  {exchangeIntentLabels[listing.intent]} ·{" "}
                  {exchangeStateLabels[listing.state]} ·{" "}
                  {listing.audience === "CHURCH"
                    ? "Church audience"
                    : "Public audience"}
                </p>
                <h2 className="break-words text-2xl">
                  <Link
                    prefetch={false}
                    className="underline"
                    href={`/platform/exchange/${listing.id}${mine ? "/edit" : ""}?${new URLSearchParams({ returnTo: current })}`}
                  >
                    {listing.title || "Untitled private draft"}
                  </Link>
                </h2>
                <p className="font-semibold">
                  <ExchangePrice listing={listing} />
                </p>
                <p className="whitespace-pre-wrap break-words">
                  {listing.description}
                </p>
                {listing.distanceBandKm !== null && (
                  <p className="text-sm">
                    Within about {listing.distanceBandKm} km of the selected
                    town center
                  </p>
                )}
                <p className="text-sm text-gc-muted">
                  {listing.placeLabel ||
                    (listing.country
                      ? discoveryCountryLabel(listing.country)
                      : "Area not entered")}{" "}
                  ·{" "}
                  {listing.ownerChurch?.name ??
                    listing.owner?.name ??
                    "Listing owner unavailable"}
                </p>
              </li>
            ))}
          </ul>
          {result.after && (
            <a
              className="gc-button gc-button-quiet"
              href={`${path}?${new URLSearchParams({ ...Object.fromEntries(navigationFilters), after: result.after })}`}
            >
              More listings
            </a>
          )}
        </div>
      );
      content = user ? (
        <PrivateSnapshotGuard
          owner={user.id}
          url={readUrl}
          checksum={exchangeChecksum(result)}
          label="your listings"
        >
          {rows}
        </PrivateSnapshotGuard>
      ) : (
        <TopicReadBoundary
          owner={null}
          url={readUrl}
          checksum={exchangeChecksum(result)}
          label="listing"
        >
          {rows}
        </TopicReadBoundary>
      );
    } catch (error) {
      content = <ExchangeUnavailable error={error} href={retryHref} />;
    }
  return (
    <PlatformShell user={user}>
      <section className="container-shell space-y-6 py-8 sm:py-10">
        <header className="space-y-3">
          <h1 className="text-4xl">{mine ? "My listings" : "Exchange"}</h1>
          <p>
            {mine
              ? "Manage personal listings and church listings covered by your current Exchange duties. Drafts and archived listings stay here."
              : "Find items, requests and skilled help. Review each listing’s details and area, then check whether private inquiries are available."}
          </p>
        </header>
        <ExchangeNavigation />
        {content}
      </section>
    </PlatformShell>
  );
}
export async function ExchangeEditorPage({
  id,
  returnTo,
  pantryCategory
}: {
  id?: string;
  returnTo?: unknown;
  pantryCategory?: string;
}) {
  const user = await getCurrentPlatformUser(),
    path = id ? `/platform/exchange/${id}/edit` : `/platform/exchange/new${pantryCategory ? `?pantryCategory=${encodeURIComponent(pantryCategory)}` : ""}`;
  let content;
  if (!user) content = <ExchangeAccountLinks next={path} />;
  else
    try {
      const [access, initial] = await Promise.all([
        exchangeContextPage(),
        id ? exchangeListingPage(id, true) : Promise.resolve(null)
      ]);
      const seed = !id && pantryCategory ? (await pantryPage({ view: "replenish", id: pantryCategory })).replenishmentSeed : undefined;
      content = (
        <>
          {seed && <p>Review a new Church Need using only this category’s public name and unit. Choose quantities and details yourself. After publication, return to the hub and deliberately link the active Need. Recipient histories and pickup details are never copied.</p>}
          <ExchangeEditor
            key={`${user.id}:${id ?? "new"}`}
            access={access}
            initial={initial}
            replenishmentSeed={seed}
          />
          {id && initial?.listing.intent === "CHURCH_NEED" && (
            <Link
              prefetch={false}
              className="gc-button"
              href={`/platform/exchange/${id}/needs`}
            >
              Configure need actions and commitments
            </Link>
          )}
          {id && !initial?.structuredNeed && (
            <ExchangeContactRegion owner={user.id} listingId={id} />
          )}
        </>
      );
    } catch (error) {
      content = <ExchangeUnavailable error={error} href={path} />;
    }
  return (
    <PlatformShell user={user}>
      <section className="container-shell py-8 sm:py-10">
        <div className="mx-auto max-w-3xl space-y-6">
          <h1 className="text-4xl">
            {id ? "Manage listing" : "Create a listing"}
          </h1>
          <ExchangeNavigation />
          {typeof returnTo === "string" && (
            <Link
              prefetch={false}
              className="inline-flex min-h-11 items-center underline"
              href={exchangeReturnHref(returnTo, "/platform/exchange/mine")}
            >
              Return to listing results
            </Link>
          )}
          {content}
        </div>
      </section>
    </PlatformShell>
  );
}

async function ExchangeSearchSaveRegion({
  owner,
  query,
  searchId
}: {
  owner: string;
  query: import("@/lib/platform/exchange-options").ExchangeSearchQuery;
  searchId?: string;
}) {
  if (!searchId) return <ExchangeSaveSearchForm owner={owner} query={query} />;
  try {
    const result = await exchangeSavedPage({ view: "search", searchId });
    if (result.ownerId !== owner)
      throw new PortalError(
        401,
        "Your sign-in changed. Reload current choices."
      );
    return (
      <PrivateSnapshotGuard
        owner={owner}
        url={`/api/platform/exchange?${new URLSearchParams({ view: "search", searchId })}`}
        checksum={exchangeChecksum(result)}
        label="saved search"
      >
        <ExchangeSaveSearchForm
          key={`${searchId}:${result.searches?.[0].version}`}
          owner={owner}
          query={query}
          existing={result.searches?.[0]}
        />
      </PrivateSnapshotGuard>
    );
  } catch (error) {
    return (
      <ExchangeUnavailable
        error={error}
        href="/platform/exchange/saved?view=searches"
      />
    );
  }
}

export async function ExchangeSavedPage({ query }: { query: ExchangeQuery }) {
  const user = await getCurrentPlatformUser(),
    path = "/platform/exchange/saved";
  let content;
  if (!user) content = <ExchangeAccountLinks next={path} />;
  else
    try {
      if (
        Object.keys(query).some((key) => !["view", "after"].includes(key)) ||
        (query.view &&
          !["favorites", "searches"].includes(query.view as string))
      )
        throw new PortalError(
          400,
          "Choose favorite listings or named searches."
        );
      const view = query.view === "searches" ? "searches" : "favorites";
      const result = await exchangeSavedPage({ view, after: query.after });
      const params = new URLSearchParams({
        view,
        ...(query.after ? { after: postId(query.after) } : {})
      });
      content = (
        <PrivateSnapshotGuard
          owner={user.id}
          url={`/api/platform/exchange?${params}`}
          checksum={exchangeChecksum(result)}
          label="saved Exchange choices"
        >
          <ExchangeSavedItems
            owner={user.id}
            result={result}
            view={view}
            returnHref={`${path}?${params}`}
          />
        </PrivateSnapshotGuard>
      );
    } catch (error) {
      content = <ExchangeUnavailable error={error} href={path} />;
    }
  return (
    <PlatformShell user={user}>
      <section className="container-shell space-y-6 py-8 sm:py-10">
        <h1 className="text-4xl">Saved listings and searches</h1>
        <p>
          These choices belong to your account. Listing access is checked again
          when you open them.
        </p>
        <ExchangeNavigation />
        {content}
      </section>
    </PlatformShell>
  );
}
