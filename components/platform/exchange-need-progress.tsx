"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode
} from "react";
import type { NeedSlotView } from "@/lib/platform/exchange-need-reads";
import { socialRequest } from "@/lib/platform/social-client";

type ProgressView = Pick<
  NeedSlotView,
  "id" | "status" | "target" | "unit" | "committed" | "received" | "returned"
>;
const ProgressContext = createContext<{
  owner: string | null;
  listingId: string;
  slots: ReadonlyMap<string, ProgressView>;
  refresh: () => Promise<void>;
} | null>(null);
function summarySlots(
  data: unknown,
  owner: string,
  listingId: string
): ProgressView[] {
  if (!data || typeof data !== "object")
    throw new Error("Current need progress could not be confirmed.");
  const page = data as {
    ownerId?: unknown;
    listingId?: unknown;
    need?: { id?: unknown; slots?: unknown } | null;
  };
  if (
    page.ownerId !== owner ||
    page.listingId !== listingId ||
    !page.need ||
    page.need.id !== listingId ||
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
      returned: slot.returned as number
    };
  });
  if (new Set(slots.map((slot) => slot.id)).size !== slots.length)
    throw new Error("Current need progress could not be confirmed.");
  return slots;
}

type ProgressProps = {
  owner: string | null;
  listingId: string;
  slots: ProgressView[];
  children: ReactNode;
};

function ProgressOwner({ owner, listingId, slots, children }: ProgressProps) {
  const [confirmed, setConfirmed] = useState<ProgressView[] | null>(null);
  const active = useRef(false);
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
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      cancel();
    };
  }, [cancel]);
  const refresh = useCallback(async () => {
    if (!owner || !active.current) return;
    cancel();
    const controller = new AbortController();
    const deadline = setTimeout(() => controller.abort(), 15000);
    pending.current = { controller, deadline };
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
      )
        setConfirmed(summarySlots(data, owner, listingId));
    } finally {
      clearTimeout(deadline);
      if (pending.current?.controller === controller) pending.current = null;
    }
  }, [owner, listingId, cancel]);
  // A receipt's fresh read wins over an older, delayed server render. Retain
  // only public totals for this visit; a new account, need or visit gets its
  // own owner. Context also reaches children retained by a recovery guard.
  const progress = confirmed ?? slots;
  return (
    <ProgressContext.Provider
      value={{
        owner,
        listingId,
        slots: new Map(
          progress.map(
            ({ id, status, target, unit, committed, received, returned }) => [
              id,
              { id, status, target, unit, committed, received, returned }
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
  owner: string,
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
  slot: ProgressView & Pick<NeedSlotView, "loan">;
  owner: string | null;
  listingId: string;
}) {
  const progress = useContext(ProgressContext);
  const value =
    (progress?.owner === owner && progress.listingId === listingId
      ? progress.slots.get(slot.id)
      : null) ?? slot;
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
      {slot.loan && (
        <p>
          Equipment loan. Returned: {value.returned} of {value.received ?? 0}{" "}
          received.
        </p>
      )}
    </>
  );
}
