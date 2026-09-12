"use client";
import { useState } from "react";
import Link from "next/link";
import { features } from "@/lib/platform/release-content";
export function FeatureGuide({
  imagesEnabled = false,
  photoLibraryEnabled = false,
  photoAlbumsEnabled = false
}: {
  imagesEnabled?: boolean;
  photoLibraryEnabled?: boolean;
  photoAlbumsEnabled?: boolean;
}) {
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
          className="gc-input mt-2 block w-full"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <p role="status">
        {selected.length} {selected.length === 1 ? "feature" : "features"}
      </p>
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
                <p className="text-sm text-gc-muted">
                  {f.id === "photo-albums" &&
                  (!photoAlbumsEnabled || !photoLibraryEnabled)
                    ? "Named albums are currently unavailable. Existing photo permissions remain in effect."
                    : f.id === "photo-library" && !photoLibraryEnabled
                      ? "The photo library is currently unavailable. Existing photo permissions remain in effect."
                      : [
                            "profile-photos",
                            "post-photo-management",
                            "photo-library"
                          ].includes(f.id) && !imagesEnabled
                        ? "Photo uploads are currently unavailable. Initials appear when an image cannot be loaded."
                        : f.eligibility}
                </p>
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
