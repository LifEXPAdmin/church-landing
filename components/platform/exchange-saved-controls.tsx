"use client";
import Link from "next/link";
import { usePrivateChoiceAction } from "./use-private-choice-action";
import { useCallback, useId, useRef, useState } from "react";
import {
  EXCHANGE_SAVED_SCHEMA,
  exchangeDisplayPrice,
  exchangeSearchParams,
  type ExchangeSearchQuery
} from "@/lib/platform/exchange-options";
import type { readExchangeSaved } from "@/lib/platform/exchange-saved";
import { portalInputClass } from "./portal-action-form";

type SavedPage = Awaited<ReturnType<typeof readExchangeSaved>>;
type Search = NonNullable<SavedPage["searches"]>[number];
type Favorite = { id: string; version: number; saved: boolean } | null;
const endpoint = "/api/platform/exchange";

export function useExchangeAction(
  owner: string,
  dirty = false,
  onSaved?: (receipt: { id: string; version: number; message: string }) => void,
  protectBack = false
) {
  return usePrivateChoiceAction(endpoint, owner, dirty, onSaved, protectBack);
}

export function ExchangeFavoriteButton({
  owner,
  listingId,
  favorite
}: {
  owner: string;
  listingId: string;
  favorite: Favorite;
}) {
  const command = useExchangeAction(owner);
  return (
    <div className="space-y-2">
      <button
        className="gc-button gc-button-quiet"
        type="button"
        disabled={command.blocked}
        aria-pressed={favorite?.saved ?? false}
        onClick={() =>
          void command.command(
            favorite?.saved
              ? {
                  operation: "favorite-remove",
                  favoriteId: favorite.id,
                  expectedVersion: favorite.version
                }
              : {
                  operation: "favorite-add",
                  listingId,
                  expectedVersion: favorite?.version ?? 0
                }
          )
        }
      >
        {favorite?.saved ? "Remove favorite" : "Save favorite"}
      </button>
      <p className="text-sm text-gc-muted">
        Favorites are private. Saving does not reserve, contact or notify the
        owner.
      </p>
      {command.status}
    </div>
  );
}

export function ExchangeSaveSearchForm({
  owner,
  query,
  existing
}: {
  owner: string;
  query: ExchangeSearchQuery;
  existing?: Search;
}) {
  const id = useId(),
    [name, setName] = useState(existing?.name ?? ""),
    [alerts, setAlerts] = useState(existing?.alerts ?? false);
  const searchId = useRef<string | null>(existing?.id ?? null);
  const criteria = Object.fromEntries(exchangeSearchParams(query));
  const dirty =
    name !== (existing?.name ?? "") || alerts !== (existing?.alerts ?? false);
  const onSaved = useCallback(() => {
    if (!existing) {
      setName("");
      setAlerts(false);
      searchId.current = null;
    }
  }, [existing]);
  const command = useExchangeAction(owner, dirty, onSaved);
  return (
    <details
      className="space-y-3 rounded-xl border border-gc-divider p-4"
      open={!!existing}
    >
      <summary className="min-h-11 cursor-pointer py-2 font-semibold">
        {existing ? "Update this saved search" : "Save this search"}
      </summary>
      <form
        className="space-y-3"
        aria-label={existing ? "Update saved search" : "Save current search"}
        onSubmit={(event) => {
          event.preventDefault();
          if (!searchId.current) searchId.current = crypto.randomUUID();
          void command.command({
            operation: "search-save",
            searchId: searchId.current,
            expectedVersion: existing?.version ?? 0,
            schema: EXCHANGE_SAVED_SCHEMA,
            name,
            criteria,
            alerts
          });
        }}
      >
        <fieldset disabled={command.blocked} className="min-w-0 space-y-3">
          <label className="block space-y-2" htmlFor={`${id}-name`}>
            <span>Search name</span>
            <input
              id={`${id}-name`}
              className={portalInputClass}
              value={name}
              required
              maxLength={80}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label className="flex min-h-11 items-center gap-3">
            <input
              type="checkbox"
              checked={alerts}
              disabled={
                !!query.availability &&
                query.availability !== "ACTIVE" &&
                !alerts
              }
              onChange={(event) => setAlerts(event.target.checked)}
            />
            Alert me about new matching available listings
          </label>
          <p className="text-sm text-gc-muted">
            Saving alone leaves alerts off. Optional alerts appear in Activity;
            phone delivery also requires separate notification and device
            choices. A save starts alerts for future listings only.
          </p>
          {query.availability && query.availability !== "ACTIVE" && (
            <p className="text-sm">
              Choose Available now to enable matching alerts.
            </p>
          )}
          {existing && (
            <p className="text-sm">
              Saving replaces this named search with the filters and sorting
              shown above. Its alert interval restarts from this save.
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            <button className="gc-button" type="submit">
              {existing ? "Update saved search" : "Save search"}
            </button>
            <Link
              prefetch={false}
              className="gc-button gc-button-quiet"
              href="/platform/exchange/saved?view=searches"
            >
              Manage saved searches
            </Link>
          </div>
        </fieldset>
        {command.status}
      </form>
    </details>
  );
}

export function ExchangeSavedItems({
  owner,
  result,
  view,
  returnHref
}: {
  owner: string;
  result: SavedPage;
  view: "favorites" | "searches";
  returnHref: string;
}) {
  const command = useExchangeAction(owner);
  return (
    <div className="space-y-4">
      <nav aria-label="Saved Exchange choices" className="flex flex-wrap gap-3">
        <Link
          prefetch={false}
          className="gc-button gc-button-quiet"
          aria-current={view === "favorites" ? "page" : undefined}
          href="/platform/exchange/saved"
        >
          Favorite listings
        </Link>
        <Link
          prefetch={false}
          className="gc-button gc-button-quiet"
          aria-current={view === "searches" ? "page" : undefined}
          href="/platform/exchange/saved?view=searches"
        >
          Named searches
        </Link>
        <Link
          prefetch={false}
          className="inline-flex min-h-11 items-center underline"
          href="/platform/settings/notifications"
        >
          Notification choices
        </Link>
      </nav>
      {command.status}
      {view === "favorites" ? (
        <>
          {!result.favorites?.length && (
            <p>
              No favorite listings on this page. Open an available listing and
              choose Save favorite.
            </p>
          )}
          <ul className="space-y-3">
            {result.favorites?.map((favorite) => (
              <li
                key={favorite.id}
                className="space-y-3 rounded-xl border border-gc-divider p-4"
              >
                {favorite.listing ? (
                  <>
                    <h2 className="break-words text-2xl">
                      <Link
                        prefetch={false}
                        className="underline"
                        href={`/platform/exchange/${favorite.listing.id}?returnTo=${encodeURIComponent(returnHref)}`}
                      >
                        {favorite.listing.title}
                      </Link>
                    </h2>
                    <p>
                      {exchangeDisplayPrice(favorite.listing)} ·{" "}
                      {favorite.listing.state === "ACTIVE"
                        ? "Available"
                        : favorite.listing.state === "RESERVED"
                          ? "Reserved"
                          : "Closed"}
                    </p>
                    <p className="text-sm">{favorite.listing.placeLabel}</p>
                  </>
                ) : (
                  <>
                    <h2 className="text-xl">Listing unavailable</h2>
                    <p>
                      The listing or your current access changed. You can still
                      remove this saved reference.
                    </p>
                  </>
                )}
                <button
                  className="gc-button gc-button-quiet"
                  type="button"
                  disabled={command.blocked}
                  onClick={() =>
                    void command.command({
                      operation: "favorite-remove",
                      favoriteId: favorite.id,
                      expectedVersion: favorite.version
                    })
                  }
                >
                  Remove favorite
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <>
          {!result.searches?.length && (
            <p>
              No named searches on this page. Set your browse filters and choose
              Save this search.
            </p>
          )}
          <ul className="space-y-3">
            {result.searches?.map((search) => {
              const parameters = new URLSearchParams(search.criteria);
              parameters.set("savedSearch", search.id);
              return (
                <li
                  key={search.id}
                  className="space-y-3 rounded-xl border border-gc-divider p-4"
                >
                  <h2 className="break-words text-2xl">{search.name}</h2>
                  <p>
                    {search.alerts
                      ? "Matching alerts are on, subject to your notification choices."
                      : "Matching alerts are off."}
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <Link
                      prefetch={false}
                      className="gc-button"
                      href={search.href}
                    >
                      Open saved results
                    </Link>
                    <Link
                      prefetch={false}
                      className="gc-button gc-button-quiet"
                      href={`/platform/exchange?${parameters}`}
                    >
                      Edit filters, name or alerts
                    </Link>
                    <button
                      className="gc-button gc-button-quiet"
                      type="button"
                      disabled={command.blocked}
                      onClick={() => {
                        if (
                          confirm(
                            `Remove saved search “${search.name}” and stop its alerts?`
                          )
                        )
                          void command.command({
                            operation: "search-delete",
                            searchId: search.id,
                            expectedVersion: search.version
                          });
                      }}
                    >
                      Remove search
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
      {result.after && (
        <Link
          prefetch={false}
          className="gc-button gc-button-quiet"
          href={`/platform/exchange/saved?${new URLSearchParams({ view, after: result.after })}`}
        >
          More saved choices
        </Link>
      )}
    </div>
  );
}
