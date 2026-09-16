"use client";
import { useId, useState } from "react";
import {
  exchangeIntentLabels,
  exchangeItemCategoryLabels,
  exchangeServiceCategoryLabels,
  exchangeCategoryLabels,
  exchangeConditionLabels,
  exchangeStateLabels,
  exchangeSortLabels,
  exchangePriceBasisLabels,
  exchangeAvailabilityLabels,
  exchangeCurrencies,
  exchangePriceText,
  exchangeSearchParams,
  type ExchangeSearchQuery
} from "@/lib/platform/exchange-options";
import {
  DISCOVERY_RADII,
  discoveryCountryLabel
} from "@/lib/platform/discovery-options";
import { DiscoveryPlacePicker } from "./discovery-place-picker";
import { portalInputClass } from "./portal-action-form";

export function ExchangeFilters({
  path,
  query,
  churches,
  savedSearch
}: {
  path: string;
  query: ExchangeSearchQuery;
  churches: { id: string; name: string }[];
  savedSearch?: string;
}) {
  const id = useId();
  const [country, setCountry] = useState(query.country ?? null),
    [placeId, setPlaceId] = useState(query.placeId ?? null),
    [radius, setRadius] = useState(String(query.radiusKm ?? "")),
    [scope, setScope] = useState(query.scope ?? "all"),
    [free, setFree] = useState(!!query.freeOnly),
    [sort, setSort] = useState(query.sort ?? "newest");
  const categories =
    query.intent === "SERVICE"
      ? exchangeServiceCategoryLabels
      : query.intent
        ? exchangeItemCategoryLabels
        : exchangeCategoryLabels;
  const href = (value: ExchangeSearchQuery) => {
    const params = exchangeSearchParams(value);
    if (savedSearch) params.set("savedSearch", savedSearch);
    return path + (params.size ? "?" + params : "");
  };
  const typeHref = (intent: string) => {
    const next = {
      ...query,
      intent: intent as ExchangeSearchQuery["intent"],
      category: undefined
    };
    if (intent && intent !== "SALE" && intent !== "SERVICE") {
      next.currency =
        next.basis =
        next.minPriceMinor =
        next.maxPriceMinor =
          undefined;
      if (next.sort?.startsWith("price-")) next.sort = undefined;
    }
    if (intent === "SALE") next.freeOnly = undefined;
    return href(next);
  };
  const remove = (key: string) => {
    const next = { ...query };
    if (key === "price") {
      next.currency =
        next.basis =
        next.minPriceMinor =
        next.maxPriceMinor =
          undefined;
      if (next.sort?.startsWith("price-")) next.sort = undefined;
    } else if (key === "scope") {
      next.scope = next.churchId = undefined;
    } else {
      delete next[key as keyof ExchangeSearchQuery];
      if (key === "country") next.placeId = undefined;
      if (key === "country" || key === "placeId") next.radiusKm = undefined;
      if (
        ["country", "placeId", "radiusKm"].includes(key) &&
        next.sort === "nearest"
      )
        next.sort = undefined;
    }
    return href(next);
  };
  const chips: [string, string][] = [];
  if (query.q) chips.push(["q", `Search: ${query.q}`]);
  if (query.intent) chips.push(["intent", exchangeIntentLabels[query.intent]]);
  if (query.category)
    chips.push(["category", exchangeCategoryLabels[query.category]]);
  if (query.condition)
    chips.push(["condition", exchangeConditionLabels[query.condition]]);
  if (query.state) chips.push(["state", exchangeStateLabels[query.state]]);
  if (query.availability && query.availability !== "ACTIVE")
    chips.push([
      "availability",
      exchangeAvailabilityLabels[query.availability]
    ]);
  if (query.freeOnly) chips.push(["freeOnly", "Free only"]);
  if (query.currency && query.basis)
    chips.push([
      "price",
      `${query.currency}, ${exchangePriceBasisLabels[query.basis]}${query.minPriceMinor !== undefined ? ", minimum " + exchangePriceText(query.minPriceMinor, query.currency) : ""}${query.maxPriceMinor !== undefined ? ", maximum " + exchangePriceText(query.maxPriceMinor, query.currency) : ""}`
    ]);
  if (query.scope && query.scope !== "all")
    chips.push([
      "scope",
      query.scope === "public"
        ? "Public audience"
        : (churches.find((church) => church.id === query.churchId)?.name ??
          "Selected church unavailable")
    ]);
  if (query.country)
    chips.push(["country", discoveryCountryLabel(query.country)]);
  if (query.placeId)
    chips.push([
      "placeId",
      query.radiusKm ? "Selected town center" : "Selected town only"
    ]);
  if (query.radiusKm)
    chips.push(["radiusKm", `Within about ${query.radiusKm} km`]);
  if (query.sort && query.sort !== "newest")
    chips.push(["sort", exchangeSortLabels[query.sort]]);
  const select = (
    name: string,
    label: string,
    entries: Record<string, string>,
    initial = "",
    empty = "Any"
  ) => (
    <label className="block min-w-0 space-y-2" htmlFor={`${id}-${name}`}>
      <span id={`${id}-${name}-label`}>{label}</span>
      <select
        id={`${id}-${name}`}
        aria-labelledby={`${id}-${name}-label`}
        name={name}
        defaultValue={initial}
        className={portalInputClass}
      >
        <option value="">{empty}</option>
        {Object.entries(entries).map(([key, text]) => (
          <option key={key} value={key}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <form
      action={path}
      className="space-y-4 rounded-xl border border-gc-divider p-4"
      aria-label="Filter Exchange listings"
    >
      <label className="block space-y-2" htmlFor={`${id}-search`}>
        <span>Search listings</span>
        <input
          id={`${id}-search`}
          type="search"
          name="q"
          minLength={2}
          maxLength={120}
          defaultValue={query.q ?? ""}
          className={portalInputClass}
        />
      </label>
      <nav aria-label="Listing types" className="flex flex-wrap gap-2">
        {[["", "All types"], ...Object.entries(exchangeIntentLabels)].map(
          ([key, label]) => (
            <a
              key={key}
              href={typeHref(key)}
              aria-current={(query.intent ?? "") === key ? "page" : undefined}
              className={`gc-button ${(query.intent ?? "") === key ? "" : "gc-button-quiet"}`}
            >
              {label}
            </a>
          )
        )}
      </nav>
      {savedSearch && (
        <input type="hidden" name="savedSearch" value={savedSearch} />
      )}
      <input type="hidden" name="intent" value={query.intent ?? ""} />
      {chips.length > 0 && (
        <ul aria-label="Applied filters" className="flex flex-wrap gap-2">
          {chips.map(([key, label]) => (
            <li key={key} className="max-w-full">
              <a
                href={remove(key)}
                className="inline-flex min-h-11 max-w-full items-center gap-2 break-words rounded-full border border-gc-divider px-3 py-2 text-sm"
                aria-label={`Remove filter: ${label}`}
              >
                {label} <span aria-hidden="true">×</span>
              </a>
            </li>
          ))}
        </ul>
      )}
      <details
        className="space-y-4"
        open={chips.some(([key]) => !["q", "intent"].includes(key))}
      >
        <summary className="min-h-11 cursor-pointer py-3 font-semibold">
          More filters and sorting
        </summary>
        <fieldset className="min-w-0 space-y-2">
          <legend className="font-semibold">Category</legend>
          <div className="flex flex-wrap gap-2">
            {[["", "All categories"], ...Object.entries(categories)].map(
              ([key, label]) => (
                <label
                  key={key}
                  className="relative inline-flex min-h-11 cursor-pointer items-center rounded-full border border-gc-divider px-3 py-2 text-sm focus-within:outline focus-within:outline-2 focus-within:outline-gc-accent has-[:checked]:border-gc-accent has-[:checked]:font-semibold"
                >
                  <input
                    type="radio"
                    className="sr-only"
                    name="category"
                    value={key}
                    defaultChecked={(query.category ?? "") === key}
                  />
                  {label}
                </label>
              )
            )}
            {query.category && !Object.hasOwn(categories, query.category) && (
              <label className="inline-flex min-h-11 items-center gap-2">
                <input
                  type="radio"
                  name="category"
                  value={query.category}
                  defaultChecked
                />
                Previous category does not match this type
              </label>
            )}
          </div>
        </fieldset>
        <div className="grid min-w-0 gap-4 sm:grid-cols-2">
          {select(
            "condition",
            "Item condition",
            exchangeConditionLabels,
            query.condition
          )}
          {query.mine
            ? select(
                "state",
                "Listing status",
                exchangeStateLabels,
                query.state,
                "All owned statuses"
              )
            : select(
                "availability",
                "Availability",
                { RESERVED: "Reserved", ALL: "Available and reserved" },
                query.availability === "ACTIVE" ? "" : query.availability,
                "Available now"
              )}
        </div>
        <fieldset className="min-w-0 space-y-3">
          <legend className="font-semibold">Audience</legend>
          <label className="block space-y-2" htmlFor={`${id}-scope`}>
            <span id={`${id}-scope-label`}>Visibility</span>
            <select
              id={`${id}-scope`}
              aria-labelledby={`${id}-scope-label`}
              name="scope"
              value={scope}
              onChange={(event) => setScope(event.target.value as typeof scope)}
              className={portalInputClass}
            >
              <option value="all">All permitted listings</option>
              <option value="public">Public audience</option>
              <option value="church" disabled={!churches.length}>
                One of my churches
              </option>
            </select>
          </label>
          {scope === "church" &&
            select(
              "churchId",
              "Church-only audience",
              Object.fromEntries(
                churches.map((church) => [church.id, church.name])
              ),
              query.churchId,
              "Choose your church"
            )}
        </fieldset>
        <fieldset className="min-w-0 space-y-3">
          <legend className="font-semibold">Price</legend>
          <label className="inline-flex min-h-11 items-center gap-2">
            <input
              type="checkbox"
              name="freeOnly"
              value="1"
              checked={free}
              onChange={(event) => {
                setFree(event.target.checked);
                if (event.target.checked && sort.startsWith("price-"))
                  setSort("newest");
              }}
            />
            Free items and free help only
          </label>
          <fieldset
            disabled={free}
            className="grid min-w-0 gap-4 disabled:opacity-60 sm:grid-cols-2"
          >
            <legend className="sr-only">Paid-price comparison</legend>
            {select(
              "currency",
              "Currency",
              Object.fromEntries(
                Object.entries(exchangeCurrencies).map(([key, value]) => [
                  key,
                  value.label
                ])
              ),
              query.currency,
              "Choose currency"
            )}
            {select(
              "basis",
              "Price basis",
              exchangePriceBasisLabels,
              query.basis,
              "Choose price basis"
            )}
            {(["min", "max"] as const).map((bound) => (
              <label
                key={bound}
                className="block min-w-0 space-y-2"
                htmlFor={`${id}-${bound}-price`}
              >
                <span>
                  {bound === "min" ? "Minimum price" : "Maximum price"}
                </span>
                <input
                  id={`${id}-${bound}-price`}
                  name={`${bound}Price`}
                  inputMode="decimal"
                  maxLength={16}
                  className={portalInputClass}
                  defaultValue={
                    query.currency && query[`${bound}PriceMinor`] !== undefined
                      ? exchangePriceText(
                          query[`${bound}PriceMinor`]!,
                          query.currency
                        )
                      : ""
                  }
                />
              </label>
            ))}
          </fieldset>
          <p className="text-sm text-gc-muted">
            Choose a currency and price basis together. Prices are not
            converted. An hourly rate is compared only with hourly rates.
          </p>
        </fieldset>
        <fieldset className="min-w-0 space-y-3">
          <legend className="font-semibold">Approximate area</legend>
          <p className="text-sm">
            Choose a country and town. This does not change your profile
            location.
          </p>
          <DiscoveryPlacePicker
            country={country}
            placeId={placeId}
            onCountry={(value) => {
              setCountry(value);
              setPlaceId(null);
              setRadius("");
              if (sort === "nearest") setSort("newest");
            }}
            onPlace={(value) => {
              setPlaceId(value);
              if (!value) {
                setRadius("");
                if (sort === "nearest") setSort("newest");
              }
            }}
          />
          <input type="hidden" name="country" value={country ?? ""} />
          <input type="hidden" name="placeId" value={placeId ?? ""} />
          <label className="block space-y-2" htmlFor={`${id}-radius`}>
            <span id={`${id}-radius-label`}>Distance from selected town</span>
            <select
              id={`${id}-radius`}
              aria-labelledby={`${id}-radius-label`}
              name="radiusKm"
              value={radius}
              disabled={!placeId}
              onChange={(event) => {
                setRadius(event.target.value);
                if (!event.target.value && sort === "nearest")
                  setSort("newest");
              }}
              className={portalInputClass}
            >
              <option value="">Selected town only</option>
              {DISCOVERY_RADII.map((value) => (
                <option key={value} value={value}>
                  Within about {value} km
                </option>
              ))}
            </select>
          </label>
          <p className="text-sm text-gc-muted">
            Distance uses named town centers within the selected country, not
            homes or travel routes. Near a border, choose the other country to
            search there.
          </p>
        </fieldset>
        <label className="block space-y-2" htmlFor={`${id}-sort`}>
          <span id={`${id}-sort-label`}>Sort listings</span>
          <select
            id={`${id}-sort`}
            aria-labelledby={`${id}-sort-label`}
            name="sort"
            value={sort}
            onChange={(event) => setSort(event.target.value as typeof sort)}
            className={portalInputClass}
          >
            {Object.entries(exchangeSortLabels).map(([key, label]) => (
              <option
                key={key}
                value={key}
                disabled={
                  key === "nearest"
                    ? !placeId || !radius
                    : free && key.startsWith("price-")
                }
              >
                {label}
              </option>
            ))}
          </select>
        </label>
      </details>
      <div className="flex flex-wrap gap-3">
        <button className="gc-button" type="submit">
          Show listings
        </button>
        <a
          className="gc-button gc-button-quiet"
          href={
            savedSearch
              ? `${path}?${new URLSearchParams({ savedSearch })}`
              : path
          }
        >
          Clear filters
        </a>
      </div>
    </form>
  );
}
