import { createHash } from "node:crypto";
import Link from "next/link";
import { PlatformShell } from "./platform-shell";
import { PrivateSnapshotGuard } from "./private-snapshot-guard";
import { TopicReadBoundary } from "./topic-read-boundary";
import { ExchangeEditor } from "./exchange-editor";
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
  exchangeDisplayPrice
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
export type ExchangeQuery = {
  intent?: string | string[];
  country?: string | string[];
  placeId?: string | string[];
  after?: string | string[];
  q?: string | string[];
  category?: string | string[];
  state?: string | string[];
};
export async function ExchangeList({
  query: params,
  mine = false
}: {
  query: ExchangeQuery;
  mine?: boolean;
}) {
  const user = await getCurrentPlatformUser(),
    path = mine ? "/platform/exchange/mine" : "/platform/exchange";
  let content;
  if (mine && !user) content = <ExchangeAccountLinks next={path} />;
  else
    try {
      const { intent, country, placeId, after, q, category, state } =
        parseExchangeListQuery(params, mine);
      const result = await exchangeListPage({
        mine,
        intent,
        country,
        placeId,
        after,
        q,
        category,
        state
      });
      const filters = new URLSearchParams({
        ...(q ? { q } : {}),
        ...(category ? { category } : {}),
        ...(state ? { state } : {}),
        ...(intent ? { intent } : {}),
        ...(country ? { country } : {}),
        ...(placeId ? { placeId: String(placeId) } : {})
      });
      const readUrl = `/api/platform/exchange?${new URLSearchParams({ ...Object.fromEntries(filters), view: mine ? "mine" : "list", ...(after ? { after } : {}) })}`;
      const first = path + (filters.size ? "?" + filters : "");
      const rows = (
        <div className="space-y-4">
          <ExchangeFilters
            key={filters.toString()}
            path={path}
            intent={intent}
            country={country}
            placeId={placeId}
            mine={mine}
            q={q}
            category={category}
            state={state}
          />
          {after && (
            <a href={first} className="gc-button gc-button-quiet">
              Newest listings
            </a>
          )}
          {!result.listings.length && (
            <p>
              {mine
                ? "No saved listings match these choices. Create a private draft to begin."
                : "No available listings match these choices. Clear the filters or check again later."}
            </p>
          )}
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
                    href={`/platform/exchange/${listing.id}${mine ? "/edit" : ""}`}
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
      content = <ExchangeUnavailable error={error} href={path} />;
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
export async function ExchangeEditorPage({ id }: { id?: string }) {
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
          {content}
        </div>
      </section>
    </PlatformShell>
  );
}
