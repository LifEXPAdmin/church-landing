"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useChurchChartDraft } from "./use-church-chart-draft";
import { useChurchRefresh } from "./use-church-refresh";
import type {
  StructureSnapshot,
  PositionSummary
} from "@/lib/platform/church-structure-types";
import {
  applyChartChanges,
  chartChanges,
  moveChartBranch,
  type ChartChange,
  type ChartPlacement
} from "@/lib/platform/church-chart-model";

type EditorPosition = PositionSummary & { layout: ChartPlacement["layout"] };
type Base = {
  positions: EditorPosition[];
  version: number;
  canManage: boolean;
};
type Review = {
  operation: "chart-save";
  churchId: string;
  expectedVersion: number;
  requestKey: string;
  confirmed: true;
  changes: ChartChange[];
};
const normalize = (positions: PositionSummary[]): EditorPosition[] =>
  positions.map((p) => ({ ...p, layout: p.layout ?? null }));
const geometry = (positions: ChartPlacement[]): ChartPlacement[] =>
  positions.map(({ id, parentId, placement, layout }) => ({
    id,
    parentId,
    placement,
    layout
  }));
const errorText = (error: unknown) =>
  error instanceof Error ? error.message : "This change is not available.";

// Draft/undo history contains geometry only. Names and assignment projections
// always come from the current server read, including after conflict recovery.
export function useChurchChartEditor(
  churchId: string,
  connectionId: string,
  initial: {
    positions: PositionSummary[];
    version: number;
    canManage: boolean;
  }
) {
  const [base, setBase] = useState<Base>(() => ({
    ...initial,
    positions: normalize(initial.positions)
  }));
  const [history, setHistory] = useState(() => ({
    entries: [geometry(normalize(initial.positions))],
    index: 0
  }));
  const [editing, setEditing] = useState(false);
  const [review, setReview] = useState<Review | null>(null);
  const [retained, setRetained] = useState<ChartChange[] | null>(null);
  const [requiresReload, setRequiresReload] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const readRevision = useRef(0);
  const [unavailable, setUnavailable] = useState(false);
  const [accessChecked, setAccessChecked] = useState(false);
  const allowLeave = useRef(false);
  const [message, setMessage] = useState("");
  const [leaveTarget, setLeaveTarget] = useState<string | null>(null);
  const draft = history.entries[history.index];
  const changes = useMemo(
    () => retained ?? chartChanges(base.positions, draft),
    [retained, base.positions, draft]
  );
  const positions = useMemo(
    () =>
      retained ? base.positions : applyChartChanges(base.positions, draft),
    [retained, base.positions, draft]
  );
  const draftStorage = useChurchChartDraft(churchId, connectionId, {
    version: base.version,
    changes,
    retry:
      review && (uncertain || (busy && !requiresReload))
        ? {
            expectedVersion: review.expectedVersion,
            requestKey: review.requestKey,
            changes: review.changes
          }
        : null
  });
  const dirty = changes.length > 0 || !!draftStorage.recovered;
  const canChange =
    editing &&
    accessChecked &&
    base.canManage &&
    !busy &&
    !review &&
    !requiresReload &&
    retained === null &&
    !draftStorage.recovered;
  const currentRead = useChurchRefresh({
    url: `/api/platform/church-structure?${new URLSearchParams({ churchId, view: "structure" })}`,
    paused: () => busyRef.current,
    revision: () => readRevision.current,
    onData(value) {
      const data = value as StructureSnapshot;
      if (
        data.church?.id !== churchId ||
        data.ownConnectionId !== connectionId ||
        !Number.isSafeInteger(data.version) ||
        !Array.isArray(data.positions) ||
        !Array.isArray(data.capabilities)
      )
        throw new Error("Invalid current chart");
      const next: Base = {
        positions: normalize(data.positions),
        version: data.version,
        canManage: data.capabilities.includes("MANAGE_STRUCTURE")
      };
      setUnavailable(false);
      setAccessChecked(true);
      if (uncertain) {
        // Refresh private projections while preserving the exact retry request.
        setBase(next);
        setHistory({ entries: [geometry(next.positions)], index: 0 });
        setRetained(review?.changes ?? changes);
        return;
      }
      if (
        next.version !== base.version ||
        unavailable ||
        next.canManage !== base.canManage
      ) {
        const kept = changes;
        resetDraft(next);
        if (kept.length) {
          setRetained(kept);
          setMessage(
            next.canManage
              ? "Current positions and sharing choices are loaded. Your placement choices are kept; apply them and review again."
              : "Your church permissions changed. Placement choices are kept, but editing is unavailable without permission."
          );
        } else if (unavailable)
          setMessage("Current church information is available again.");
      } else {
        // Consent can change without a chart version change. Keep geometry-only
        // undo history, but replace all names and assignments from this read.
        setBase(next);
      }
    },
    onUnavailable() {
      hideUnavailable();
    }
  });
  function hideUnavailable() {
    setAccessChecked(false);
    setBase({ positions: [], version: base.version, canManage: false });
    setHistory({ entries: [[]], index: 0 });
    setRetained(review?.changes ?? changes);
    setUnavailable(true);
    if (!uncertain) {
      setReview(null);
      setRequiresReload(true);
    }
    setMessage(
      "Current church information could not be confirmed. Member details are hidden. Placement choices are kept; refresh when access is available."
    );
  }
  useEffect(() => {
    if (!dirty && !uncertain) return;
    const unload = (event: BeforeUnloadEvent) => {
      if (!allowLeave.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    const click = (event: MouseEvent) => {
      if (
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const link =
        event.target instanceof Element
          ? event.target.closest<HTMLAnchorElement>("a[href]")
          : null;
      if (
        !link ||
        link.target === "_blank" ||
        link.hasAttribute("download") ||
        link.getAttribute("href")?.startsWith("#")
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      setLeaveTarget(link.href);
    };
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", click, true);
    return () => {
      window.removeEventListener("beforeunload", unload);
      document.removeEventListener("click", click, true);
    };
  }, [dirty, uncertain]);
  function resetDraft(next: Base) {
    setBase(next);
    setHistory({ entries: [geometry(next.positions)], index: 0 });
    setReview(null);
    setRetained(null);
    setRequiresReload(false);
    setUncertain(false);
  }
  function stage(next: EditorPosition[], description: string) {
    if (!canChange || busyRef.current) return;
    draftStorage.allowNewDraft();
    const values = geometry(next);
    if (!chartChanges(draft, values).length) {
      setMessage(
        "This already matches the current chart. No change was needed."
      );
      return;
    }
    setHistory((current) => {
      const entries = [
        ...current.entries.slice(0, current.index + 1).slice(-99),
        values
      ];
      return { entries, index: entries.length - 1 };
    });
    setMessage(
      description +
        (chartChanges(base.positions, values).length
          ? " This change is not saved yet."
          : " The chart now matches the saved version.")
    );
  }
  function move(
    id: string,
    placement: ChartPlacement["placement"],
    parentId: string | null
  ) {
    if (!canChange || busyRef.current) return;
    try {
      stage(
        moveChartBranch(positions, id, placement, parentId),
        "Reporting change staged."
      );
    } catch (error) {
      setMessage(errorText(error));
    }
  }
  function moveOnGrid(id: string, layout: ChartPlacement["layout"]) {
    if (!canChange || busyRef.current) return;
    const p = positions.find((p) => p.id === id);
    if (!p) return;
    try {
      stage(
        applyChartChanges(positions, [
          { id, parentId: p.parentId, placement: p.placement, layout }
        ]),
        "Card layout changed. Reporting and privileges are unchanged."
      );
    } catch (error) {
      setMessage(errorText(error));
    }
  }
  function autoArrange() {
    if (!canChange || busyRef.current) return;
    stage(
      positions.map((p) => ({ ...p, layout: null })),
      "Automatic card placement restored."
    );
  }
  function prepareReview() {
    if (!canChange || !dirty) return;
    setReview({
      operation: "chart-save",
      churchId,
      expectedVersion: base.version,
      requestKey: crypto.randomUUID(),
      changes,
      confirmed: true
    });
    setMessage("");
  }
  async function save() {
    if (!review || requiresReload || busyRef.current || !base.canManage) return;
    busyRef.current = true;
    readRevision.current += 1;
    setBusy(true);
    draftStorage.persist({
      version: base.version,
      changes: review.changes,
      retry: {
        expectedVersion: review.expectedVersion,
        requestKey: review.requestKey,
        changes: review.changes
      }
    });
    setMessage("");
    try {
      const response = await fetch("/api/platform/church-structure", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(review)
      });
      const data = await response.json();
      if (!response.ok) {
        if ([400, 401, 403, 404, 409].includes(response.status)) {
          setRequiresReload(true);
          setUncertain(false);
          setMessage(
            "The saved chart or your access changed. Your choices are kept. Load current positions before reviewing again."
          );
        } else {
          setUncertain(true);
          setMessage(
            "The save could not be confirmed. Your reviewed changes and retry reference are kept. Retry this same save."
          );
        }
        return;
      }
      if (
        !Number.isSafeInteger(data.version) ||
        data.version <= review.expectedVersion
      )
        throw new Error("Unconfirmed save result");
      // An exact retry may acknowledge an older receipt after reload already
      // loaded that save or a newer chart. Do not roll the current chart back.
      const alreadyLoaded = data.version <= base.version;
      resetDraft({
        ...base,
        positions: alreadyLoaded
          ? base.positions
          : applyChartChanges(base.positions, review.changes),
        version: Math.max(base.version, data.version)
      });
      setMessage(
        alreadyLoaded
          ? "Your earlier chart save is confirmed. The current saved chart is shown."
          : "Chart changes saved. Assignments and permissions are unchanged."
      );
    } catch {
      setUncertain(true);
      setMessage(
        "The save could not be confirmed. Your reviewed changes and retry reference are kept. Retry this same save."
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  async function reloadCurrent() {
    if (busyRef.current) return;
    busyRef.current = true;
    readRevision.current += 1;
    setBusy(true);
    const kept = review?.changes ?? changes;
    try {
      const response = await fetch(
        `/api/platform/church-structure?churchId=${encodeURIComponent(churchId)}&view=structure`,
        { cache: "no-store", credentials: "same-origin" }
      );
      if (!response.ok) {
        hideUnavailable();
        return;
      }
      const data = await response.json();
      if (
        data.church?.id !== churchId ||
        data.ownConnectionId !== connectionId ||
        !Number.isSafeInteger(data.version) ||
        !Array.isArray(data.positions) ||
        !Array.isArray(data.capabilities)
      )
        throw new Error("Invalid current chart");
      const next = {
        positions: normalize(data.positions),
        version: data.version,
        canManage: data.capabilities.includes("MANAGE_STRUCTURE")
      };
      resetDraft(next);
      setUnavailable(false);
      setAccessChecked(true);
      setRetained(kept.length ? kept : null);
      setMessage(
        "Current positions are loaded. Review the retained changes below before applying them to this version."
      );
    } catch {
      hideUnavailable();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  function applyRetained(next = retained) {
    if (!next || !base.canManage || busyRef.current) return;
    try {
      const rebased = applyChartChanges(base.positions, next);
      setHistory({
        entries: [geometry(base.positions), geometry(rebased)],
        index: 1
      });
      setRetained(null);
      setRequiresReload(false);
      setReview(null);
      setUncertain(false);
      setMessage(
        chartChanges(base.positions, rebased).length
          ? "Your choices are restored on the current chart. Review and save them again."
          : "The current saved chart already matches these choices."
      );
    } catch (error) {
      setMessage(
        errorText(error) +
          " Your draft is kept. Remove an unavailable change below or discard the draft."
      );
    }
  }
  function removeRetained(id: string) {
    if (!retained || busyRef.current) return;
    const next = retained.filter((change) => change.id !== id);
    setRetained(next);
    if (!next.length) {
      resetDraft(base);
      setMessage("Retained changes discarded.");
    }
  }
  function discard() {
    if (busyRef.current || uncertain) return;
    draftStorage.discard();
    resetDraft(base);
    setMessage("Unsaved changes discarded.");
  }
  function recoverDraft() {
    const saved = draftStorage.recovered;
    if (
      !saved ||
      !base.canManage ||
      busyRef.current ||
      unavailable ||
      !accessChecked
    )
      return;
    draftStorage.allowNewDraft();
    setEditing(true);
    setRetained(saved.changes);
    setHistory({ entries: [geometry(base.positions)], index: 0 });
    setRequiresReload(false);
    if (saved.retry) {
      setReview({
        operation: "chart-save",
        churchId,
        confirmed: true,
        ...saved.retry
      });
      setUncertain(true);
      setMessage(
        "Your previous save could not be confirmed before leaving. Current chart information is shown. Confirm the retained request before retrying; it will not create a second save."
      );
    } else {
      setReview(null);
      setUncertain(false);
      setMessage(
        "Your placement choices were recovered from this tab. Apply them to the current chart and review before saving."
      );
    }
    draftStorage.consume();
  }
  return {
    positions,
    unavailable,
    recoveredDraft: draftStorage.recovered,
    recoveryAvailable: draftStorage.available,
    recoveryAccessChecked: accessChecked,
    recoverDraft,
    discardRecoveredDraft: () => {
      draftStorage.discard();
      setMessage("Stored draft discarded. The saved chart is unchanged.");
    },
    retryMatchesCurrent:
      !!review &&
      uncertain &&
      !chartChanges(base.positions, review.changes).length,
    refreshing: currentRead.pending,
    refresh: currentRead.refresh,
    basePositions: base.positions,
    version: base.version,
    canManage: base.canManage,
    editing,
    setEditing,
    dirty,
    changes,
    canChange,
    busy,
    message,
    setMessage,
    review,
    uncertain,
    requiresReload,
    retained,
    move,
    moveOnGrid,
    autoArrange,
    prepareReview,
    save,
    reloadCurrent,
    applyRetained,
    removeRetained,
    discard,
    cancelReview: () => {
      if (!busy && !uncertain && !requiresReload) setReview(null);
    },
    canUndo: canChange && history.index > 0,
    canRedo: canChange && history.index < history.entries.length - 1,
    undo: () => {
      if (canChange && !busyRef.current && history.index > 0) {
        setHistory((current) => ({
          ...current,
          index: Math.max(0, current.index - 1)
        }));
        setMessage("Last chart change undone. Permissions are unchanged.");
      }
    },
    redo: () => {
      if (
        canChange &&
        !busyRef.current &&
        history.index < history.entries.length - 1
      ) {
        setHistory((current) => ({
          ...current,
          index: Math.min(current.entries.length - 1, current.index + 1)
        }));
        setMessage("Chart change restored. Permissions are unchanged.");
      }
    },
    leaveTarget,
    keepDraftAndLeave: () => {
      if (!leaveTarget || busyRef.current) return;
      if (!draftStorage.persist()) {
        setMessage(
          "This browser could not keep the draft. Stay here until you save it, or explicitly discard it."
        );
        return;
      }
      allowLeave.current = true;
      window.location.assign(leaveTarget);
    },
    cancelLeave: () => setLeaveTarget(null),
    confirmLeave: () => {
      if (leaveTarget && !busy) {
        draftStorage.discard();
        allowLeave.current = true;
        resetDraft(base);
        setLeaveTarget(null);
        window.location.assign(leaveTarget);
      }
    }
  };
}
