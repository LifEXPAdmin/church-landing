"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode
} from "react";
import type { NeedSlotView } from "@/lib/platform/exchange-need-reads";

const NeedProgressContext = createContext<ReadonlyMap<
  string,
  NeedSlotView
> | null>(null);
function slotMap(slots: NeedSlotView[]) {
  const current = new Map<string, NeedSlotView>();
  for (const slot of slots) current.set(slot.id, slot);
  return current;
}
function sameProgress(
  current: ReadonlyMap<string, NeedSlotView>,
  next: ReadonlyMap<string, NeedSlotView>
) {
  if (current.size !== next.size) return false;
  for (const [id, slot] of next) {
    const previous = current.get(id);
    if (
      !previous ||
      previous.status !== slot.status ||
      previous.target !== slot.target ||
      previous.unit !== slot.unit ||
      previous.committed !== slot.committed ||
      previous.received !== slot.received
    )
      return false;
  }
  return true;
}

export function ExchangeNeedProgressProvider({
  slots,
  children
}: {
  slots: NeedSlotView[];
  children: ReactNode;
}) {
  const [current, setCurrent] = useState(() => slotMap(slots));
  useEffect(() => {
    const next = slotMap(slots);
    setCurrent((previous) => (sameProgress(previous, next) ? previous : next));
  }, [slots]);
  return (
    <NeedProgressContext.Provider value={current}>
      {children}
    </NeedProgressContext.Provider>
  );
}

export function NeedSlotProgress({ slot }: { slot: NeedSlotView }) {
  const current = useContext(NeedProgressContext)?.get(slot.id) ?? slot;
  return (
    <>
      <p>
        {current.status}. Target: {current.target} {current.unit}.{" "}
        {current.committed !== null && (
          <>
            Committed: {current.committed}. Received: {current.received}.
          </>
        )}
      </p>
      {current.received !== null && (
        <p>
          Unreceived target: {Math.max(0, current.target - current.received)}{" "}
          {current.unit}. Uncommitted:{" "}
          {Math.max(0, current.target - (current.committed ?? 0))}{" "}
          {current.unit}.
        </p>
      )}
    </>
  );
}
