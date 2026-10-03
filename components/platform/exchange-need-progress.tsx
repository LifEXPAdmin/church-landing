"use client";
import { useEffect, useState, type ReactNode } from "react";
import type { NeedSlotView } from "@/lib/platform/exchange-need-reads";
import { socialRequest } from "@/lib/platform/social-client";

type ProgressView = Pick<
  NeedSlotView,
  "id" | "status" | "target" | "unit" | "committed" | "received"
>;
const snapshots = new Map<string, ReadonlyMap<string, ProgressView>>();
const listeners = new Map<string, Set<() => void>>();
const controllers = new Map<string, AbortController>();

function scope(owner: string | null, listingId: string) {
  return `${owner ?? "public"}\u0000${listingId}`;
}
function sameProgress(
  current: ReadonlyMap<string, ProgressView>,
  next: ReadonlyMap<string, ProgressView>
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
function publish(
  owner: string | null,
  listingId: string,
  slots: ProgressView[]
) {
  const key = scope(owner, listingId),
    next = new Map(slots.map((slot) => [slot.id, slot]));
  const previous = snapshots.get(key) ?? new Map<string, ProgressView>();
  if (sameProgress(previous, next)) return;
  snapshots.set(key, next);
  for (const listener of listeners.get(key) ?? []) listener();
}
function read(owner: string | null, listingId: string, slotId: string) {
  if (typeof window === "undefined") return null;
  return snapshots.get(scope(owner, listingId))?.get(slotId) ?? null;
}
function subscribe(
  owner: string | null,
  listingId: string,
  listener: () => void
) {
  const key = scope(owner, listingId),
    subscribers = listeners.get(key) ?? new Set<() => void>();
  subscribers.add(listener);
  listeners.set(key, subscribers);
  return () => {
    subscribers.delete(listener);
    if (!subscribers.size) listeners.delete(key);
  };
}
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
      received: slot.received as number | null
    };
  });
  if (new Set(slots.map((slot) => slot.id)).size !== slots.length)
    throw new Error("Current need progress could not be confirmed.");
  return slots;
}

export function refreshNeedProgress(owner: string, listingId: string) {
  if (!owner || !listingId || typeof window === "undefined")
    return Promise.resolve();
  const key = scope(owner, listingId),
    controller = new AbortController();
  controllers.get(key)?.abort();
  controllers.set(key, controller);
  const deadline = setTimeout(() => controller.abort(), 15000);
  const query = new URLSearchParams({ view: "need-need", listingId });
  return socialRequest<unknown>(
    `/api/platform/exchange?${query}`,
    undefined,
    owner,
    "POST",
    undefined,
    controller.signal
  )
    .then(({ data }) => {
      if (controllers.get(key) !== controller || controller.signal.aborted)
        return;
      publish(owner, listingId, summarySlots(data, owner, listingId));
    })
    .finally(() => {
      clearTimeout(deadline);
      if (controllers.get(key) === controller) controllers.delete(key);
    });
}

export function ExchangeNeedProgressProvider({
  owner,
  listingId,
  slots,
  children
}: {
  owner: string | null;
  listingId: string;
  slots: NeedSlotView[];
  children: ReactNode;
}) {
  useEffect(() => {
    publish(
      owner,
      listingId,
      slots.map(({ id, status, target, unit, committed, received }) => ({
        id,
        status,
        target,
        unit,
        committed,
        received
      }))
    );
  }, [owner, listingId, slots]);
  return <>{children}</>;
}

export function NeedSlotProgress({
  slot,
  owner,
  listingId
}: {
  slot: NeedSlotView;
  owner: string | null;
  listingId: string;
}) {
  const [current, setCurrent] = useState(() => read(owner, listingId, slot.id));
  const key = scope(owner, listingId);
  useEffect(() => {
    setCurrent(read(owner, listingId, slot.id));
    return subscribe(owner, listingId, () =>
      setCurrent(read(owner, listingId, slot.id))
    );
  }, [key, owner, listingId, slot.id]);
  const value = current ?? slot;
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
    </>
  );
}
