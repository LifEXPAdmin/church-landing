"use client";
import { useState } from "react";
import { DiscoveryPlacePicker } from "./discovery-place-picker";
import { portalInputClass } from "./portal-action-form";
export function ExchangeFilters({
  path,
  intent,
  country: initialCountry,
  placeId: initialPlace
}: {
  path: string;
  intent?: string;
  country?: string;
  placeId?: number;
}) {
  const [country, setCountry] = useState(initialCountry ?? null),
    [placeId, setPlaceId] = useState(initialPlace ?? null);
  return (
    <form
      action={path}
      className="space-y-4 rounded-xl border border-gc-divider p-4"
      aria-label="Filter Exchange listings"
    >
      <label className="block space-y-2">
        <span>Listing type</span>
        <select
          name="intent"
          defaultValue={intent ?? ""}
          className={portalInputClass}
        >
          <option value="">Free and for sale</option>
          <option value="FREE">Free</option>
          <option value="SALE">For sale</option>
        </select>
      </label>
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
