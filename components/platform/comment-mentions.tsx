"use client";
import { useEffect, useId, useRef, useState } from "react";
import { socialRequest } from "@/lib/platform/social-client";
type Person = { id: string; name: string; username: string };
export function CommentMentions({
  postId,
  photoId,
  owner,
  ids,
  onChange,
  resolveSelections = false,
  disabled = false
}: {
  postId?: string;
  photoId?: string;
  owner: string;
  ids: string[];
  onChange: (ids: string[], person?: Person) => void;
  resolveSelections?: boolean;
  disabled?: boolean;
}) {
  const limit = photoId ? 1 : 5;
  const label = useId(),
    seq = useRef(0);
  const [query, setQuery] = useState(""),
    [people, setPeople] = useState<Person[]>([]),
    [names, setNames] = useState<Record<string, string>>({}),
    [cursor, setCursor] = useState<string | null>(null),
    [active, setActive] = useState(0),
    [pending, setPending] = useState(false),
    [message, setMessage] = useState("");
  const selectionKey = JSON.stringify([owner, ids]);
  const [resolved, setResolved] = useState<{
    key: string;
    names: Record<string, string>;
  } | null>(null);
  useEffect(() => {
    if (!resolveSelections) return;
    const [selectedOwner, selectedIds] = JSON.parse(selectionKey) as [
      string,
      string[]
    ];
    if (!selectedIds.length) return;
    let current = true;
    const query = new URLSearchParams({ view: "mention-selections" });
    for (const id of selectedIds) query.append("id", id);
    void socialRequest<{ items: Person[] }>(
      `/api/platform/posts?${query}`,
      undefined,
      selectedOwner
    )
      .then(({ data }) => {
        if (current)
          setResolved({
            key: selectionKey,
            names: Object.fromEntries(data.items.map((p) => [p.id, p.name]))
          });
      })
      .catch(() => {
        if (current) {
          setResolved({ key: selectionKey, names: {} });
          setMessage(
            "Selected names could not be confirmed. Your text and selections are still here."
          );
        }
      });
    return () => {
      current = false;
    };
  }, [resolveSelections, selectionKey]);
  async function search(after?: string) {
    const request = ++seq.current;
    setPending(true);
    setMessage("");
    try {
      const { data } = await socialRequest<{
        items: Person[];
        nextCursor: string | null;
      }>(
        `/api/platform/${photoId ? "photo-tags" : postId ? "comments" : "posts"}?${new URLSearchParams({ view: photoId ? "people" : "mentions", ...(photoId ? { assetId: photoId } : postId ? { postId } : {}), q: query, ...(after ? { after } : {}) })}`,
        undefined,
        owner
      );
      if (request !== seq.current) return;
      setPeople((old) => (after ? [...old, ...data.items] : data.items));
      setNames((old) => ({
        ...old,
        ...Object.fromEntries(data.items.map((p) => [p.id, p.name]))
      }));
      setCursor(data.nextCursor);
      setActive(0);
      if (!data.items.length) setMessage("No eligible matches on this page.");
    } catch (e) {
      if (request === seq.current) {
        setPeople([]);
        setCursor(null);
        setMessage(
          e instanceof Error ? e.message : "Suggestions could not be loaded."
        );
      }
    } finally {
      if (request === seq.current) setPending(false);
    }
  }
  function select(person: Person) {
    if (ids.includes(person.id)) return;
    if (ids.length >= limit) {
      setMessage(
        `Choose at most ${limit} ${limit === 1 ? "person" : "people"}. Remove one before adding another.`
      );
      return;
    }
    onChange([...ids, person.id], person);
    setNames((old) => ({ ...old, [person.id]: person.name }));
    setPeople([]);
    setCursor(null);
    setQuery("");
    setMessage("");
  }
  return (
    <div className="space-y-2">
      <label htmlFor={label} className="font-semibold">
        {photoId ? "Choose an adult to tag" : "Mention someone (optional)"}
      </label>
      <div className="flex flex-wrap gap-2">
        <input
          id={label}
          role="combobox"
          aria-expanded={people.length > 0}
          aria-controls={`${label}-list`}
          aria-autocomplete="list"
          aria-activedescendant={
            people[active] ? `${label}-${active}` : undefined
          }
          autoComplete="off"
          className="min-w-0 flex-1 rounded border p-2"
          value={query}
          maxLength={100}
          disabled={disabled}
          onChange={(e) => {
            seq.current++;
            setQuery(e.target.value);
            setPeople([]);
            setCursor(null);
            setPending(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" && people.length) {
              e.preventDefault();
              setActive((i) => (i + 1) % people.length);
            }
            if (e.key === "ArrowUp" && people.length) {
              e.preventDefault();
              setActive((i) => (i + people.length - 1) % people.length);
            }
            if (e.key === "Escape") {
              e.preventDefault();
              setPeople([]);
            }
            if (e.key === "Enter") {
              e.preventDefault();
              if (people[active]) select(people[active]);
              else if (query.trim().length >= 2) void search();
            }
          }}
        />
        <button
          type="button"
          className="gc-button gc-button-quiet"
          disabled={disabled || pending || query.trim().length < 2}
          onClick={() => void search()}
        >
          {photoId ? "Find eligible adults" : "Find mentions"}
        </button>
      </div>
      <ul
        id={`${label}-list`}
        role="listbox"
        aria-label={photoId ? "Photo tag suggestions" : "Mention suggestions"}
      >
        {people.map((p, i) => (
          <li
            id={`${label}-${i}`}
            role="option"
            aria-selected={active === i}
            key={p.id}
          >
            <button
              type="button"
              className="gc-button gc-button-quiet"
              disabled={disabled || ids.includes(p.id)}
              onClick={() => select(p)}
            >
              {p.name} · @{p.username}
            </button>
          </li>
        ))}
      </ul>
      {cursor && (
        <button
          type="button"
          className="gc-button gc-button-quiet"
          disabled={pending || disabled}
          onClick={() => void search(cursor)}
        >
          {photoId ? "More tag suggestions" : "More mention suggestions"}
        </button>
      )}
      {ids.length > 0 && (
        <ul
          aria-label={photoId ? "Selected adult for tag" : "Selected mentions"}
          className="flex flex-wrap gap-2"
        >
          {ids.map((id, i) => (
            <li key={id}>
              <button
                type="button"
                className="gc-button gc-button-quiet"
                disabled={disabled}
                onClick={() => onChange(ids.filter((v) => v !== id))}
              >
                Remove{" "}
                {(resolveSelections
                  ? resolved?.key === selectionKey
                    ? resolved.names[id]
                    : undefined
                  : names[id]) ?? `selected mention ${i + 1}`}
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-sm text-gc-muted">
        {ids.length}/{limit} selected.{" "}
        {photoId
          ? "A private request asks for approval. Nothing is approved automatically."
          : "Typed @names alone do not notify anyone."}
      </p>
      <p role="status">{pending ? "Finding eligible people…" : message}</p>
    </div>
  );
}
