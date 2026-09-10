import Link from "next/link";

export function ChurchSearchForm({ query }: { query: string }) {
  return (
    <form
      action="/platform/churches"
      method="get"
      role="search"
      className="mb-6 max-w-2xl"
    >
      <label htmlFor="church-search" className="block font-semibold">
        Search churches
      </label>
      <p id="church-search-hint" className="mb-3 mt-1 text-gc-muted">
        Search by a name or words in a church’s public description.
      </p>
      <div className="flex flex-wrap gap-3">
        <input
          key={query}
          id="church-search"
          type="search"
          name="q"
          defaultValue={query}
          maxLength={100}
          aria-describedby="church-search-hint"
          className="min-w-0 basis-full rounded-lg border border-gc-border bg-gc-surface p-3 sm:flex-1 sm:basis-0"
        />
        <button type="submit" className="gc-button">
          Search
        </button>
        {query && (
          <Link href="/platform/churches" className="gc-button gc-button-quiet">
            Clear search
          </Link>
        )}
      </div>
    </form>
  );
}
