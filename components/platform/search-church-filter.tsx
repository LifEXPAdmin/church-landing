"use client";
import { useEffect, useRef, useState } from "react";
import { socialRequest } from "@/lib/platform/social-client";
type Church = { id: string; label: string; city: string; region: string };
export function SearchChurchFilter({
  value,
  onChange
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  const [query, setQuery] = useState(""),
    [rows, setRows] = useState<Church[]>([]),
    [next, setNext] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [selectedName, setSelectedName] = useState("");
  const generation = useRef(0),
    inFlight = useRef(false);
  useEffect(
    () => () => {
      generation.current++;
    },
    []
  );
  async function find(after?: string) {
    if (inFlight.current || !query.trim()) return;
    inFlight.current = true;
    setBusy(true);
    setMessage("Finding churches…");
    const seq = ++generation.current;
    try {
      const r = await socialRequest<{
        items: Church[];
        nextCursor: string | null;
      }>(
        `/api/platform/search?${new URLSearchParams({ kind: "churches", q: query.trim(), ...(after ? { after } : {}) })}`
      );
      if (seq !== generation.current) return;
      setRows((old) =>
        after
          ? [
              ...new Map(
                [...old, ...r.data.items].map((c) => [c.id, c])
              ).values()
            ]
          : r.data.items
      );
      setNext(r.data.nextCursor);
      setMessage(
        r.data.items.length
          ? "Choose a church to filter results."
          : "No matching churches."
      );
    } catch (e) {
      if (seq === generation.current)
        setMessage(
          e instanceof Error
            ? e.message
            : "Churches could not be loaded. Try again."
        );
    } finally {
      if (seq === generation.current) {
        inFlight.current = false;
        setBusy(false);
      }
    }
  }
  return (
    <fieldset className="space-y-2 rounded border border-gc-divider p-3">
      <legend className="font-semibold">Church filter</legend>
      {value ? (
        <div>
          <input type="hidden" name="churchId" value={value} />
          <p>
            {selectedName || "A church is selected."}{" "}
            <a
              className="underline"
              href={`/platform/churches/${encodeURIComponent(value)}`}
            >
              View selected church
            </a>
          </p>
          <button
            type="button"
            className="gc-button gc-button-quiet"
            onClick={() => {
              onChange("");
              setSelectedName("");
            }}
          >
            Clear church filter
          </button>
        </div>
      ) : (
        <>
          <label className="block">
            Find a church by name
            <input
              aria-label="Find a church by name"
              className="block w-full rounded border border-gc-divider bg-gc-canvas p-2"
              value={query}
              maxLength={200}
              onChange={(e) => {
                generation.current++;
                inFlight.current = false;
                setBusy(false);
                setQuery(e.target.value);
                setRows([]);
                setNext(null);
                setMessage("");
              }}
            />
          </label>
          <button
            type="button"
            className="gc-button gc-button-quiet"
            disabled={busy || !query.trim()}
            onClick={() => void find()}
          >
            Find churches for filter
          </button>
          <p role="status">{message}</p>
          {rows.map((c) => (
            <button
              key={c.id}
              type="button"
              className="block min-h-11 w-full break-words rounded border p-2 text-left"
              onClick={() => {
                onChange(c.id);
                setSelectedName(c.label);
                setRows([]);
                setNext(null);
              }}
            >
              Choose {c.label}
              {c.city ? ` · ${c.city}` : ""}
            </button>
          ))}
          {next && (
            <button
              type="button"
              className="gc-button gc-button-quiet"
              disabled={busy}
              onClick={() => void find(next)}
            >
              More churches for filter
            </button>
          )}
        </>
      )}
    </fieldset>
  );
}
