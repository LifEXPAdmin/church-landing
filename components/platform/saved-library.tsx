"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { socialRequest, SocialClientError } from "@/lib/platform/social-client";
import { useUnsavedSocialWork } from "./use-unsaved-social-work";
type Collection = { id: string; version: number; name: string };
type Saved = {
  id: string;
  version: number;
  collectionId: string | null;
  available: boolean;
  post?: {
    id: string;
    excerpt: string;
    type: string;
    publishedAt: string;
    href: string;
  };
};
type Page<T> = { items: T[]; nextCursor: string | null };
export function SavedLibrary({
  owner,
  collectionId,
  after
}: {
  owner: string;
  collectionId?: string;
  after?: string;
}) {
  const router = useRouter();
  const [collections, setCollections] = useState<Page<Collection> | null>(null),
    [saved, setSaved] = useState<Page<Saved> | null>(null),
    [hidden, setHidden] = useState(true),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [name, setName] = useState(""),
    [editing, setEditing] = useState<Collection | null>(null),
    [pending, setPending] = useState<{
      body: string;
      nameAction: boolean;
    } | null>(null),
    [conflict, setConflict] = useState(false);
  const generation = useRef(0),
    inFlight = useRef(false);
  const dirty = editing ? name !== editing.name : name.length > 0;
  useUnsavedSocialWork({ dirty, saving: !!pending, conflict }, () =>
    setMessage(
      "Save or cancel the collection name, or resolve the pending change, before leaving."
    )
  );
  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setHidden(true);
    const seq = ++generation.current;
    try {
      const [c, s] = await Promise.all([
        socialRequest<Page<Collection>>(
          "/api/platform/post-workspace?view=collections",
          undefined,
          owner
        ),
        socialRequest<Page<Saved>>(
          `/api/platform/post-workspace?${new URLSearchParams({ view: "saved", ...(collectionId ? { collectionId } : {}), ...(after ? { after } : {}) })}`,
          undefined,
          owner
        )
      ]);
      if (seq !== generation.current) return;
      setCollections(c.data);
      setSaved(s.data);
      setHidden(false);
    } catch (e) {
      if (seq === generation.current) {
        setCollections(null);
        setSaved(null);
        setMessage(
          e instanceof Error ? e.message : "Saved items could not be loaded."
        );
        if (e instanceof SocialClientError && e.status === 401) {
          setName("");
          setEditing(null);
          setPending(null);
          setConflict(false);
          router.refresh();
        }
      }
    } finally {
      if (seq === generation.current) {
        inFlight.current = false;
        setBusy(false);
      }
    }
  }, [owner, collectionId, after, router]);
  useEffect(() => {
    void refresh();
    const conceal = () => {
      generation.current++;
      inFlight.current = false;
      setBusy(false);
      setHidden(true);
    };
    const restore = () => {
      if (document.visibilityState !== "hidden") void refresh();
    };
    const visibility = () =>
      document.visibilityState === "hidden" ? conceal() : restore();
    window.addEventListener("blur", conceal);
    window.addEventListener("focus", restore);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      conceal();
      window.removeEventListener("blur", conceal);
      window.removeEventListener("focus", restore);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [refresh]);
  async function moreCollections() {
    if (inFlight.current || !collections?.nextCursor) return;
    inFlight.current = true;
    setBusy(true);
    const seq = generation.current;
    try {
      const r = await socialRequest<Page<Collection>>(
        `/api/platform/post-workspace?view=collections&after=${encodeURIComponent(collections.nextCursor)}`,
        undefined,
        owner
      );
      if (seq === generation.current)
        setCollections((c) => ({
          ...r.data,
          items: [
            ...new Map(
              [...(c?.items ?? []), ...r.data.items].map((row) => [row.id, row])
            ).values()
          ]
        }));
    } catch (e) {
      if (seq === generation.current)
        setMessage(
          e instanceof Error
            ? e.message
            : "More collections could not be loaded."
        );
    } finally {
      if (seq === generation.current) {
        inFlight.current = false;
        setBusy(false);
      }
    }
  }
  async function send(body: string, nameAction = false) {
    if (inFlight.current || hidden) return;
    if (dirty && !nameAction && !pending) {
      setMessage(
        "Save or cancel the collection name before changing saved items."
      );
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setPending({ body, nameAction });
    setMessage("Saving private changes…");
    const seq = generation.current;
    try {
      await socialRequest("/api/platform/post-workspace", body, owner);
      if (seq !== generation.current) return;
      setPending(null);
      setConflict(false);
      if (nameAction) {
        setName("");
        setEditing(null);
      }
      const command = JSON.parse(body);
      inFlight.current = false;
      if (
        command.operation === "delete-collection" &&
        command.id === collectionId
      ) {
        router.replace("/platform/saved?collectionId=unfiled");
        return;
      }
      await refresh();
      setMessage(
        command.operation === "delete-collection"
          ? "Collection deleted. Saved posts are now unfiled."
          : "Private changes saved."
      );
    } catch (e) {
      if (seq === generation.current) {
        const status = e instanceof SocialClientError ? e.status : 503;
        if ([400, 401, 403, 404, 409, 429].includes(status)) setPending(null);
        if (status === 409 && nameAction) setConflict(true);
        if (status === 401) {
          setHidden(true);
          setCollections(null);
          setSaved(null);
          setName("");
          setEditing(null);
          setConflict(false);
          router.refresh();
        }
        setMessage(
          e instanceof Error
            ? e.message
            : "The response was lost. Retry the same request; your entries are preserved."
        );
      }
    } finally {
      if (seq === generation.current) {
        inFlight.current = false;
        setBusy(false);
      }
    }
  }
  function command(
    operation: string,
    fields: Record<string, unknown>,
    nameAction = false
  ) {
    void send(
      JSON.stringify({ operation, mutationId: crypto.randomUUID(), ...fields }),
      nameAction
    );
  }
  const latest = editing
    ? collections?.items.find((c) => c.id === editing.id)
    : null;
  return (
    <section aria-label="Private saved posts" className="space-y-4">
      <p>
        Collections are private to your account. Saved posts remain subject to
        their current audience and availability.
      </p>
      <p role="status">{message}</p>
      <button
        type="button"
        className="gc-button gc-button-quiet"
        disabled={busy || !!pending}
        onClick={() => void refresh()}
      >
        Refresh bookmarks
      </button>
      {busy && <p role="status">Checking your bookmarks…</p>}
      {!hidden && (
        <>
          <form
            aria-label="Collection name"
            className="space-y-2 rounded border p-3"
            onSubmit={(e) => {
              e.preventDefault();
              command(
                editing ? "rename-collection" : "create-collection",
                {
                  id: editing?.id ?? crypto.randomUUID(),
                  expectedVersion: editing?.version ?? 0,
                  name
                },
                true
              );
            }}
          >
            <h2 className="text-xl">
              {editing ? "Rename collection" : "Create a collection"}
            </h2>
            <label className="block">
              Collection name
              <input
                aria-label="Collection name"
                className="block w-full rounded border p-2"
                value={name}
                disabled={busy || !!pending}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <p className="text-sm text-gc-muted">
              Use 1–80 characters. {name.trim().length}/80
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                className="gc-button gc-button-primary"
                disabled={
                  busy ||
                  !!pending ||
                  conflict ||
                  !dirty ||
                  name.trim().length < 1 ||
                  name.trim().length > 80
                }
              >
                {editing ? "Save collection name" : "Create collection"}
              </button>
              {(editing || name) && (
                <button
                  type="button"
                  className="gc-button gc-button-quiet"
                  disabled={busy || !!pending}
                  onClick={() => {
                    setName("");
                    setEditing(null);
                    setConflict(false);
                    setMessage("");
                  }}
                >
                  Cancel name changes
                </button>
              )}
            </div>
            {conflict && (
              <p>
                Your name is preserved. Refresh collections to review the
                current saved name; load more collections if needed.
              </p>
            )}
            {conflict && latest && (
              <aside>
                <p>Saved name: {latest.name}</p>
                <button
                  type="button"
                  className="gc-button gc-button-quiet"
                  onClick={() => {
                    setEditing(latest);
                    setName(latest.name);
                    setConflict(false);
                  }}
                >
                  Use saved collection name
                </button>
              </aside>
            )}
          </form>
          {pending && (
            <button
              type="button"
              className="gc-button gc-button-quiet"
              disabled={busy}
              onClick={() => void send(pending.body, pending.nameAction)}
            >
              Retry same private change
            </button>
          )}
          <nav aria-label="Saved post views" className="flex flex-wrap gap-2">
            <Link
              prefetch={false}
              className="gc-button gc-button-quiet"
              href="/platform/saved"
            >
              All bookmarks
            </Link>
            <Link
              prefetch={false}
              className="gc-button gc-button-quiet"
              href="/platform/saved?collectionId=unfiled"
            >
              Unfiled
            </Link>
          </nav>
          <section aria-label="Your collections" className="space-y-3">
            <h2 className="text-2xl">Your collections</h2>
            {!collections?.items.length && <p>No collections yet.</p>}
            {collections?.items.map((c) => (
              <article
                key={c.id}
                data-collection-id={c.id}
                className="flex flex-wrap items-center gap-2 rounded border p-3"
              >
                <Link
                  prefetch={false}
                  className="min-w-0 flex-1 break-words underline"
                  href={`/platform/saved?collectionId=${encodeURIComponent(c.id)}`}
                >
                  {c.name}
                </Link>
                <button
                  type="button"
                  className="gc-button gc-button-quiet"
                  disabled={busy || !!pending || dirty || conflict}
                  onClick={() => {
                    setEditing(c);
                    setName(c.name);
                    setMessage("");
                  }}
                >
                  Rename
                </button>
                <button
                  type="button"
                  className="gc-button gc-button-quiet"
                  disabled={busy || !!pending || dirty || conflict}
                  onClick={() => {
                    if (
                      window.confirm(
                        "Delete this collection? Its saved posts move to Unfiled; the source posts are unchanged."
                      )
                    )
                      command("delete-collection", {
                        id: c.id,
                        expectedVersion: c.version
                      });
                  }}
                >
                  Delete collection
                </button>
              </article>
            ))}
            {collections?.nextCursor && (
              <button
                type="button"
                className="gc-button gc-button-quiet"
                disabled={busy || !!pending}
                onClick={() => void moreCollections()}
              >
                More collections
              </button>
            )}
          </section>
          <section aria-label="Saved items" className="space-y-3">
            <h2 className="text-2xl">
              {collectionId === "unfiled"
                ? "Unfiled posts"
                : collectionId
                  ? (collections?.items.find((c) => c.id === collectionId)
                      ?.name ?? "Selected collection")
                  : "All bookmarks"}
            </h2>
            {!saved?.items.length && <p>No bookmarks in this view.</p>}
            {saved?.items.map((row) => (
              <SavedItem
                key={`${row.id}:${row.version}`}
                row={row}
                collections={collections?.items ?? []}
                disabled={busy || !!pending || dirty || conflict}
                command={command}
              />
            ))}
            {saved?.nextCursor && (
              <Link
                prefetch={false}
                className="gc-button gc-button-quiet"
                href={`/platform/saved?${new URLSearchParams({ ...(collectionId ? { collectionId } : {}), after: saved.nextCursor })}`}
              >
                More bookmarks
              </Link>
            )}
          </section>
        </>
      )}
    </section>
  );
}
function SavedItem({
  row,
  collections,
  disabled,
  command
}: {
  row: Saved;
  collections: Collection[];
  disabled: boolean;
  command: (operation: string, fields: Record<string, unknown>) => void;
}) {
  const [destination, setDestination] = useState(row.collectionId ?? "");
  return (
    <article data-saved-id={row.id} className="space-y-3 rounded border p-3">
      {row.available && row.post ? (
        <>
          <p className="text-sm text-gc-muted">{row.post.type.toLowerCase()}</p>
          <p className="whitespace-pre-wrap break-words">{row.post.excerpt}</p>
          <Link prefetch={false} className="underline" href={row.post.href}>
            Open saved post
          </Link>
        </>
      ) : (
        <p>Saved post unavailable</p>
      )}
      <label className="block">
        Collection
        <select
          aria-label="Saved post collection"
          className="ml-2 max-w-full rounded border p-2"
          disabled={disabled}
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
        >
          <option value="">Unfiled</option>
          {row.collectionId &&
            !collections.some((c) => c.id === row.collectionId) && (
              <option value={row.collectionId}>
                Current collection · load more names
              </option>
            )}
          {collections.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="gc-button gc-button-quiet"
          disabled={disabled || destination === (row.collectionId ?? "")}
          onClick={() =>
            command("move-item", {
              id: row.id,
              expectedVersion: row.version,
              collectionId: destination || null
            })
          }
        >
          Move saved post
        </button>
        <button
          type="button"
          className="gc-button gc-button-quiet"
          disabled={disabled}
          onClick={() =>
            command("remove-item", { id: row.id, expectedVersion: row.version })
          }
        >
          Remove saved post
        </button>
      </div>
    </article>
  );
}
