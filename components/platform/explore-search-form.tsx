"use client";

import {
  searchCategories,
  type SearchCategory
} from "@/lib/platform/search-navigation";
import { POST_TOPICS } from "@/lib/platform/post-options";
import { SearchChurchFilter } from "./search-church-filter";
import { useState } from "react";
import { Search } from "lucide-react";
import { churchDiscoveryHref } from "@/lib/platform/church-search";

export function ExploreSearchForm({
  query,
  category = "posts",
  topic,
  churchId,
  after
}: {
  query: string;
  category?: SearchCategory;
  topic?: string;
  churchId?: string;
  after?: string;
}) {
  const [kind, setKind] = useState<SearchCategory>(category);
  const [value, setValue] = useState(query);
  const [selectedTopic, setSelectedTopic] = useState(topic ?? "");
  const [selectedChurch, setSelectedChurch] = useState(churchId ?? "");
  const [filtersOpen, setFiltersOpen] = useState(Boolean(topic || churchId));
  // Keyed by the server query so Back and new searches restore their own input.
  return (
    <form action="/platform/search" method="get" role="search" className="mt-6">
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
          className="ml-3 rounded border border-gc-divider bg-gc-canvas p-2"
          value={kind}
          onChange={(e) => setKind(e.target.value as SearchCategory)}
        >
          {searchCategories.map((c) => (
            <option key={c} value={c}>
              {c[0].toUpperCase() + c.slice(1)}
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
          {["posts", "events"].includes(kind) ? (
            <SearchChurchFilter
              value={selectedChurch}
              onChange={setSelectedChurch}
            />
          ) : (
            <p>No additional filters for this category.</p>
          )}
          <button
            type="button"
            className="gc-button gc-button-quiet"
            onClick={() => {
              setSelectedTopic("");
              setSelectedChurch("");
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
          maxLength={200}
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
          if (selectedChurch && ["posts", "events"].includes(kind))
            params.set("churchId", selectedChurch);
          if (
            after &&
            query === value.trim() &&
            kind === category &&
            selectedTopic === (topic ?? "") &&
            selectedChurch === (churchId ?? "")
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
    </form>
  );
}
