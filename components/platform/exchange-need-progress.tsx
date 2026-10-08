"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode
} from "react";
import type { NeedSlotView } from "@/lib/platform/exchange-need-reads";
import { socialRequest } from "@/lib/platform/social-client";

type ProgressView = Pick<
  NeedSlotView,
  | "id"
  | "status"
  | "target"
  | "unit"
  | "committed"
  | "received"
  | "returned"
  | "loan"
>;
function snapshot(version: number, slots: ProgressView[]) {
  const publicSlots = slots.map(
    ({ id, status, target, unit, committed, received, returned, loan }) => ({
      id,
      status,
      target,
      unit,
      committed,
      received,
      returned,
      loan
    })
  );
  return {
    version,
    slots: publicSlots,
    fingerprint: JSON.stringify([version, publicSlots])
  };
}
const ProgressContext = createContext<{
  owner: string | null;
  listingId: string;
  slots: ReadonlyMap<string, ProgressView>;
  available: boolean;
  checking: boolean;
  refresh: () => Promise<void>;
} | null>(null);
function summarySlots(data: unknown, owner: string | null, listingId: string) {
  if (!data || typeof data !== "object")
    throw new Error("Current need progress could not be confirmed.");
  const page = data as {
    ownerId?: unknown;
    listingId?: unknown;
    need?: { id?: unknown; version?: unknown; slots?: unknown } | null;
  };
  if (
    page.ownerId !== owner ||
    page.listingId !== listingId ||
    !page.need ||
    page.need.id !== listingId ||
    !Number.isSafeInteger(page.need.version) ||
    (page.need.version as number) < 1 ||
    !Array.isArray(page.need.slots) ||
    page.need.slots.length > 12
  )
    throw new Error("Current need progress could not be confirmed.");
  const slots: ProgressView[] = page.need.slots.map((value) => {
    if (!value || typeof value !== "object")
      throw new Error("Current need progress could not be confirmed.");
    const slot = value as Record<string, unknown>;
    if (
      typeof slot.id !== "string" ||
      !slot.id ||
      typeof slot.status !== "string" ||
      slot.status.length > 100 ||
      typeof slot.unit !== "string" ||
      slot.unit.length > 80 ||
      !Number.isSafeInteger(slot.target) ||
      (slot.target as number) < 0 ||
      !Number.isSafeInteger(slot.returned) ||
      (slot.returned as number) < 0 ||
      typeof slot.loan !== "boolean" ||
      ![slot.committed, slot.received].every(
        (number) =>
          number === null ||
          (Number.isSafeInteger(number) && (number as number) >= 0)
      )
    )
      throw new Error("Current need progress could not be confirmed.");
    return {
      id: slot.id,
      status: slot.status,
      target: slot.target as number,
      unit: slot.unit,
      committed: slot.committed as number | null,
      received: slot.received as number | null,
      returned: slot.returned as number,
      loan: slot.loan
    };
  });
  if (new Set(slots.map((slot) => slot.id)).size !== slots.length)
    throw new Error("Current need progress could not be confirmed.");
  return snapshot(page.need.version as number, slots);
}

type ProgressProps = {
  owner: string | null;
  listingId: string;
  needVersion: number;
  slots: ProgressView[];
  children: ReactNode;
};

function ProgressOwner({
  owner,
  listingId,
  needVersion,
  slots,
  children
}: ProgressProps) {
  const incoming = snapshot(needVersion, slots);
  const [state, setState] = useState(() => ({
    observed: incoming.fingerprint,
    current: incoming,
    disputed: false,
    generation: 0
  }));
  const [checking, setChecking] = useState(false);
  // Keep the highest revision from both sources. A permission change can alter
  // the public projection without advancing the Need, so equal revisions with
  // different totals must be concealed until a new canonical read succeeds.
  if (state.observed !== incoming.fingerprint) {
    const newer = incoming.version > state.current.version;
    setState({
      observed: incoming.fingerprint,
      current: newer ? incoming : state.current,
      disputed: newer
        ? false
        : state.disputed ||
          (incoming.version === state.current.version &&
            incoming.fingerprint !== state.current.fingerprint),
      generation: state.generation + 1
    });
  }
  const active = useRef(false);
  const generation = useRef(state.generation);
  const pending = useRef<{
    controller: AbortController;
    deadline: ReturnType<typeof setTimeout>;
  } | null>(null);
  const cancel = useCallback(() => {
    if (!pending.current) return;
    clearTimeout(pending.current.deadline);
    pending.current.controller.abort();
    pending.current = null;
  }, []);
  useLayoutEffect(() => {
    generation.current = state.generation;
    cancel();
    setChecking(false);
  }, [state.generation, cancel]);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      cancel();
    };
  }, [cancel]);
  const refresh = useCallback(async () => {
    if (!active.current) return;
    const requestGeneration = generation.current;
    cancel();
    const controller = new AbortController();
    const deadline = setTimeout(() => {
      controller.abort();
      if (pending.current?.controller === controller) {
        pending.current = null;
        if (active.current) setChecking(false);
      }
    }, 15000);
    pending.current = { controller, deadline };
    setChecking(true);
    try {
      const query = new URLSearchParams({ view: "need-need", listingId });
      const { data } = await socialRequest<unknown>(
        `/api/platform/exchange?${query}`,
        undefined,
        owner,
        "POST",
        undefined,
        controller.signal
      );
      if (
        active.current &&
        pending.current?.controller === controller &&
        !controller.signal.aborted
      ) {
        const current = summarySlots(data, owner, listingId);
        setState((latest) =>
          latest.generation === requestGeneration &&
          current.version >= latest.current.version
            ? { ...latest, current, disputed: false }
            : latest
        );
      }
    } finally {
      clearTimeout(deadline);
      if (pending.current?.controller === controller) {
        pending.current = null;
        if (active.current) setChecking(false);
      }
    }
  }, [owner, listingId, cancel]);
  useEffect(() => {
    if (state.disputed) void refresh().catch(() => {});
    // One recheck for each changed prop presentation, never a retry loop after
    // failure. Later manual refreshes can recover the concealed summary.
  }, [state.generation, state.disputed, refresh]);
  return (
    <ProgressContext.Provider
      value={{
        owner,
        listingId,
        available: !state.disputed,
        checking,
        slots: new Map(
          state.current.slots.map(
            ({
              id,
              status,
              target,
              unit,
              committed,
              received,
              returned,
              loan
            }) => [
              id,
              { id, status, target, unit, committed, received, returned, loan }
            ]
          )
        ),
        refresh
      }}
    >
      {children}
    </ProgressContext.Provider>
  );
}

export function ExchangeNeedProgressProvider(props: ProgressProps) {
  return (
    <ProgressOwner
      key={`${props.owner ?? "public"}\u0000${props.listingId}`}
      {...props}
    />
  );
}

export function useNeedProgressRefresh(
  owner: string | null,
  listingId: string | null
) {
  const progress = useContext(ProgressContext);
  return progress?.owner === owner && progress.listingId === listingId
    ? progress.refresh
    : null;
}

export function NeedSlotProgress({
  slot,
  owner,
  listingId
}: {
  slot: ProgressView;
  owner: string | null;
  listingId: string;
}) {
  const progress = useContext(ProgressContext);
  const matching =
    progress?.owner === owner && progress.listingId === listingId;
  const value = matching
    ? progress.available
      ? progress.slots.get(slot.id)
      : null
    : slot;
  // A frozen child must never restore old totals when its current owner has
  // concealed them or removed its slot.
  if (!value)
    return (
      <div>
        <p role="status">
          {progress?.checking
            ? "Checking current progress."
            : "Current progress is unavailable."}
        </p>
        <button
          type="button"
          disabled={progress?.checking}
          onClick={() => void progress?.refresh().catch(() => {})}
        >
          Check progress
        </button>
      </div>
    );
  return (
    <>
      <p>
        {value.status}. Target: {value.target} {value.unit}.{" "}
        {value.committed !== null && (
          <>
            Committed: {value.committed}. Received: {value.received}.
          </>
        )}
      </p>
      {value.received !== null && (
        <p>
          Unreceived target: {Math.max(0, value.target - value.received)}{" "}
          {value.unit}. Uncommitted:{" "}
          {Math.max(0, value.target - (value.committed ?? 0))} {value.unit}.
        </p>
      )}
      {value.loan && (
        <p>
          Equipment loan. Returned: {value.returned} of {value.received ?? 0}{" "}
          received.
        </p>
      )}
    </>
  );
}
