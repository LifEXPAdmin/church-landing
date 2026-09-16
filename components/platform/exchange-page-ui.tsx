import { createHash } from "node:crypto";
import Link from "next/link";
import { PlatformShell } from "./platform-shell";
import { PrivateSnapshotGuard } from "./private-snapshot-guard";
import { TopicReadBoundary } from "./topic-read-boundary";
import { ExchangeEditor } from "./exchange-editor";
import { ExchangeSearchPosition } from "./exchange-search-position";
import { exchangeReturnHref } from "@/lib/platform/exchange-navigation";
import { ExchangeFilters } from "./exchange-filters";
import { accountEntryHref } from "@/lib/platform/account-entry";
import { PortalError } from "@/lib/platform/portal-policy";
import { getCurrentPlatformUser } from "@/lib/platform/session";
import {
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
        ["/platform/exchange/new", "Create a listing"]
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
      const query = { ...parseExchangeListQuery(params, mine), mine };
      const result = await exchangeListPage(query);
      const filters = exchangeSearchParams(query);
      const readUrl = `/api/platform/exchange?${new URLSearchParams({ ...Object.fromEntries(filters), view: mine ? "mine" : "list", after: result.pageCursor })}`;
      const first = path + (filters.size ? "?" + filters : "");
      retryHref = first;
      const pageFilters = exchangeSearchParams(query, true);
      const current = path + (pageFilters.size ? "?" + pageFilters : "");
      const rows = (
        <div className="space-y-4">
          <ExchangeSearchPosition owner={user?.id ?? null} path={current} />
          <ExchangeFilters
            key={filters.toString()}
            path={path}
            query={query}
            churches={result.churches}
          />
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
              href={`${path}?${new URLSearchParams({ ...Object.fromEntries(filters), after: result.after })}`}
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
              : "Find items, requests and skilled help. Review each listing’s details and area, then use the owner’s existing contact choices."}
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
  returnTo
}: {
  id?: string;
  returnTo?: unknown;
}) {
  const user = await getCurrentPlatformUser(),
    path = id ? `/platform/exchange/${id}/edit` : "/platform/exchange/new";
  let content;
  if (!user) content = <ExchangeAccountLinks next={path} />;
  else
    try {
      const [access, initial] = await Promise.all([
        exchangeContextPage(),
        id ? exchangeListingPage(id, true) : Promise.resolve(null)
      ]);
      content = (
        <ExchangeEditor
          key={`${user.id}:${id ?? "new"}`}
          access={access}
          initial={initial}
        />
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
