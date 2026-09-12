"use client";
import { useId, useRef, useState } from "react";
import { socialRequest } from "@/lib/platform/social-client";
type Person = { id: string; name: string; username: string };
export function CommentMentions({
  postId,
  owner,
  ids,
  onChange,
  disabled = false
}: {
  postId: string;
  owner: string;
  ids: string[];
  onChange: (ids: string[], person?: Person) => void;
  disabled?: boolean;
}) {
  const label = useId(),
    seq = useRef(0);
  const [query, setQuery] = useState(""),
    [people, setPeople] = useState<Person[]>([]),
    [names, setNames] = useState<Record<string, string>>({}),
    [cursor, setCursor] = useState<string | null>(null),
    [active, setActive] = useState(0),
    [pending, setPending] = useState(false),
    [message, setMessage] = useState("");
  async function search(after?: string) {
    const request = ++seq.current;
    setPending(true);
    setMessage("");
    try {
      const { data } = await socialRequest<{
        items: Person[];
        nextCursor: string | null;
      }>(
        `/api/platform/comments?${new URLSearchParams({ view: "mentions", postId, q: query, ...(after ? { after } : {}) })}`,
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
    if (ids.length >= 5) {
      setMessage(
        "Choose at most five people. Remove one before adding another."
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
        Mention someone (optional)
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
          Find mentions
        </button>
      </div>
      <ul id={`${label}-list`} role="listbox" aria-label="Mention suggestions">
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
          More mention suggestions
        </button>
      )}
      {ids.length > 0 && (
        <ul aria-label="Selected mentions" className="flex flex-wrap gap-2">
          {ids.map((id, i) => (
            <li key={id}>
              <button
                type="button"
                className="gc-button gc-button-quiet"
                disabled={disabled}
                onClick={() => onChange(ids.filter((v) => v !== id))}
              >
                Remove {names[id] ?? `selected mention ${i + 1}`}
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-sm text-gc-muted">
        {ids.length}/5 selected. Typed @names alone do not notify anyone.
      </p>
      <p role="status">{pending ? "Finding eligible people…" : message}</p>
    </div>
  );
}
