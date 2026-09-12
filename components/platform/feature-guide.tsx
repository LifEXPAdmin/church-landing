"use client";
import { useState } from "react";
import Link from "next/link";
import { features } from "@/lib/platform/release-content";
export function FeatureGuide() {
  const [query, setQuery] = useState("");
  const selected = features.filter((f) =>
    `${f.name} ${f.category} ${f.description} ${f.steps}`
      .toLowerCase()
      .includes(query.trim().toLowerCase())
  );
  return (
    <>
      <label className="block">
        Search features
        <input
          className="gc-input mt-2"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <p role="status">{selected.length} features</p>
      {[...new Set(selected.map((f) => f.category))].map((category) => (
        <section key={category} className="space-y-4">
          <h2 className="text-2xl">{category}</h2>
          {selected
            .filter((f) => f.category === category)
            .map((f) => (
              <article
                id={f.id}
                key={f.id}
                className="scroll-mt-6 space-y-3 rounded-xl border border-gc-divider bg-gc-surface p-5"
              >
                <h3 className="text-xl">{f.name}</h3>
                <p>{f.description}</p>
                <p>{f.steps}</p>
                <p className="text-sm text-gc-muted">{f.eligibility}</p>
                <Link className="gc-button gc-button-quiet" href={f.href}>
                  Open {f.name}
                </Link>
              </article>
            ))}
        </section>
      ))}
    </>
  );
}
