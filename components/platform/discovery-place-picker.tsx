"use client";
import { useEffect, useId, useRef, useState } from "react";
import { discoveryCountries } from "@/lib/platform/discovery-options";
import { portalInputClass } from "./portal-action-form";
type Place = { id: number; country: string; label: string };
export function DiscoveryPlacePicker({
  country,
  placeId,
  onCountry,
  onPlace,
  disabled = false
}: {
  country: string | null;
  placeId: number | null;
  onCountry: (country: string | null) => void;
  onPlace: (id: number | null) => void;
  disabled?: boolean;
}) {
  const id = useId(),
    generation = useRef(0);
  const [query, setQuery] = useState(""),
    [places, setPlaces] = useState<Place[]>([]),
    [selected, setSelected] = useState<Place | null>(null),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    const seq = ++generation.current;
    setPlaces([]);
    setSelected(null);
    setMessage("");
    setBusy(false);
    if (!country || !placeId) return;
    const controller = new AbortController(),
      timeout = setTimeout(() => controller.abort(), 15000);
    void fetch(
      `/api/platform/discovery?${new URLSearchParams({ view: "place", country, id: String(placeId) })}`,
      { credentials: "omit", cache: "no-store", signal: controller.signal }
    )
      .then(async (response) => {
        const result = await response.json();
        if (
          !response.ok ||
          !result.place ||
          result.place.id !== placeId ||
          result.place.country !== country
        )
          throw Error(result.message ?? "Check this selected town or area.");
        if (generation.current === seq) setSelected(result.place);
      })
      .catch((error) => {
        if (generation.current === seq)
          setMessage(
            error instanceof Error
              ? error.message
              : "Town lookup is unavailable. Keep your selection and retry."
          );
      })
      .finally(() => clearTimeout(timeout));
    return () => {
      // Request generation counter, not a DOM ref.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      generation.current++;
      controller.abort();
      clearTimeout(timeout);
    };
  }, [country, placeId]);
  async function search() {
    if (!country || query.trim().length < 2 || busy) {
      setMessage(
        "Choose a country and enter at least two letters of a town or area."
      );
      return;
    }
    const seq = ++generation.current;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(
        `/api/platform/discovery?${new URLSearchParams({ view: "places", country, q: query.trim() })}`,
        {
          credentials: "omit",
          cache: "no-store",
          signal: AbortSignal.timeout(15000)
        }
      );
      const result = await response.json();
      if (!response.ok || !Array.isArray(result.places))
        throw Error(result.message ?? "Town search was not confirmed.");
      if (generation.current !== seq) return;
      setPlaces(result.places);
      setMessage(
        result.places.length
          ? result.hasMore
            ? "Showing twenty matches. Enter more of the name to narrow the search."
            : "Choose a matching named area."
          : "No matching area in this catalog. Try a nearby larger town or clear the local filter."
      );
    } catch (error) {
      if (generation.current === seq)
        setMessage(
          error instanceof Error
            ? error.message
            : "Town search could not be confirmed. Retry when connected."
        );
    } finally {
      if (generation.current === seq) setBusy(false);
    }
  }
  return (
    <div className="space-y-3">
      <label className="block font-semibold" htmlFor={`${id}-country`}>
        Country
      </label>
      <select
        id={`${id}-country`}
        className={portalInputClass}
        value={country ?? ""}
        disabled={disabled || busy}
        onChange={(e) => {
          onCountry(e.target.value || null);
          setQuery("");
        }}
      >
        <option value="">No country selected</option>
        {discoveryCountries.map((row) => (
          <option key={row.id} value={row.id}>
            {row.name}
          </option>
        ))}
      </select>
      <label className="block font-semibold" htmlFor={`${id}-town`}>
        Find a town or area
      </label>
      <div className="flex flex-wrap gap-2">
        <input
          id={`${id}-town`}
          className={`${portalInputClass} min-w-0 flex-1`}
          value={query}
          maxLength={100}
          disabled={disabled || busy || !country}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void search();
            }
          }}
        />
        <button
          type="button"
          className="gc-button gc-button-quiet"
          disabled={disabled || busy || !country}
          onClick={() => void search()}
        >
          {busy ? "Searching…" : "Find area"}
        </button>
      </div>
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
      {places.length > 0 && (
        <ul className="max-h-60 overflow-y-auto rounded-lg border border-gc-border">
          {places.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className="min-h-11 w-full px-3 py-2 text-left hover:bg-gc-hover"
                disabled={disabled || busy}
                onClick={() => {
                  setPlaces([]);
                  onPlace(p.id);
                }}
              >
                {p.label}
              </button>
            </li>
          ))}
        </ul>
      )}
      {placeId && (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm">
            Selected area: {selected?.label ?? "Checking selected area…"}
          </p>
          <button
            type="button"
            className="min-h-11 underline"
            disabled={disabled || busy}
            onClick={() => onPlace(null)}
          >
            Clear area
          </button>
        </div>
      )}
      <p className="text-sm text-gc-muted">
        Named town centers only. Smaller places may be absent; choose a nearby
        area if needed. Place data:{" "}
        <a
          href="https://www.geonames.org/"
          target="_blank"
          rel="noreferrer"
          className="underline"
        >
          GeoNames
        </a>
        ,{" "}
        <a
          href="https://creativecommons.org/licenses/by/4.0/"
          target="_blank"
          rel="noreferrer"
          className="underline"
        >
          CC BY 4.0
        </a>
        .
      </p>
    </div>
  );
}
