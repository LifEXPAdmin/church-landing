"use client";
import { useId, useState } from "react";
import {
  exchangeIntentLabels,
  exchangeItemCategoryLabels,
  exchangeServiceCategoryLabels,
  exchangeStateLabels
} from "@/lib/platform/exchange-options";
import { DiscoveryPlacePicker } from "./discovery-place-picker";
import { portalInputClass } from "./portal-action-form";
export function ExchangeFilters({
  path,
  intent,
  mine,
  q,
  category,
  state,
  country: initialCountry,
  placeId: initialPlace
}: {
  path: string;
  intent?: string;
  mine: boolean;
  q?: string;
  category?: string;
  state?: string;
  country?: string;
  placeId?: number;
}) {
  const id = useId();
  const [country, setCountry] = useState(initialCountry ?? null),
    [placeId, setPlaceId] = useState(initialPlace ?? null);
  const categories =
    intent === "SERVICE"
      ? exchangeServiceCategoryLabels
      : intent
        ? exchangeItemCategoryLabels
        : { ...exchangeItemCategoryLabels, ...exchangeServiceCategoryLabels };
  const typeHref = (type: string) => {
    const filters = new URLSearchParams({
      ...(type ? { intent: type } : {}),
      ...(q ? { q } : {}),
      ...(state ? { state } : {}),
      ...(initialCountry ? { country: initialCountry } : {}),
      ...(initialPlace ? { placeId: String(initialPlace) } : {})
    });
    return path + (filters.size ? "?" + filters : "");
  };
  return (
    <form
      action={path}
      className="space-y-4 rounded-xl border border-gc-divider p-4"
      aria-label="Filter Exchange listings"
    >
      <label className="block space-y-2" htmlFor={`${id}-search`}>
        <span id={`${id}-search-label`}>Search listings</span>
        <input
          id={`${id}-search`}
          aria-labelledby={`${id}-search-label`}
          type="search"
          name="q"
          minLength={2}
          maxLength={120}
          defaultValue={q ?? ""}
          className={portalInputClass}
        />
      </label>
      <nav aria-label="Listing types" className="flex flex-wrap gap-2">
        {[["", "All types"], ...Object.entries(exchangeIntentLabels)].map(
          ([key, label]) => (
            <a
              key={key}
              href={typeHref(key)}
              aria-current={(intent ?? "") === key ? "page" : undefined}
              className={`gc-button ${(intent ?? "") === key ? "" : "gc-button-quiet"}`}
            >
              {label}
            </a>
          )
        )}
      </nav>
      <input type="hidden" name="intent" value={intent ?? ""} />
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
                  defaultChecked={(category ?? "") === key}
                />
                {label}
              </label>
            )
          )}
          {category && !Object.hasOwn(categories, category) && (
            <label className="inline-flex min-h-11 items-center gap-2">
              <input
                type="radio"
                name="category"
                value={category}
                defaultChecked
              />
              Previous category does not match this type
            </label>
          )}
        </div>
      </fieldset>
      {mine && (
        <label className="block space-y-2" htmlFor={`${id}-status`}>
          <span id={`${id}-status-label`}>Listing status</span>
          <select
            id={`${id}-status`}
            aria-labelledby={`${id}-status-label`}
            name="state"
            defaultValue={state ?? ""}
            className={portalInputClass}
          >
            <option value="">All owned statuses</option>
            {Object.entries(exchangeStateLabels).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
      )}
      <p className="text-sm">
        Optionally choose a country and town. These filters do not change your
        profile location.
      </p>
      <DiscoveryPlacePicker
        country={country}
        placeId={placeId}
        onCountry={(value) => {
          setCountry(value);
          setPlaceId(null);
        }}
        onPlace={setPlaceId}
      />
      <input type="hidden" name="country" value={country ?? ""} />
      <input type="hidden" name="placeId" value={placeId ?? ""} />
      <div className="flex flex-wrap gap-3">
        <button className="gc-button" type="submit">
          Show listings
        </button>
        <a className="gc-button gc-button-quiet" href={path}>
          Clear filters
        </a>
      </div>
    </form>
  );
}
