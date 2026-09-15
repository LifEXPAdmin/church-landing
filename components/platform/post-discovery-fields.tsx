"use client";
import { useId } from "react";
import type { PostDiscoveryInput } from "@/lib/platform/post-discovery";
import {
  discoveryLanguages,
  DISCOVERY_DENOMINATIONS
} from "@/lib/platform/discovery-options";
import { DiscoveryPlacePicker } from "./discovery-place-picker";
import { portalInputClass } from "./portal-action-form";
export function PostDiscoveryFields({
  value,
  onChange
}: {
  value?: PostDiscoveryInput;
  onChange: (value: PostDiscoveryInput) => void;
}) {
  const id = useId(),
    p = value ?? {
      language: null,
      denomination: null,
      country: null,
      placeId: null,
      shareLocality: false
    };
  return (
    <details className="space-y-3">
      <summary className="cursor-pointer py-2 font-semibold">
        Optional discovery choices
      </summary>
      <p className="text-sm text-gc-muted">
        Describe this post so readers can choose matching feeds. These labels
        follow the post’s audience. They do not change your account beliefs,
        church membership or who can read the post.
      </p>
      <label className="block font-semibold" htmlFor={`${id}-language`}>
        Post language
      </label>
      <select
        id={`${id}-language`}
        className={portalInputClass}
        value={p.language ?? ""}
        onChange={(e) => onChange({ ...p, language: e.target.value || null })}
      >
        <option value="">Unclassified language</option>
        {discoveryLanguages.map((language) => (
          <option key={language.id} value={language.id}>
            {language.name}
          </option>
        ))}
      </select>
      <label className="block font-semibold" htmlFor={`${id}-denomination`}>
        Optional denomination or tradition for this post
      </label>
      <input
        id={`${id}-denomination`}
        className={portalInputClass}
        list={`${id}-traditions`}
        value={p.denomination ?? ""}
        maxLength={80}
        onChange={(e) =>
          onChange({ ...p, denomination: e.target.value || null })
        }
      />
      <datalist id={`${id}-traditions`}>
        {DISCOVERY_DENOMINATIONS.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
      <p className="text-sm text-gc-muted">
        Use your own description or leave it unclassified. Related traditions
        are not inferred.
      </p>
      <DiscoveryPlacePicker
        country={p.country}
        placeId={p.placeId}
        onCountry={(country) =>
          onChange({ ...p, country, placeId: null, shareLocality: false })
        }
        onPlace={(placeId) => onChange({ ...p, placeId, shareLocality: false })}
      />
      <label className="flex min-h-11 items-start gap-2">
        <input
          type="checkbox"
          checked={p.shareLocality}
          onChange={(e) => onChange({ ...p, shareLocality: e.target.checked })}
        />
        <span>
          I choose to share this broad country or town with the post. For a
          public post, anyone can see this locality and it can appear in Local
          discovery.
        </span>
      </label>
      <p className="text-sm text-gc-muted">
        No GPS or personal address is collected. Clearing these fields removes
        the post’s discovery locality.
      </p>
      {(p.country || p.placeId) && (
        <button
          type="button"
          className="gc-button gc-button-quiet"
          onClick={() =>
            onChange({
              ...p,
              country: null,
              placeId: null,
              shareLocality: false
            })
          }
        >
          Clear post locality
        </button>
      )}
    </details>
  );
}
