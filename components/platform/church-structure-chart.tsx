"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Minus,
  Plus
} from "lucide-react";
import type { PositionSummary } from "@/lib/platform/church-structure-types";
import { positionPlacementLabel } from "@/lib/platform/church-position-placement";
import {
  CHART_CARD_WIDTH,
  chartAncestors,
  churchChartLayout,
  searchChurchPositions
} from "@/lib/platform/church-chart-layout";
import { portalInputClass } from "./portal-action-form";
import { portalLinkClass } from "./portal-ui";
import { ChurchChartEditorControls } from "./church-chart-editor-controls";
import { useChurchChartEditor } from "./use-church-chart-editor";
import { useChurchChartDrag } from "./use-church-chart-drag";
import { churchReturnQuery } from "@/lib/platform/church-return-context";

const control =
  "inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-xl border border-gc-divider bg-gc-surface px-3 py-2 text-sm font-semibold text-gc-text hover:bg-gc-selected focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gc-focus disabled:opacity-50";
const MIN_ZOOM = 0.002;
const MAX_ZOOM = 1.6;
const clampZoom = (zoom: number) =>
  Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));

function RoleCard({
  position: p,
  base,
  canManage,
  selected,
  register,
  measure,
  childrenCount = 0,
  collapsed = false,
  toggle,
  placement,
  editControls,
  dropState
}: {
  position: PositionSummary;
  base: string;
  canManage: boolean;
  selected: boolean;
  register: (id: string, element: HTMLElement | null) => void;
  measure?: (id: string, height: number) => void;
  childrenCount?: number;
  collapsed?: boolean;
  toggle?: () => void;
  placement?: string;
  editControls?: ReactNode;
  dropState?: "valid" | "invalid";
}) {
  const ref = useRef<HTMLElement>(null);
  const returnQuery = churchReturnQuery({ from: "chart", focus: p.id });
  useEffect(() => {
    const element = ref.current;
    if (!element || !measure) return;
    const observer = new ResizeObserver(() =>
      measure(p.id, element.offsetHeight)
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [p.id, measure]);
  return (
    <article
      ref={(element) => {
        ref.current = element;
        register(p.id, element);
      }}
      data-chart-card={p.id}
      aria-label={`${p.name} · ${p.assignments.length ? "Assigned" : "Vacant"}`}
      className={`min-w-0 rounded-2xl border bg-gc-surface p-4 shadow-sm [overflow-wrap:anywhere] ${dropState === "invalid" ? "border-gc-error ring-2 ring-gc-error" : dropState === "valid" || selected ? "border-gc-action ring-2 ring-gc-focus" : "border-gc-divider"}`}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs font-semibold text-gc-muted">
        <span
          className={`rounded-full px-2 py-1 ${p.assignments.length ? "bg-gc-success-surface text-gc-success" : "bg-gc-subtle text-gc-muted"}`}
        >
          {p.assignments.length
            ? `${p.assignments.length} assigned`
            : "Vacant position"}
        </span>
        {placement && <span>{placement}</span>}
      </div>
      {editControls}
      <h3 className="text-2xl leading-tight">
        <Link
          href={`${base}/structure/${encodeURIComponent(p.id)}?${returnQuery}`}
          className="block rounded text-gc-text hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gc-focus"
        >
          {p.name}
        </Link>
      </h3>
      <p className="mb-2 mt-3 line-clamp-3 whitespace-pre-wrap text-sm text-gc-muted">
        {p.description || "Responsibilities have not been added yet."}
      </p>
      {!!p.assignments.length && (
        <ul
          className="space-y-2 border-t border-gc-divider pt-2"
          aria-label={`People assigned to ${p.name}`}
        >
          {p.assignments.map((a, index) => (
            <li key={a.id} className="text-sm">
              {a.name && a.connectionId ? (
                <Link
                  href={`${base}/people/${encodeURIComponent(a.connectionId)}?${returnQuery}`}
                  className={portalLinkClass}
                >
                  {a.name}
                  {a.isSelf ? " (you)" : ""}
                </Link>
              ) : (
                <p className="py-2 text-gc-muted">
                  Assigned · member is unlisted{a.isSelf ? " (you)" : ""}
                </p>
              )}
              {canManage && (
                <Link
                  href={`${base}/structure/assign?positionId=${encodeURIComponent(p.id)}&assignmentId=${encodeURIComponent(a.id)}&${returnQuery}`}
                  className={`${portalLinkClass} block`}
                  aria-label={`Review privileges for ${a.name || `assigned member ${index + 1}`} in ${p.name}`}
                >
                  Review privileges
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex flex-col items-start border-t border-gc-divider pt-2">
        <Link
          href={`${base}/structure/${encodeURIComponent(p.id)}?${returnQuery}`}
          className={portalLinkClass}
        >
          Position details
        </Link>
        {canManage && (
          <Link
            href={`${base}/structure/assign?positionId=${encodeURIComponent(p.id)}&${returnQuery}`}
            className={portalLinkClass}
          >
            {p.assignments.length ? "Add another person" : "Fill this position"}
          </Link>
        )}
        {childrenCount > 0 && toggle && (
          <button
            type="button"
            onClick={toggle}
            aria-expanded={!collapsed}
            className={`${control} mt-2 w-full`}
          >
            {collapsed ? "Expand" : "Collapse"} {childrenCount} reporting{" "}
            {childrenCount === 1 ? "branch" : "branches"}
          </button>
        )}
      </div>
    </article>
  );
}

export function ChurchStructureChart({
  churchId,
  connectionId,
  positions: initialPositions,
  canManage: initialCanManage,
  version,
  initialFocus
}: {
  churchId: string;
  connectionId: string;
  positions: PositionSummary[];
  canManage: boolean;
  version: number;
  initialFocus?: string;
}) {
  const editor = useChurchChartEditor(churchId, connectionId, {
    positions: initialPositions,
    canManage: initialCanManage,
    version
  });
  const { positions, canManage } = editor;
  const base = `/platform/churches/${encodeURIComponent(churchId)}`;
  const id = useId();
  const viewport = useRef<HTMLDivElement>(null);
  const cards = useRef(new Map<string, HTMLElement>());
  const automaticFit = useRef(true);
  const returnedFocus = useRef<string | undefined>(undefined);
  const pan = useRef<{
    pointer: number;
    x: number;
    y: number;
    left: number;
    top: number;
  } | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [heights, setHeights] = useState(new Map<string, number>());
  const [collapsed, setCollapsed] = useState(new Set<string>());
  const [zoom, setZoom] = useState(1);
  const [panMode, setPanMode] = useState(false);
  const [query, setQuery] = useState("");
  const [mine, setMine] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [pendingCenter, setPendingCenter] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const layout = useMemo(
    () => churchChartLayout(positions, collapsed, heights),
    [positions, collapsed, heights]
  );
  const drag = useChurchChartDrag({
    editor,
    viewport,
    nodes: layout.nodes,
    zoom,
    select: (key) => {
      automaticFit.current = false;
      setSelected(key);
    }
  });
  function editControls(position: PositionSummary, connected: boolean) {
    if (!editor.editing || !canManage) return undefined;
    return (
      <div className="mb-3 flex flex-col gap-2">
        <button
          type="button"
          className={`${control} cursor-grab touch-none select-none text-left`}
          disabled={!editor.canChange}
          aria-label={`Change reporting for ${position.name}`}
          {...drag.handlers(position.id, "reporting")}
        >
          Drag to change reporting
        </button>
        {connected && (
          <button
            type="button"
            className={`${control} cursor-move touch-none select-none text-left`}
            disabled={!editor.canChange}
            aria-label={`Move ${position.name} card on grid`}
            {...drag.handlers(position.id, "layout")}
          >
            Move card on grid
          </button>
        )}
      </div>
    );
  }
  const dropState = (key: string) =>
    drag.feedback?.target === key
      ? drag.feedback.valid
        ? ("valid" as const)
        : ("invalid" as const)
      : undefined;
  const results = useMemo(
    () =>
      mine
        ? positions.filter((p) => p.assignments.some((a) => a.isSelf))
        : searchChurchPositions(positions, query),
    [positions, query, mine]
  );
  const register = useCallback((key: string, element: HTMLElement | null) => {
    if (element) cards.current.set(key, element);
    else cards.current.delete(key);
  }, []);
  const measure = useCallback((key: string, height: number) => {
    setHeights((current) =>
      current.get(key) === height ? current : new Map(current).set(key, height)
    );
  }, []);
  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const observer = new ResizeObserver(() =>
      setSize((current) => {
        const next = {
          width: element.clientWidth,
          height: element.clientHeight
        };
        return next.width === current.width && next.height === current.height
          ? current
          : next;
      })
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const fittedZoom = clampZoom(
    Math.min(
      1,
      (size.width - 8) / layout.width,
      (size.height - 8) / layout.height
    )
  );
  useEffect(() => {
    if (automaticFit.current && size.width) setZoom(fittedZoom);
  }, [fittedZoom, size.width]);
  const leftOffset = Math.max(0, (size.width - layout.width * zoom) / 2);
  useEffect(() => {
    if (!pendingCenter) return;
    const element = cards.current.get(pendingCenter);
    if (!element) return;
    if (layout.connected.has(pendingCenter)) {
      if (layout.nodes.some((node) => !heights.has(node.position.id))) return;
      const node = layout.nodes.find((n) => n.position.id === pendingCenter);
      if (!node || !viewport.current) return;
      viewport.current.scrollTo({
        left:
          leftOffset + (node.x + CHART_CARD_WIDTH / 2) * zoom - size.width / 2,
        top: (node.y + node.height / 2) * zoom - size.height / 2,
        behavior: "instant"
      });
      viewport.current.scrollIntoView({
        block: "nearest",
        behavior: "instant"
      });
    } else element.scrollIntoView({ block: "center", behavior: "instant" });
    element
      .querySelector<HTMLAnchorElement>("h3 a")
      ?.focus({ preventScroll: true });
    setPendingCenter(null);
  }, [pendingCenter, layout, heights, leftOffset, zoom, size]);
  const center = useCallback(
    (position: PositionSummary) => {
      automaticFit.current = false;
      setCollapsed((current) => {
        const next = new Set(current);
        chartAncestors(positions, position.id).forEach((ancestor) =>
          next.delete(ancestor)
        );
        return next;
      });
      setSelected(position.id);
      if (layout.connected.has(position.id))
        setZoom(
          Math.min(1, Math.max(0.3, (size.width - 32) / CHART_CARD_WIDTH))
        );
      setPendingCenter(position.id);
      setAnnouncement(
        `Showing ${position.name}. ${positionPlacementLabel(position, positions)}.`
      );
    },
    [positions, layout.connected, size.width]
  );
  useEffect(() => {
    if (
      editor.recoveredDraft ||
      !initialFocus ||
      returnedFocus.current === initialFocus
    )
      return;
    const position = positions.find((p) => p.id === initialFocus);
    if (!position || !size.width) return;
    returnedFocus.current = initialFocus;
    center(position);
  }, [initialFocus, positions, size.width, center, editor.recoveredDraft]);
  function changeZoom(next: number) {
    automaticFit.current = false;
    const element = viewport.current;
    const value = clampZoom(next);
    const centerX =
      ((element?.scrollLeft ?? 0) + size.width / 2 - leftOffset) / zoom;
    const centerY = ((element?.scrollTop ?? 0) + size.height / 2) / zoom;
    setZoom(value);
    requestAnimationFrame(() =>
      element?.scrollTo({
        left:
          centerX * value +
          Math.max(0, (size.width - layout.width * value) / 2) -
          size.width / 2,
        top: centerY * value - size.height / 2,
        behavior: "instant"
      })
    );
  }
  function fit() {
    automaticFit.current = true;
    setZoom(fittedZoom);
    viewport.current?.scrollTo({ left: 0, top: 0, behavior: "instant" });
    setAnnouncement(
      "The connected chart is fitted to the view. Search for a role or person to read their card."
    );
  }
  const showResults = mine || query.trim().length > 0;
  return (
    <div className="min-w-0 space-y-6">
      {(canManage || editor.editing || editor.dirty || editor.unavailable) && (
        <ChurchChartEditorControls
          editor={editor}
          selectedId={selected ?? ""}
          selectPosition={setSelected}
        />
      )}
      {editor.canChange && (
        <div
          className="sticky top-2 z-20 grid grid-cols-2 gap-3 rounded-2xl bg-gc-surface p-3 shadow-sm"
          aria-label="Reporting drop targets"
        >
          {(["ROOT", "UNCONNECTED"] as const).map((placement) => (
            <div
              key={placement}
              data-chart-drop={placement}
              className={`min-h-16 rounded-xl border-2 border-dashed p-3 text-center text-sm font-semibold ${dropState(placement) === "valid" ? "border-gc-action bg-gc-selected" : "border-gc-divider bg-gc-subtle"}`}
            >
              {placement === "ROOT" ? "Top of chart" : "Not connected yet"}
              <span className="mt-1 block text-xs font-normal text-gc-muted">
                Drop a reporting handle here
              </span>
            </div>
          ))}
        </div>
      )}
      {drag.feedback && (
        <div
          aria-hidden="true"
          className={`pointer-events-none fixed z-50 max-w-[min(20rem,80vw)] rounded-xl border-2 bg-gc-surface p-3 text-sm font-semibold shadow-lg ${drag.feedback.valid ? "border-gc-action" : "border-gc-error"}`}
          style={{
            left: Math.max(
              8,
              Math.min(
                drag.feedback.x + 18,
                size.width
                  ? window.innerWidth -
                      Math.min(320, window.innerWidth * 0.8) -
                      8
                  : drag.feedback.x
              )
            ),
            top: Math.max(
              8,
              Math.min(drag.feedback.y + 18, window.innerHeight - 130)
            )
          }}
        >
          {drag.feedback.label}
        </div>
      )}
      <p className="sr-only" role="status">
        {drag.feedback?.label}
      </p>
      <section
        className="min-w-0 rounded-2xl border border-gc-divider bg-gc-surface"
        aria-labelledby={`${id}-heading`}
      >
        <div className="space-y-4 p-4 sm:p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id={`${id}-heading`} className="text-3xl">
              Church chart
            </h2>
            <p className="text-sm text-gc-muted">
              {layout.connected.size} connected · {layout.unconnected.length}{" "}
              not connected yet
            </p>
          </div>
          <div role="search" aria-label="Find a church position or person">
            <label htmlFor={`${id}-search`} className="text-sm font-semibold">
              Find a role or listed person
            </label>
            <input
              id={`${id}-search`}
              type="search"
              value={query}
              maxLength={100}
              className={portalInputClass}
              onChange={(event) => {
                setQuery(event.target.value);
                setMine(false);
              }}
              placeholder="Search roles and shared names"
            />
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                className={control}
                aria-pressed={mine}
                onClick={() => {
                  setMine(!mine);
                  setQuery("");
                }}
              >
                My positions
              </button>
              {showResults && (
                <button
                  type="button"
                  className={control}
                  onClick={() => {
                    setMine(false);
                    setQuery("");
                  }}
                >
                  Clear search
                </button>
              )}
            </div>
            {showResults && (
              <div className="mt-3 max-h-64 overflow-y-auto rounded-xl border border-gc-divider p-2">
                <p role="status" className="p-2 text-sm text-gc-muted">
                  {results.length}{" "}
                  {results.length === 1 ? "position" : "positions"} found
                  {!results.length
                    ? ". Try a role title or a shared name."
                    : ". Select one to bring it into view."}
                </p>
                <ul className="space-y-1">
                  {results.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => center(p)}
                        className={`${control} w-full flex-col items-start text-left`}
                      >
                        <span>{p.name}</span>
                        <span className="text-xs font-normal text-gc-muted">
                          {positionPlacementLabel(p, positions)}
                          {p.parentId
                            ? ` · Reports to ${positions.find((parent) => parent.id === p.parentId)?.name ?? "another position"}`
                            : ""}{" "}
                          ·{" "}
                          {p.assignments.length
                            ? `${p.assignments.length} assigned`
                            : "Vacant"}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          {!!layout.connected.size && (
            <>
              <div
                className="flex flex-wrap items-center gap-2"
                aria-label="Chart view controls"
              >
                <button type="button" className={control} onClick={fit}>
                  Fit to view
                </button>
                <button
                  type="button"
                  className={control}
                  onClick={() => changeZoom(1)}
                >
                  100%
                </button>
                <button
                  type="button"
                  className={control}
                  aria-label="Zoom out"
                  disabled={zoom <= MIN_ZOOM}
                  onClick={() => changeZoom(zoom / 1.25)}
                >
                  <Minus size={18} aria-hidden="true" />
                </button>
                <output
                  aria-label="Chart zoom"
                  className="min-w-12 text-center text-sm"
                >
                  {Math.round(zoom * 1000) / 10}%
                </output>
                <button
                  type="button"
                  className={control}
                  aria-label="Zoom in"
                  disabled={zoom >= MAX_ZOOM}
                  onClick={() => changeZoom(zoom * 1.25)}
                >
                  <Plus size={18} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className={control}
                  aria-pressed={panMode}
                  onClick={() => setPanMode(!panMode)}
                >
                  {panMode ? "Finish panning" : "Pan chart"}
                </button>
                <button
                  type="button"
                  className={control}
                  onClick={() => {
                    setCollapsed(new Set());
                    automaticFit.current = true;
                  }}
                >
                  Expand all
                </button>
              </div>
              <p id={`${id}-help`} className="text-sm text-gc-muted">
                Drag empty chart space with a mouse, or scroll inside the chart.
                On touch screens, Pan chart enables deliberate dragging; finish
                panning to use normal scrolling. Search brings a card into
                readable view. The full outline is also available above.
              </p>
              <div
                className="flex flex-wrap items-center gap-2"
                aria-label="Move the chart view"
              >
                {[
                  ["left", ArrowLeft, -180, 0],
                  ["up", ArrowUp, 0, -180],
                  ["down", ArrowDown, 0, 180],
                  ["right", ArrowRight, 180, 0]
                ].map(([label, Icon, x, y]) => {
                  const Arrow = Icon as typeof ArrowLeft;
                  return (
                    <button
                      type="button"
                      key={String(label)}
                      className={control}
                      aria-label={`Pan ${label}`}
                      onClick={() => {
                        automaticFit.current = false;
                        viewport.current?.scrollBy({
                          left: Number(x),
                          top: Number(y),
                          behavior: "instant"
                        });
                      }}
                    >
                      <Arrow size={18} aria-hidden="true" />
                    </button>
                  );
                })}
              </div>
            </>
          )}
          <p role="status" className="sr-only">
            {editor.unavailable ? "" : announcement}
          </p>
        </div>
        <div
          ref={viewport}
          role="region"
          aria-label="Connected church positions"
          aria-describedby={layout.connected.size ? `${id}-help` : undefined}
          tabIndex={layout.connected.size ? 0 : undefined}
          className={`relative max-w-full overflow-auto rounded-b-2xl bg-gc-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gc-focus ${layout.connected.size ? "h-[min(65vh,44rem)] min-h-80" : "h-40"} ${panMode ? "cursor-grab touch-none" : "touch-auto"}`}
          style={{
            backgroundImage:
              "radial-gradient(var(--gc-divider) 1px, transparent 1px)",
            backgroundSize: "20px 20px"
          }}
          onWheelCapture={() => {
            automaticFit.current = false;
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setPanMode(false);
              pan.current = null;
            }
          }}
          onPointerDown={(event) => {
            if (
              event.button !== 0 ||
              (event.pointerType !== "mouse" && !panMode) ||
              (event.target as Element).closest("[data-chart-card]")
            )
              return;
            automaticFit.current = false;
            pan.current = {
              pointer: event.pointerId,
              x: event.clientX,
              y: event.clientY,
              left: event.currentTarget.scrollLeft,
              top: event.currentTarget.scrollTop
            };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            const start = pan.current;
            if (!start || start.pointer !== event.pointerId) return;
            event.currentTarget.scrollLeft =
              start.left - (event.clientX - start.x);
            event.currentTarget.scrollTop =
              start.top - (event.clientY - start.y);
          }}
          onPointerUp={() => {
            pan.current = null;
          }}
          onPointerCancel={() => {
            pan.current = null;
          }}
          onLostPointerCapture={() => {
            pan.current = null;
          }}
        >
          {layout.connected.size ? (
            <div
              style={{
                position: "relative",
                overflow: "hidden",
                width: Math.max(size.width, layout.width * zoom),
                height: layout.height * zoom
              }}
            >
              <div
                style={{
                  position: "absolute",
                  left: leftOffset,
                  top: 0,
                  width: layout.width,
                  height: layout.height,
                  transformOrigin: "top left",
                  transform: `scale(${zoom})`
                }}
              >
                <svg
                  aria-hidden="true"
                  width={layout.width}
                  height={layout.height}
                  className="pointer-events-none absolute inset-0 text-gc-muted"
                >
                  {layout.edges.map(({ parent, child }) => {
                    const x1 = parent.x + CHART_CARD_WIDTH / 2,
                      y1 = parent.y + parent.height;
                    const x2 = child.x + CHART_CARD_WIDTH / 2,
                      y2 = child.y;
                    return (
                      <path
                        key={child.position.id}
                        d={`M ${x1} ${y1} C ${x1} ${(y1 + y2) / 2}, ${x2} ${(y1 + y2) / 2}, ${x2} ${y2}`}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2}
                      />
                    );
                  })}
                </svg>
                {layout.nodes.map((node) => (
                  <div
                    key={node.position.id}
                    style={{
                      position: "absolute",
                      left: node.x,
                      top: node.y,
                      width: CHART_CARD_WIDTH
                    }}
                  >
                    <RoleCard
                      position={node.position}
                      base={base}
                      canManage={canManage}
                      selected={selected === node.position.id}
                      register={register}
                      editControls={editControls(node.position, true)}
                      dropState={dropState(node.position.id)}
                      measure={measure}
                      childrenCount={node.children}
                      collapsed={collapsed.has(node.position.id)}
                      placement={
                        node.position.placement === "ROOT"
                          ? "Top of chart"
                          : undefined
                      }
                      toggle={() => {
                        automaticFit.current = false;
                        setCollapsed((current) => {
                          const next = new Set(current);
                          if (next.has(node.position.id))
                            next.delete(node.position.id);
                          else next.add(node.position.id);
                          return next;
                        });
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="p-6 text-gc-muted">
              No positions have been placed at the top of the chart yet.
              Unconnected roles appear below.
            </p>
          )}
        </div>
      </section>
      <section
        data-chart-drop={editor.canChange ? "UNCONNECTED" : undefined}
        className="min-w-0 rounded-2xl border border-dashed border-gc-divider bg-gc-subtle p-4 sm:p-5"
        aria-labelledby={`${id}-tray`}
      >
        <h2 id={`${id}-tray`} className="text-3xl">
          Not connected yet
        </h2>
        <p className="mb-4 mt-2 text-sm text-gc-muted">
          New positions and detached branches stay here until a manager
          explicitly places them. Their assignments, duties and reviewed
          permissions remain active.
        </p>
        {layout.unconnected.length ? (
          <div className="grid min-w-0 items-start gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {layout.unconnected.map((p) => (
              <div key={p.id} className="min-w-0 space-y-2">
                {p.parentId && (
                  <p className="text-sm text-gc-muted">
                    Reports to{" "}
                    {positions.find((parent) => parent.id === p.parentId)
                      ?.name ?? "another position"}
                  </p>
                )}
                <RoleCard
                  position={p}
                  base={base}
                  canManage={canManage}
                  selected={selected === p.id}
                  register={register}
                  editControls={editControls(p, false)}
                  dropState={dropState(p.id)}
                  placement={positionPlacementLabel(p, positions)}
                />
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gc-muted">
            Every position has been placed in the chart.
          </p>
        )}
      </section>
    </div>
  );
}
