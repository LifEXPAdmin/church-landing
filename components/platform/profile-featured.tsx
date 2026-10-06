"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { PostResourceCard } from "@/lib/platform/post-resource-attachments";
import {
  featuredKey,
  featuredReferenceFromLink,
  PROFILE_FEATURED_LIMIT,
  type ProfileFeaturedReference
} from "@/lib/platform/profile-featured-input";
import { useReadVisibility } from "./read-visibility";
import { accountInputClass } from "./account-form";

const labels = {
  exchangeListing: "Listing",
  volunteerOpportunity: "Opportunity",
  mediaCatalogItem: "Media",
  eventOccurrence: "Event"
};
type FeaturedResult = {
  profileId?: string;
  viewerId: string;
  version?: number;
  resources: PostResourceCard[];
};
async function readResources(
  url: string,
  owner: string,
  signal: AbortSignal
): Promise<FeaturedResult> {
  const response = await fetch(url, {
    signal,
    cache: "no-store",
    credentials: "same-origin",
    headers: { "X-Expected-Account": owner }
  });
  const result = await response.json();
  if (!response.ok)
    throw Error(result.message ?? "Featured resources could not be checked.");
  const identity = await fetch("/api/platform/profile?view=identity", {
    signal,
    cache: "no-store",
    credentials: "same-origin"
  });
  if (
    !identity.ok ||
    (await identity.json()).id !== owner ||
    result.viewerId !== owner
  )
    throw Error("Your sign-in changed. Reload before continuing.");
  return result;
}
const choiceUrl = (references: ProfileFeaturedReference[]) =>
  `/api/platform/profile?${new URLSearchParams({ view: "featured-choice", references: JSON.stringify(references) })}`;

/** Mounted metadata is transient. No copied cards enter SSR, storage or drafts. */
function useFeaturedCards(
  url: string,
  owner: string,
  enabled: boolean,
  version?: number,
  profileId?: string
) {
  const root = useRef<HTMLDivElement>(null);
  const [snapshot, setSnapshot] = useState<{
    url: string;
    owner: string;
    version?: number;
    profileId?: string;
    cards: PostResourceCard[];
  } | null>(null);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    let live = true,
      intersecting = false,
      sequence = 0,
      checking = false,
      queued = false;
    let controller: AbortController | undefined;
    const active = () =>
      live &&
      enabled &&
      intersecting &&
      document.hasFocus() &&
      navigator.onLine &&
      document.visibilityState !== "hidden";
    const hide = () => {
      sequence++;
      controller?.abort();
      setSnapshot(null);
      setNotice("");
    };
    const refresh = async () => {
      if (!active()) return;
      if (checking) {
        queued = true;
        return;
      }
      checking = true;
      const seq = ++sequence;
      const current = new AbortController();
      controller = current;
      const timeout = setTimeout(() => current.abort(), 10000);
      try {
        const result = await readResources(url, owner, current.signal);
        if (seq !== sequence || !active()) return;
        if (
          (version !== undefined && result.version !== version) ||
          (profileId !== undefined && result.profileId !== profileId)
        ) {
          setSnapshot(null);
          setNotice(
            "This profile changed. Reload to see the current featured resources."
          );
        } else {
          setSnapshot({
            url,
            owner,
            version,
            profileId,
            cards: result.resources
          });
          setNotice("");
        }
      } catch {
        if (seq === sequence) {
          setSnapshot(null);
          setNotice(
            "Featured resources are unavailable right now. Reconnect or recheck current access."
          );
        }
      } finally {
        clearTimeout(timeout);
        checking = false;
        if (queued) {
          queued = false;
          void refresh();
        }
      }
    };
    const resume = () => {
      hide();
      void refresh();
    };
    const visibility = () =>
      document.visibilityState === "hidden" ? hide() : resume();
    const observer = new IntersectionObserver((entries) => {
      intersecting = entries.some((entry) => entry.isIntersecting);
      if (intersecting) void refresh();
      else hide();
    });
    if (root.current) observer.observe(root.current);
    const timer = setInterval(() => void refresh(), 30000);
    for (const event of ["blur", "pagehide", "offline"])
      window.addEventListener(event, hide);
    for (const event of [
      "focus",
      "pageshow",
      "online",
      "social-relationships-changed"
    ])
      window.addEventListener(event, resume);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      live = false;
      hide();
      observer.disconnect();
      clearInterval(timer);
      for (const event of ["blur", "pagehide", "offline"])
        window.removeEventListener(event, hide);
      for (const event of [
        "focus",
        "pageshow",
        "online",
        "social-relationships-changed"
      ])
        window.removeEventListener(event, resume);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [url, owner, enabled, version, profileId]);
  // Rendering must reject old identities before passive-effect cleanup runs.
  const current =
    enabled &&
    snapshot?.url === url &&
    snapshot.owner === owner &&
    snapshot.version === version &&
    snapshot.profileId === profileId;
  return { root, cards: current ? snapshot.cards : [], notice };
}

export function ProfileFeaturedResources({
  username,
  profileId,
  owner,
  version,
  preview
}: {
  username: string;
  profileId: string;
  owner: string;
  version: number;
  preview: boolean;
}) {
  const visible = useReadVisibility();
  const query = new URLSearchParams({
    view: "featured-resources",
    username,
    ...(preview ? { preview: "member" } : {})
  });
  const { root, cards, notice } = useFeaturedCards(
    `/api/platform/profile?${query}`,
    owner,
    visible,
    version,
    profileId
  );
  return (
    <div ref={root} className="min-h-px" data-profile-featured="reader">
      {visible && (
        <section
          className="gc-profile-section"
          aria-labelledby="profile-featured-heading"
        >
          <h2 id="profile-featured-heading">Featured resources</h2>
          {cards.length ? (
            <ul className="grid gap-3 sm:grid-cols-2">
              {cards.map((card) => (
                <li
                  key={`${card.kind}:${card.id}`}
                  className="min-w-0 rounded-xl border border-gc-divider p-3"
                >
                  <p className="text-sm text-gc-muted">
                    {labels[card.kind]} · {card.state}
                  </p>
                  <Link
                    prefetch={false}
                    href={card.href}
                    className="inline-flex min-h-11 items-center break-words font-semibold underline"
                  >
                    {card.title}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p>{notice || "No featured resources are available to show."}</p>
          )}
        </section>
      )}
    </div>
  );
}

export function ProfileFeaturedPicker({
  owner,
  selected,
  disabled,
  visible,
  onSelect,
  onBusy
}: {
  owner: string;
  selected: ProfileFeaturedReference[];
  disabled: boolean;
  visible: boolean;
  onSelect: (refs: ProfileFeaturedReference[]) => void;
  onBusy: (busy: boolean) => void;
}) {
  // This component stays mounted beside the existing event picker on concealment.
  const [link, setLink] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const busy = useRef(false),
    generation = useRef(0),
    request = useRef<AbortController | null>(null);
  const { root, cards } = useFeaturedCards(choiceUrl(selected), owner, visible);
  useEffect(() => {
    const conceal = () => {
      generation.current++;
      request.current?.abort();
      setMessage("");
    };
    if (!visible) conceal();
    for (const event of [
      "blur",
      "pagehide",
      "offline",
      "social-relationships-changed"
    ])
      window.addEventListener(event, conceal);
    return () => {
      conceal();
      for (const event of [
        "blur",
        "pagehide",
        "offline",
        "social-relationships-changed"
      ])
        window.removeEventListener(event, conceal);
    };
  }, [visible]);
  async function add() {
    if (
      disabled ||
      busy.current ||
      !visible ||
      !document.hasFocus() ||
      !navigator.onLine
    )
      return;
    busy.current = true;
    setPending(true);
    onBusy(true);
    setMessage("");
    const seq = ++generation.current;
    const controller = new AbortController();
    request.current = controller;
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      if (selected.length >= PROFILE_FEATURED_LIMIT)
        throw Error("Choose up to six featured resources.");
      const reference = featuredReferenceFromLink(link, location.origin);
      if (selected.some((row) => featuredKey(row) === featuredKey(reference)))
        throw Error("This resource is already selected.");
      const result = await readResources(
        choiceUrl([reference]),
        owner,
        controller.signal
      );
      if (
        seq !== generation.current ||
        !visible ||
        !document.hasFocus() ||
        !navigator.onLine
      )
        return;
      if (
        !result.resources.some(
          (card) => card.kind === reference.kind && card.id === reference.id
        )
      )
        throw Error("This resource is unavailable to add.");
      onSelect([...selected, reference]);
      setLink("");
      setMessage("Resource selected. Save profile to apply this change.");
    } catch (error) {
      if (seq === generation.current)
        setMessage(
          error instanceof Error && error.name !== "AbortError"
            ? error.message
            : "The resource check timed out. Your selection is unchanged. Try again."
        );
    } finally {
      clearTimeout(timeout);
      busy.current = false;
      setPending(false);
      onBusy(false);
    }
  }
  function move(index: number, by: number) {
    const next = [...selected],
      target = index + by;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onSelect(next);
    setMessage(
      `Resource moved to position ${target + 1}. Save profile to apply this order.`
    );
  }
  return (
    <div ref={root} className="min-h-px">
      {visible && (
        <fieldset className="min-w-0 space-y-3" disabled={disabled || pending}>
          <legend className="text-2xl">Featured resources (optional)</legend>
          <p className="text-sm text-gc-muted">
            Choose up to six listings, opportunities or media pages. Each reader
            sees only resources they can currently access. Your existing pinned
            post and selected event stay separate. Featuring an item does not
            publish it or change its audience.
          </p>
          <label htmlFor="profile-featured-link" className="block">
            Existing resource page link
          </label>
          <input
            id="profile-featured-link"
            className={accountInputClass}
            maxLength={500}
            value={link}
            onChange={(event) => {
              setLink(event.target.value);
              setMessage("");
            }}
          />
          <button
            type="button"
            className="gc-profile-text-button min-h-11"
            disabled={selected.length >= PROFILE_FEATURED_LIMIT}
            onClick={() => void add()}
          >
            {pending ? "Checking resource…" : "Check and add resource"}
          </button>
          <ol className="space-y-3">
            {selected.map((reference, index) => {
              const card = cards.find(
                (item) =>
                  item.kind === reference.kind && item.id === reference.id
              );
              return (
                <li
                  key={featuredKey(reference)}
                  className="min-w-0 space-y-2 rounded-lg border border-gc-divider p-3"
                >
                  <p className="break-words">
                    {index + 1}. {labels[reference.kind]}:{" "}
                    {card
                      ? card.title
                      : "Details unavailable. You can keep or remove this selection."}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="gc-profile-text-button min-h-11"
                      aria-label={`Move featured resource ${index + 1} up`}
                      aria-disabled={index === 0}
                      onClick={() => move(index, -1)}
                    >
                      Up
                    </button>
                    <button
                      type="button"
                      className="gc-profile-text-button min-h-11"
                      aria-label={`Move featured resource ${index + 1} down`}
                      aria-disabled={index === selected.length - 1}
                      onClick={() => move(index, 1)}
                    >
                      Down
                    </button>
                    <button
                      type="button"
                      className="gc-profile-text-button min-h-11"
                      aria-label={`Remove featured resource ${index + 1}`}
                      onClick={() => {
                        onSelect(
                          selected.filter((_, position) => position !== index)
                        );
                        setMessage(
                          "Selection removed. Save profile to apply this change."
                        );
                      }}
                    >
                      Remove
                    </button>
                  </div>
                </li>
              );
            })}
          </ol>
          <p role="status">{message}</p>
        </fieldset>
      )}
    </div>
  );
}
