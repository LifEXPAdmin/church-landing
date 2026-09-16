"use client";
import { RegionalTime } from "@/components/platform/regional-presentation";
/* eslint-disable @next/next/no-img-element -- Canonical permissioned images bypass shared optimization. */
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { PhotoTagView } from "@/lib/platform/photo-tag-reads";
import { socialRequest, SocialClientError } from "@/lib/platform/social-client";
import { CommentMentions } from "./comment-mentions";
import { useUnsavedSocialWork } from "./use-unsaved-social-work";
import { notificationChanged } from "./notification-refresh";
const endpoint = "/api/platform/photo-tags";
const labels: Record<string, string> = {
  PENDING: "Awaiting approval",
  APPROVED: "Approved",
  DECLINED: "Declined",
  REMOVED: "Removed"
};
const choices = {
  EVERYONE: "Any eligible adult who manages a photo you can view",
  FOLLOWED: "Only people you follow",
  NOBODY: "No one"
};
export function PhotoTagWorkspace({
  owner,
  query
}: {
  owner: string;
  query: string;
}) {
  const router = useRouter(),
    generation = useRef(0),
    mounted = useRef(true),
    flight = useRef(false),
    reading = useRef(false),
    visible = useRef(true),
    reloadQueued = useRef(false),
    reloadRef = useRef<() => Promise<boolean>>(async () => false),
    preferenceDraft = useRef<string | null>(null),
    savedChoice = useRef<string | null>(null),
    pendingBody = useRef<string | null>(null);
  const [view, setView] = useState<PhotoTagView | null>(null),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [pending, setPending] = useState(false),
    [message, setMessage] = useState(""),
    [selected, setSelected] = useState<string[]>([]),
    [choice, setChoice] = useState("EVERYONE");
  const changedChoice = preferenceDraft.current !== null;
  useUnsavedSocialWork(
    {
      dirty: selected.length > 0 || changedChoice,
      saving: busy || pending,
      conflict: false
    },
    () =>
      setMessage(
        "Save, retry or discard your photo tag choices before leaving."
      ),
    true
  );
  const load = useCallback(async () => {
    if (!visible.current || document.visibilityState === "hidden") return false;
    if (reading.current) {
      reloadQueued.current = true;
      return false;
    }
    reading.current = true;
    const seq = ++generation.current;
    setLoading(true);
    setView(null);
    try {
      const { data } = await socialRequest<PhotoTagView>(
        endpoint + (query ? "?" + query : ""),
        undefined,
        owner
      );
      if (!mounted.current || seq !== generation.current) return false;
      if (data.ownerId !== owner)
        throw new SocialClientError(
          401,
          "Your sign-in changed. Reload photo tags."
        );
      setView(data);
      if (data.kind === "preferences") {
        savedChoice.current = data.choice;
        setChoice(preferenceDraft.current ?? data.choice);
      }
      setMessage("");
      return true;
    } catch (error) {
      if (mounted.current && seq === generation.current) {
        setMessage(
          error instanceof Error
            ? error.message
            : "Photo tags could not load. Reconnect and refresh."
        );
        if (error instanceof SocialClientError && error.status === 401) {
          pendingBody.current = null;
          setPending(false);
          setSelected([]);
          preferenceDraft.current = null;
          savedChoice.current = null;
          router.refresh();
        }
      }
      return false;
    } finally {
      reading.current = false;
      if (mounted.current && seq === generation.current) setLoading(false);
      if (reloadQueued.current && mounted.current) {
        reloadQueued.current = false;
        queueMicrotask(() => void reloadRef.current());
      }
    }
  }, [owner, query, router]);
  reloadRef.current = load;
  useEffect(() => {
    mounted.current = true;
    const retireRead = () => {
      generation.current++;
    };
    void load();
    const conceal = () => {
      visible.current = false;
      generation.current++;
      setView(null);
    };
    const refresh = () => {
      visible.current = document.visibilityState !== "hidden";
      if (
        !flight.current &&
        !pendingBody.current &&
        document.visibilityState !== "hidden"
      )
        void load();
    };
    const visibility = () =>
      document.visibilityState === "hidden" ? conceal() : refresh();
    window.addEventListener("blur", conceal);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    window.addEventListener("offline", conceal);
    window.addEventListener("social-relationships-changed", refresh);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      mounted.current = false;
      retireRead();
      window.removeEventListener("blur", conceal);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      window.removeEventListener("offline", conceal);
      window.removeEventListener("social-relationships-changed", refresh);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [load]);
  async function act(operation?: string, fields: object = {}) {
    if (flight.current || (!pendingBody.current && !operation)) return;
    pendingBody.current ??= JSON.stringify({
      operation,
      mutationId: crypto.randomUUID(),
      ownerId: owner,
      ...fields
    });
    flight.current = true;
    setBusy(true);
    setPending(true);
    setMessage("");
    try {
      const { data } = await socialRequest<{ message: string }>(
        endpoint,
        pendingBody.current,
        owner
      );
      if (!mounted.current) return;
      pendingBody.current = null;
      setPending(false);
      setSelected([]);
      preferenceDraft.current = null;
      notificationChanged(owner);
      if (await load()) setMessage(data.message);
    } catch (error) {
      if (!mounted.current) return;
      setMessage(
        error instanceof Error
          ? error.message
          : "The change could not be confirmed. Retry the same request."
      );
      if (
        error instanceof SocialClientError &&
        [400, 401, 403, 404, 409, 429].includes(error.status)
      ) {
        pendingBody.current = null;
        setPending(false);
        setView(null);
        if (error.status === 401) {
          setSelected([]);
          router.refresh();
        }
      }
    } finally {
      flight.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  function imageFailed() {
    generation.current++;
    setView(null);
    setLoading(false);
    setMessage(
      "This photo could not load. Refresh to check its current availability."
    );
  }
  const blocked = busy || pending,
    params = new URLSearchParams(query);
  const collection =
    view &&
    (view.kind === "asset" || view.kind === "inbox" || view.kind === "profile")
      ? view
      : null;
  const nextHref = (cursor: string) => {
    const next = new URLSearchParams();
    const original = new URLSearchParams(query);
    if (original.get("view") === "profile" && original.get("profileId"))
      next.set("profile", original.get("profileId")!);
    else if (original.get("scope") === "sent") next.set("scope", "sent");
    next.set("after", cursor);
    return "/platform/photo-tags?" + next;
  };
  return (
    <section className="space-y-6" aria-busy={loading || busy}>
      <header className="space-y-3">
        <p className="gc-eyebrow">Your photo choices</p>
        <h1>Photo tags</h1>
        <p>
          Every tag needs the adult’s approval. A tag never gives anyone access
          to a photo. Removing a tag does not delete someone else’s photo.
        </p>
        <nav className="flex flex-wrap gap-2" aria-label="Photo tag views">
          <Link
            className="gc-button gc-button-quiet"
            href="/platform/photo-tags"
            prefetch={false}
          >
            Requests for you
          </Link>
          <Link
            className="gc-button gc-button-quiet"
            href="/platform/photo-tags?scope=sent"
            prefetch={false}
          >
            Requests you sent
          </Link>
          <Link
            className="gc-button gc-button-quiet"
            href="/platform/photo-tags?view=preferences"
            prefetch={false}
          >
            Tag privacy choices
          </Link>
          <Link
            className="gc-button gc-button-quiet"
            href="/platform/activity?category=photos"
            prefetch={false}
          >
            Photo notifications
          </Link>
        </nav>
        <button
          type="button"
          className="gc-button gc-button-quiet"
          disabled={blocked || loading}
          onClick={() => void load()}
        >
          Refresh photo tags
        </button>
      </header>
      {message && (
        <p role="status" className="rounded-xl border border-gc-border p-4">
          {message}
        </p>
      )}
      {pending && !busy && (
        <div className="space-y-3">
          <p>The earlier change may already be saved.</p>
          <button
            type="button"
            className="gc-button"
            onClick={() => void act()}
          >
            Retry photo tag change
          </button>
          <button
            type="button"
            className="gc-button gc-button-quiet"
            onClick={() => {
              pendingBody.current = null;
              setPending(false);
              void load();
            }}
          >
            Stop retrying and check saved status
          </button>
        </div>
      )}
      {(selected.length > 0 || changedChoice) && (
        <button
          type="button"
          className="gc-button gc-button-quiet"
          disabled={blocked}
          onClick={() => {
            setSelected([]);
            preferenceDraft.current = null;
            if (savedChoice.current !== null) setChoice(savedChoice.current);
          }}
        >
          Discard unsaved tag choices
        </button>
      )}
      {loading ? (
        <p role="status">Checking current photo access…</p>
      ) : view?.kind === "preferences" ? (
        <div className="space-y-4">
          <h2>Who may ask to tag you?</h2>
          {view.recoveryRequired && (
            <p>
              Tag requests are paused after account recovery. Review and save
              your choice to resume them.
            </p>
          )}
          <label className="block font-semibold" htmlFor="photo-tag-choice">
            Photo tag requests
          </label>
          <select
            id="photo-tag-choice"
            className="w-full rounded border border-gc-border p-3"
            value={choice}
            disabled={blocked}
            onChange={(e) => {
              const value = e.target.value;
              preferenceDraft.current =
                value === savedChoice.current ? null : value;
              setChoice(value);
            }}
          >
            {Object.entries(choices).map(([value, text]) => (
              <option key={value} value={value}>
                {text}
              </option>
            ))}
          </select>
          <p>
            This choice is independent of text mentions. Existing approved tags
            remain yours to remove. Phone alerts have a separate choice in
            Notification settings.
          </p>
          <button
            type="button"
            className="gc-button"
            disabled={blocked || (!changedChoice && !view.recoveryRequired)}
            onClick={() =>
              void act("preferences", { choice, expectedVersion: view.version })
            }
          >
            Save tag privacy
          </button>
          <p className="text-sm text-gc-muted">
            Tags are available for eligible adults. Family-managed and child
            tagging remain unavailable.
          </p>
        </div>
      ) : collection ? (
        <>
          {collection.kind === "profile" && collection.profile && (
            <h2>Approved photos of {collection.profile.name}</h2>
          )}
          {collection.kind === "asset" && (
            <section
              className="space-y-4 rounded-xl border border-gc-border p-4"
              aria-label="Selected photo"
            >
              <img
                onError={imageFailed}
                src={collection.image.variants.medium.url}
                width={collection.image.variants.medium.width}
                height={collection.image.variants.medium.height}
                alt={collection.image.alt || "Selected photo"}
                className="max-h-80 max-w-full rounded-lg object-contain"
              />
              {collection.image.caption && (
                <p className="whitespace-pre-wrap break-words">
                  {collection.image.caption}
                </p>
              )}
              <p>Photo from {collection.sourceName}</p>
              {collection.sourceHref && (
                <Link
                  className="underline"
                  href={collection.sourceHref}
                  prefetch={false}
                >
                  Open original source
                </Link>
              )}
              {collection.canRequest && (
                <div className="space-y-3">
                  <CommentMentions
                    photoId={collection.image.id}
                    owner={owner}
                    ids={selected}
                    onChange={setSelected}
                    disabled={blocked}
                  />
                  <button
                    type="button"
                    className="gc-button"
                    disabled={blocked || selected.length !== 1}
                    onClick={() =>
                      void act("request", {
                        assetId: collection.image.id,
                        imageVersion: collection.image.version,
                        recipientId: selected[0]
                      })
                    }
                  >
                    Ask for tag approval
                  </button>
                </div>
              )}
            </section>
          )}
          {!collection.items.length && (
            <p>
              {collection.kind === "profile"
                ? "No approved tagged photos are visible on this page."
                : params.get("scope") === "sent"
                  ? "No tag requests sent on this page."
                  : "No photo tags to show on this page."}
            </p>
          )}
          <ul className="space-y-4" aria-label="Photo tag records">
            {collection.items.map((tag) => (
              <li
                key={tag.id}
                className="space-y-3 rounded-xl border border-gc-border p-4 [overflow-wrap:anywhere]"
              >
                <h2>
                  {tag.person
                    ? `${tag.person.name} · ${labels[tag.state] ?? "Unavailable"}`
                    : (labels[tag.state] ?? "Tag unavailable")}
                </h2>
                {tag.requesterName && <p>Requested by {tag.requesterName}</p>}
                {tag.image ? (
                  <>
                    {collection.kind !== "asset" && (
                      <img
                        onError={imageFailed}
                        src={tag.image.variants.medium.url}
                        width={tag.image.variants.medium.width}
                        height={tag.image.variants.medium.height}
                        alt={tag.image.alt || "Photo for tag review"}
                        loading="lazy"
                        className="max-h-72 max-w-full rounded-lg object-contain"
                      />
                    )}
                    {tag.image.caption && collection.kind !== "asset" && (
                      <p className="whitespace-pre-wrap">{tag.image.caption}</p>
                    )}
                    <p>
                      Photo from {tag.sourceName}.{" "}
                      {tag.originalChurchAudience &&
                        "This association stays limited to the original church audience."}
                    </p>
                    {tag.sourceHref && (
                      <Link
                        className="underline"
                        prefetch={false}
                        href={tag.sourceHref}
                      >
                        Open original source
                      </Link>
                    )}
                  </>
                ) : (
                  <p>
                    This photo or your access is unavailable. You can still
                    decline or remove your own tag.
                  </p>
                )}
                <p className="text-sm text-gc-muted">
                  <time dateTime={tag.createdAt}>
                    {<RegionalTime value={tag.createdAt} />}
                  </time>
                </p>
                <div className="flex flex-wrap gap-3">
                  {tag.canAccept && (
                    <button
                      type="button"
                      className="gc-button"
                      disabled={blocked}
                      onClick={() =>
                        void act("accept", {
                          id: tag.id,
                          expectedVersion: tag.version,
                          imageVersion: tag.image!.version
                        })
                      }
                    >
                      Approve tag
                    </button>
                  )}
                  {tag.canDecline && (
                    <button
                      type="button"
                      className="gc-button gc-button-quiet"
                      disabled={blocked}
                      onClick={() =>
                        void act("decline", {
                          id: tag.id,
                          expectedVersion: tag.version
                        })
                      }
                    >
                      Decline tag
                    </button>
                  )}
                  {tag.canRemove && (
                    <button
                      type="button"
                      className="gc-button gc-button-quiet"
                      disabled={blocked}
                      onClick={() =>
                        void act("remove", {
                          id: tag.id,
                          expectedVersion: tag.version
                        })
                      }
                    >
                      {tag.state === "PENDING" && !tag.received
                        ? "Cancel tag request"
                        : "Remove tag"}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {collection.nextCursor && (
            <Link
              className="gc-button gc-button-quiet"
              prefetch={false}
              href={nextHref(collection.nextCursor)}
            >
              Older photo tags
            </Link>
          )}
        </>
      ) : (
        !pending && <p>Refresh to check current photo tag access.</p>
      )}
    </section>
  );
}
