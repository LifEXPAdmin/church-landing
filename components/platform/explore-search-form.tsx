"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { churchDiscoveryHref } from "@/lib/platform/church-search";

export function ExploreSearchForm({ query }: { query: string }) {
  const [value, setValue] = useState(query);
  // Keyed by the server query so Back and new searches restore their own input.
  return (
    <form action="/platform/search" method="get" role="search" className="mt-6">
      <label htmlFor="explore-search" className="block font-semibold">
        Search people and posts
      </label>
      <p id="explore-search-hint" className="mb-3 mt-1 text-gc-muted">
        Find names and matching words in posts you can view. Search church pages
        separately below.
      </p>
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          id="explore-search"
          name="q"
          type="search"
          maxLength={200}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          aria-describedby="explore-search-hint"
          placeholder="A person’s name or words in a post"
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
          const query = value.trim().slice(0, 200);
          const params = new URLSearchParams();
          if (query) params.set("q", query);
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
