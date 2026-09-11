"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import type { PositionSummary } from "@/lib/platform/church-structure-types";
import type { ChartPlacement } from "@/lib/platform/church-chart-model";
import {
  CHART_GRID,
  snapChartCoordinate
} from "@/lib/platform/church-chart-model";
import {
  positionPlacementLabel,
  canReportTo
} from "@/lib/platform/church-position-placement";
import type { useChurchChartEditor } from "./use-church-chart-editor";
import { portalInputClass, portalButtonClass } from "./portal-action-form";

export type ChartEditor = ReturnType<typeof useChurchChartEditor>;
export const chartControlClass =
  "inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-xl border border-gc-divider bg-gc-surface px-3 py-2 text-sm font-semibold text-gc-text hover:bg-gc-selected focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gc-focus disabled:opacity-50 disabled:cursor-not-allowed";
function placementText(
  value: Pick<ChartPlacement, "placement" | "parentId">,
  positions: PositionSummary[]
) {
  return value.placement === "ROOT"
    ? "Top of chart"
    : value.placement === "UNCONNECTED"
      ? "Not connected yet"
      : `Reports to ${positions.find((p) => p.id === value.parentId)?.name ?? "an unavailable position"}`;
}
export function ChurchChartEditorControls({
  editor,
  selectedId,
  selectPosition,
  positionPicker,
  selectedGrid
}: {
  editor: ChartEditor;
  selectedId: string;
  selectPosition: (id: string) => void;
  positionPicker: RefObject<HTMLSelectElement | null>;
  selectedGrid?: { x: number; y: number };
}) {
  const [confirmed, setConfirmed] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const editorHeading = useRef<HTMLHeadingElement>(null);
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  const reviewButton = useRef<HTMLButtonElement>(null);
  const leaveHeading = useRef<HTMLHeadingElement>(null);
  const discardHeading = useRef<HTMLHeadingElement>(null);
  const recoveryHeading = useRef<HTMLHeadingElement>(null);
  const hadRecovery = useRef(false);
  const hadReview = useRef(false);
  useEffect(() => {
    if (editor.recoveredDraft) recoveryHeading.current?.focus();
    else if (hadRecovery.current) editorHeading.current?.focus();
    hadRecovery.current = !!editor.recoveredDraft;
  }, [editor.recoveredDraft]);
  const [destination, setDestination] = useState("UNCONNECTED");
  const selected = editor.positions.find((p) => p.id === selectedId);
  useEffect(() => {
    setConfirmed(false);
    if (editor.review) reviewHeading.current?.focus();
    else if (hadReview.current) editorHeading.current?.focus();
    hadReview.current = !!editor.review;
  }, [editor.review]);
  useEffect(() => {
    if (editor.leaveTarget) leaveHeading.current?.focus();
  }, [editor.leaveTarget]);
  useEffect(() => {
    if (discarding) discardHeading.current?.focus();
  }, [discarding]);
  useEffect(() => {
    setDestination(
      selected?.parentId
        ? `parent:${selected.parentId}`
        : (selected?.placement ?? "UNCONNECTED")
    );
  }, [selected?.id, selected?.parentId, selected?.placement]);
  const changes = (
    <ol className="space-y-3">
      {editor.changes.map((change) => {
        const before = editor.basePositions.find((p) => p.id === change.id);
        const layoutChanged =
          before?.layout?.x !== change.layout?.x ||
          before?.layout?.y !== change.layout?.y;
        return (
          <li
            key={change.id}
            className="rounded-xl border border-gc-divider p-3"
          >
            <p className="font-semibold">
              {before?.name ?? "Unavailable position"}
              {before && (
                <span className="ml-2 text-xs font-normal text-gc-muted">
                  Position {before.id.slice(-6)}
                </span>
              )}
            </p>
            {before?.description && (
              <p className="mt-1 text-sm text-gc-muted">{before.description}</p>
            )}
            <p className="mt-1 text-sm text-gc-muted">
              {before
                ? placementText(before, editor.basePositions)
                : "Previous position is unavailable"}{" "}
              → {placementText(change, editor.basePositions)}
            </p>
            {layoutChanged && (
              <p className="mt-1 text-sm text-gc-muted">
                Card layout:{" "}
                {change.layout
                  ? "Move to the chosen grid location"
                  : "Use automatic placement"}
                .
              </p>
            )}
            {editor.retained && (
              <button
                type="button"
                className={`${chartControlClass} mt-2`}
                disabled={editor.busy || editor.uncertain}
                onClick={() => editor.removeRetained(change.id)}
              >
                Remove this retained change
              </button>
            )}
          </li>
        );
      })}
    </ol>
  );
  return (
    <section
      className="gc-chart-editor space-y-4 rounded-2xl border border-gc-divider bg-gc-surface p-4 sm:p-5"
      aria-label="Edit church structure"
    >
      {editor.recoveredDraft && (
        <section
          aria-label="Recover chart draft"
          className="space-y-3 rounded-xl border border-gc-action p-4"
        >
          <h3
            ref={recoveryHeading}
            tabIndex={-1}
            className="text-2xl outline-none"
          >
            Recover your chart draft
          </h3>
          <p className="text-sm text-gc-muted">
            This tab kept {editor.recoveredDraft.changes.length} placement{" "}
            {editor.recoveredDraft.changes.length === 1 ? "choice" : "choices"}{" "}
            from before you left. Member details and permissions are loaded
            fresh. Nothing will be saved automatically.
          </p>
          {editor.recoveredDraft.retry && (
            <p className="text-sm">
              The previous save may already have completed. Its original retry
              reference is kept.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={portalButtonClass}
              disabled={
                !editor.canManage ||
                editor.busy ||
                editor.unavailable ||
                !editor.recoveryAccessChecked
              }
              onClick={editor.recoverDraft}
            >
              Recover choices for review
            </button>
            <button
              type="button"
              className={chartControlClass}
              disabled={editor.busy}
              onClick={editor.discardRecoveredDraft}
            >
              Discard stored draft
            </button>
          </div>
        </section>
      )}
      {!editor.recoveryAvailable && (
        <p role="status" className="rounded-xl bg-gc-subtle p-3 text-sm">
          This browser could not keep a recovery copy. Keep this tab open until
          your changes are saved.
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2
            ref={editorHeading}
            tabIndex={-1}
            className="text-2xl outline-none"
          >
            {editor.editing ? "Edit structure" : "View church structure"}
          </h2>
          <p className="mt-1 text-sm text-gc-muted">
            {editor.recoveredDraft
              ? "A stored draft is waiting for review"
              : editor.dirty
                ? `${editor.changes.length} unsaved position ${editor.changes.length === 1 ? "change" : "changes"}`
                : "No unsaved chart changes"}
          </p>
        </div>
        {!editor.editing && editor.canManage && (
          <button
            type="button"
            className={portalButtonClass}
            onClick={() => editor.setEditing(true)}
          >
            Edit structure
          </button>
        )}
        {editor.editing && !editor.dirty && !editor.busy && (
          <button
            type="button"
            className={chartControlClass}
            onClick={() => editor.setEditing(false)}
          >
            Finish editing
          </button>
        )}
      </div>
      {editor.recoveryAvailable && (editor.editing || editor.dirty) && (
        <p className="text-sm text-gc-muted">
          A recovery copy stays in this tab for up to 24 hours. Save changes to
          keep them permanently.
        </p>
      )}
      {editor.editing && (
        <>
          <p className="text-sm text-gc-muted">
            Use the reporting handle to connect a role to its supervisor, or use
            the picker below. Move card changes only the picture. Changes stay
            here until you review and save them; assignments and privileges are
            managed separately.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={chartControlClass}
              disabled={!editor.canUndo}
              onClick={editor.undo}
            >
              Undo
            </button>
            <button
              type="button"
              className={chartControlClass}
              disabled={!editor.canRedo}
              onClick={editor.redo}
            >
              Redo
            </button>
            <button
              type="button"
              className={chartControlClass}
              disabled={!editor.canChange}
              onClick={editor.autoArrange}
            >
              Auto-arrange
            </button>
            <button
              ref={reviewButton}
              type="button"
              className={portalButtonClass}
              disabled={!editor.canChange || !editor.dirty}
              onClick={editor.prepareReview}
            >
              Review changes
            </button>
            <button
              type="button"
              className={chartControlClass}
              disabled={!editor.dirty || editor.busy || editor.uncertain}
              onClick={() => setDiscarding(true)}
            >
              Discard changes
            </button>
          </div>
          {!editor.canManage && (
            <p className="text-sm text-gc-error">
              You no longer have permission to edit this church structure.
            </p>
          )}
          <fieldset
            disabled={!editor.canChange}
            className="space-y-3 rounded-xl border border-gc-divider p-3"
          >
            <legend className="px-1 text-sm font-semibold">
              Change reporting without dragging
            </legend>
            <label className="block text-sm">
              Position to move
              <select
                ref={positionPicker}
                className={portalInputClass}
                value={selectedId}
                onChange={(event) => selectPosition(event.target.value)}
              >
                <option value="">Choose a position</option>
                {editor.positions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {p.id.slice(-6)}
                  </option>
                ))}
              </select>
            </label>
            {selected && (
              <>
                <p className="text-sm text-gc-muted">
                  {positionPlacementLabel(selected, editor.positions)}.{" "}
                  {selected.description || "No responsibilities added yet."}
                </p>
                <label className="block text-sm">
                  Reports to or placement
                  <select
                    className={portalInputClass}
                    value={destination}
                    onChange={(event) => setDestination(event.target.value)}
                  >
                    <option value="UNCONNECTED">Not connected yet</option>
                    <option value="ROOT">Top of chart</option>
                    {editor.positions
                      .filter((p) =>
                        canReportTo(selected.id, p.id, editor.positions)
                      )
                      .map((p) => (
                        <option key={p.id} value={`parent:${p.id}`}>
                          {p.name} · {p.id.slice(-6)}
                        </option>
                      ))}
                  </select>
                </label>
                <button
                  type="button"
                  className={chartControlClass}
                  onClick={() =>
                    editor.move(
                      selected.id,
                      destination.startsWith("parent:")
                        ? "REPORTING"
                        : (destination as "ROOT" | "UNCONNECTED"),
                      destination.startsWith("parent:")
                        ? destination.slice(7)
                        : null
                    )
                  }
                >
                  Stage reporting change
                </button>
              </>
            )}
          </fieldset>
          {selected && selectedGrid && (
            <fieldset
              disabled={!editor.canChange}
              className="space-y-3 rounded-xl border border-gc-divider p-3"
            >
              <legend className="px-1 text-sm font-semibold">
                Move the selected card without dragging
              </legend>
              <p className="text-sm text-gc-muted">
                Move {selected.name} one grid step. Reporting and assignments
                stay the same. Undo or review these changes before saving.
              </p>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ["left", -CHART_GRID, 0],
                    ["up", 0, -CHART_GRID],
                    ["down", 0, CHART_GRID],
                    ["right", CHART_GRID, 0]
                  ] as const
                ).map(([direction, x, y]) => (
                  <button
                    key={direction}
                    type="button"
                    className={chartControlClass}
                    onClick={() =>
                      editor.moveOnGrid(selected.id, {
                        x: snapChartCoordinate(selectedGrid.x + x),
                        y: snapChartCoordinate(selectedGrid.y + y)
                      })
                    }
                  >
                    Move card {direction}
                  </button>
                ))}
                <button
                  type="button"
                  className={chartControlClass}
                  disabled={!selected.layout}
                  onClick={() => editor.moveOnGrid(selected.id, null)}
                >
                  Use automatic card placement
                </button>
              </div>
            </fieldset>
          )}
        </>
      )}
      <button
        type="button"
        className={chartControlClass}
        disabled={editor.busy || editor.refreshing}
        onClick={() => void editor.refresh()}
      >
        {editor.refreshing
          ? "Checking church information…"
          : "Refresh church information"}
      </button>
      {editor.message && (
        <p role="status" className="rounded-xl bg-gc-subtle p-3 text-sm">
          {editor.message}
        </p>
      )}
      {editor.requiresReload && (
        <button
          type="button"
          className={portalButtonClass}
          disabled={editor.busy}
          onClick={() => void editor.reloadCurrent()}
        >
          Load current positions and keep choices
        </button>
      )}
      {editor.retained !== null && !editor.uncertain && (
        <section
          className="space-y-3 rounded-xl border border-gc-divider p-4"
          aria-label="Retained chart changes"
        >
          <h3 className="text-xl">Your retained choices</h3>
          <p className="text-sm text-gc-muted">
            The chart shows current positions. These choices have not been
            applied to that version yet. Remove any unwanted or unavailable
            change, then apply the remaining choices and review again.
          </p>
          {changes}
          <button
            type="button"
            className={portalButtonClass}
            disabled={!editor.canManage || editor.busy || editor.uncertain}
            onClick={() => editor.applyRetained()}
          >
            Apply retained choices for review
          </button>
        </section>
      )}
      {editor.review && !editor.requiresReload && (
        <section
          className="space-y-4 rounded-xl border border-gc-action p-4"
          aria-label="Review chart changes"
        >
          <h3
            ref={reviewHeading}
            tabIndex={-1}
            className="text-2xl outline-none"
          >
            Review chart changes
          </h3>
          {changes}
          <p className="text-sm text-gc-muted">
            These changes move positions or their cards. They do not assign
            people, change duties or grant permissions.
          </p>
          {editor.retryMatchesCurrent && (
            <p className="rounded-xl bg-gc-subtle p-3 text-sm">
              The latest chart matches this save. Retry to confirm its existing
              receipt.
            </p>
          )}
          <label className="flex min-h-11 items-start gap-3 text-sm">
            <input
              type="checkbox"
              className="mt-1 h-5 w-5 shrink-0 accent-gc-action"
              checked={confirmed}
              disabled={editor.busy}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            I reviewed these reporting and layout changes.
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={portalButtonClass}
              disabled={!confirmed || editor.busy || !editor.canManage}
              onClick={() => void editor.save()}
            >
              {editor.busy
                ? "Saving changes…"
                : editor.uncertain
                  ? "Retry reviewed save"
                  : "Save changes"}
            </button>
            <button
              type="button"
              className={chartControlClass}
              disabled={editor.busy || editor.uncertain}
              onClick={() => {
                editor.cancelReview();
                requestAnimationFrame(() => reviewButton.current?.focus());
              }}
            >
              Back to editing
            </button>
            {editor.uncertain && (
              <button
                type="button"
                className={chartControlClass}
                disabled={editor.busy}
                onClick={() => void editor.reloadCurrent()}
              >
                Check the saved chart and keep choices
              </button>
            )}
          </div>
        </section>
      )}
      {discarding && (
        <section
          className="space-y-3 rounded-xl border border-gc-divider p-4"
          aria-label="Confirm discard"
        >
          <h3
            ref={discardHeading}
            tabIndex={-1}
            className="text-xl outline-none"
          >
            Discard unsaved chart changes?
          </h3>
          <p className="text-sm text-gc-muted">
            Return to the last loaded saved chart. This does not undo a server
            save or change anyone&apos;s permissions.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={chartControlClass}
              onClick={() => {
                editorHeading.current?.focus();
                setDiscarding(false);
              }}
            >
              Keep editing
            </button>
            <button
              type="button"
              className={portalButtonClass}
              disabled={editor.busy || editor.uncertain}
              onClick={() => {
                editorHeading.current?.focus();
                editor.discard();
                setDiscarding(false);
              }}
            >
              Discard unsaved changes
            </button>
          </div>
        </section>
      )}
      {editor.leaveTarget && (
        <section
          className="space-y-3 rounded-xl border border-gc-action p-4"
          aria-label="Leave with unsaved chart changes"
        >
          <h3 ref={leaveHeading} tabIndex={-1} className="text-xl outline-none">
            Leave this chart?
          </h3>
          <p className="text-sm text-gc-muted">
            Keep your choices in this tab to recover when you return, or discard
            them.{" "}
            {editor.uncertain
              ? "The last save may already have completed; check the current chart when you return."
              : "Changes already saved on the server remain."}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={chartControlClass}
              onClick={() => {
                editorHeading.current?.focus();
                editor.cancelLeave();
              }}
            >
              Stay and keep editing
            </button>
            <button
              type="button"
              className={portalButtonClass}
              disabled={editor.busy || !editor.recoveryAvailable}
              onClick={editor.keepDraftAndLeave}
            >
              Keep draft and leave
            </button>
            <button
              type="button"
              className={chartControlClass}
              disabled={editor.busy}
              onClick={editor.confirmLeave}
            >
              Discard choices and leave
            </button>
          </div>
        </section>
      )}
    </section>
  );
}
