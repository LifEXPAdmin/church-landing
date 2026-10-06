"use client";

import {
  searchCategories,
  searchQueryLimit,
  searchCategoryLabel,
  searchChurchFilter,
  type SearchCategory
} from "@/lib/platform/search-navigation";
import { POST_TOPICS } from "@/lib/platform/post-options";
import { SearchChurchFilter } from "./search-church-filter";
import { useRef, useState } from "react";
import { Search } from "lucide-react";
import { churchDiscoveryHref } from "@/lib/platform/church-search";
import { RecentSearches, useRecentSearches } from "./recent-searches";
import { DiscoveryPlacePicker } from "./discovery-place-picker";
import { DISCOVERY_RADII } from "@/lib/platform/discovery-options";

export function ExploreSearchForm({
  owner = null,
  query,
  category = "posts",
  topic,
  churchId,
  after,
  country,
  placeId,
  radiusKm
}: {
  owner?: string | null;
  query: string;
  category?: SearchCategory;
  topic?: string;
  churchId?: string;
  after?: string;
  country?: string;
  placeId?: string;
  radiusKm?: string;
}) {
  const [kind, setKind] = useState<SearchCategory>(category);
  const [value, setValue] = useState(query);
  const [selectedTopic, setSelectedTopic] = useState(topic ?? "");
  const [selectedChurch, setSelectedChurch] = useState(churchId ?? "");
  const [selectedCountry, setSelectedCountry] = useState(country ?? "");
  const [selectedPlace, setSelectedPlace] = useState(placeId ?? "");
  const [selectedRadius, setSelectedRadius] = useState(radiusKm ?? "");
  const [filtersOpen, setFiltersOpen] = useState(
    Boolean(topic || churchId || country || placeId || radiusKm)
  );
  const history = useRecentSearches(owner);
  const submitting = useRef(false);
  // Keyed by the server query so Back and new searches restore their own input.
  return (
    <form
      action="/platform/search"
      method="get"
      role="search"
      className="mt-6"
      onSubmit={async (event) => {
        if (!owner || !history.state?.enabled) return;
        event.preventDefault();
        if (submitting.current) return;
        submitting.current = true;
        const form = event.currentTarget;
        const destination = new URL(form.action);
        const fields = new URLSearchParams();
        new FormData(form).forEach((entry, name) => {
          if (typeof entry === "string") fields.append(name, entry);
        });
        destination.search = fields.toString();
        // Recording is optional: storage/sign-in failures must not break Search.
        await Promise.race([
          history.run({ action: "record", q: value, kind }),
          new Promise<void>((resolve) => window.setTimeout(resolve, 1500))
        ]);
        submitting.current = false;
        window.location.assign(destination.href);
      }}
    >
      <label htmlFor="explore-search" className="block font-semibold">
        Search the community
      </label>
      <p id="explore-search-hint" className="mb-3 mt-1 text-gc-muted">
        Search current content you can view. People results contain public
        author labels; member profiles require sign-in.
      </p>
      <label className="mb-3 block">
        Category
        <select
          name="kind"
          aria-label="Search category"
          className="block max-w-full rounded border border-gc-divider bg-gc-canvas p-2"
          value={kind}
          onChange={(e) => setKind(e.target.value as SearchCategory)}
        >
          {searchCategories.map((c) => (
            <option key={c} value={c}>
              {searchCategoryLabel(c)}
            </option>
          ))}
        </select>
      </label>
      <details
        className="mb-4 rounded border border-gc-divider p-3"
        open={filtersOpen}
        onToggle={(e) => setFiltersOpen(e.currentTarget.open)}
      >
        <summary className="min-h-11 cursor-pointer py-2 font-semibold">
          Search filters
        </summary>
        <div className="space-y-3">
          {kind === "posts" && (
            <label className="block">
              Topic
              <select
                name="topic"
                aria-label="Search topic"
                className="ml-3 max-w-full rounded border border-gc-divider bg-gc-canvas p-2"
                value={selectedTopic}
                onChange={(e) => setSelectedTopic(e.target.value)}
              >
                <option value="">All topics</option>
                {POST_TOPICS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
          )}
          {searchChurchFilter(kind) ? (
            <SearchChurchFilter
              value={selectedChurch}
              onChange={setSelectedChurch}
            />
          ) : kind !== "listings" ? (
            <p>No additional filters for this category.</p>
          ) : null}
          {kind === "listings" && (
            <div className="space-y-3">
              <p>
                Limit listings to a country or named town. Distance uses the
                town center, not a person&apos;s address.
              </p>
              <DiscoveryPlacePicker
                country={selectedCountry || null}
                placeId={selectedPlace ? Number(selectedPlace) : null}
                onCountry={(next) => {
                  setSelectedCountry(next ?? "");
                  setSelectedPlace("");
                  setSelectedRadius("");
                }}
                onPlace={(next) => {
                  setSelectedPlace(next === null ? "" : String(next));
                  setSelectedRadius("");
                }}
              />
              <input type="hidden" name="country" value={selectedCountry} />
              <input type="hidden" name="placeId" value={selectedPlace} />
              <label className="block">
                Approximate distance
                <select
                  name="radiusKm"
                  aria-label="Approximate listing distance"
                  className="block max-w-full rounded border border-gc-divider bg-gc-canvas p-2"
                  value={selectedRadius}
                  disabled={!selectedPlace}
                  onChange={(e) => setSelectedRadius(e.target.value)}
                >
                  <option value="">Selected town only</option>
                  {DISCOVERY_RADII.map((radius) => (
                    <option key={radius} value={radius}>
                      Within {radius} km of town center
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
          <button
            type="button"
            className="gc-button gc-button-quiet"
            onClick={() => {
              setSelectedTopic("");
              setSelectedChurch("");
              setSelectedCountry("");
              setSelectedPlace("");
              setSelectedRadius("");
            }}
          >
            Clear search filters
          </button>
          <p className="text-sm text-gc-muted">
            Select Search to apply changes and start at the first page.
          </p>
        </div>
      </details>
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          id="explore-search"
          name="q"
          type="search"
          maxLength={searchQueryLimit(kind)}
          minLength={kind === "listings" ? 2 : undefined}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          aria-describedby="explore-search-hint"
          placeholder="Names or matching words"
          className="min-w-0 flex-1 rounded-full border border-gc-divider bg-gc-canvas px-5 py-3 outline-none focus:border-gc-action"
        />
        <button type="submit" className="gc-button">
          <Search aria-hidden="true" /> Search
        </button>
      </div>
      <p className="mt-2 text-sm text-gc-muted">
        Up to {searchQueryLimit(kind)} characters for{" "}
        {searchCategoryLabel(kind).toLowerCase()}. Filters apply to the selected
        category.
      </p>
      <a
        className="mt-4 inline-flex min-h-11 items-center text-gc-accent underline"
        href={churchDiscoveryHref(value)}
        onClick={(event) => {
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
            return;
          // Preserve a newly typed query in the source history entry before
          // document navigation, so Back also works without submitting Explore.
          const submittedQuery = value.trim().slice(0, 200);
          const params = new URLSearchParams();
          if (submittedQuery) params.set("q", submittedQuery);
          params.set("kind", kind);
          if (selectedTopic && kind === "posts")
            params.set("topic", selectedTopic);
          if (selectedChurch && searchChurchFilter(kind))
            params.set("churchId", selectedChurch);
          if (kind === "listings") {
            if (selectedCountry) params.set("country", selectedCountry);
            if (selectedPlace) params.set("placeId", selectedPlace);
            if (selectedPlace && selectedRadius)
              params.set("radiusKm", selectedRadius);
          }
          if (
            after &&
            query === value.trim() &&
            kind === category &&
            selectedTopic === (topic ?? "") &&
            selectedChurch === (churchId ?? "") &&
            selectedCountry === (country ?? "") &&
            selectedPlace === (placeId ?? "") &&
            selectedRadius === (radiusKm ?? "")
          )
            params.set("after", after);
          window.history.replaceState(
            null,
            "",
            `/platform/search${params.size ? `?${params}` : ""}`
          );
        }}
      >
        Search churches
      </a>
      <p className="text-sm text-gc-muted">
        Church search uses the first 100 characters.
      </p>
      {owner && <RecentSearches history={history} />}
    </form>
  );
}
