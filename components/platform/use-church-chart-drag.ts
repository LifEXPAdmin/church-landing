"use client";

import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject
} from "react";
import {
  moveChartBranch,
  snapChartCoordinate,
  type ChartPlacement
} from "@/lib/platform/church-chart-model";
import type { ChartNode } from "@/lib/platform/church-chart-layout";
import type { ChartEditor } from "./church-chart-editor-controls";

type Mode = "reporting" | "layout";
type Destination = {
  placement: ChartPlacement["placement"];
  parentId: string | null;
  label: string;
  valid: boolean;
  target: string;
};
type Drag = {
  pointer: number;
  id: string;
  mode: Mode;
  startX: number;
  startY: number;
  x: number;
  y: number;
  moved: boolean;
  handle: HTMLButtonElement;
  logicalX: number;
  logicalY: number;
  scrollLeft: number;
  scrollTop: number;
};
type Feedback = {
  id: string;
  x: number;
  y: number;
  label: string;
  valid: boolean;
  target?: string;
};

// Pointer gestures stage the exact same geometry-only commands as the picker.
// Pointer capture belongs to the explicit handle, never to a name/contact link.
export function useChurchChartDrag({
  editor,
  viewport,
  nodes,
  zoom,
  select,
  chooseWithoutDragging
}: {
  editor: ChartEditor;
  viewport: RefObject<HTMLDivElement | null>;
  nodes: ChartNode[];
  zoom: number;
  select: (id: string) => void;
  chooseWithoutDragging: (id: string) => void;
}) {
  const active = useRef<Drag | null>(null);
  const frame = useRef<number | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const current = useRef({ editor, nodes, zoom });
  current.current = { editor, nodes, zoom };

  function destinationAt(x: number, y: number): Destination | null {
    const drag = active.current;
    if (!drag) return null;
    const target = document
      .elementFromPoint(x, y)
      ?.closest<HTMLElement>("[data-chart-card], [data-chart-drop]");
    if (!target) return null;
    const card = target.dataset.chartCard;
    const zone = target.dataset.chartDrop;
    const position = current.current.editor.positions.find(
      (p) => p.id === card
    );
    const placement = card
      ? "REPORTING"
      : zone === "ROOT"
        ? "ROOT"
        : zone === "UNCONNECTED"
          ? "UNCONNECTED"
          : null;
    if (!placement || (card && !position)) return null;
    const destination: Destination = {
      placement,
      parentId: card ?? null,
      target: card ?? zone!,
      valid: true,
      label: card
        ? `Reports to ${position!.name}`
        : placement === "ROOT"
          ? "Place at the top of the chart"
          : "Detach to Not connected yet"
    };
    try {
      moveChartBranch(
        current.current.editor.positions,
        drag.id,
        placement,
        destination.parentId
      );
    } catch (error) {
      destination.valid = false;
      destination.label =
        error instanceof Error
          ? error.message
          : "This reporting change is unavailable.";
    }
    return destination;
  }
  function insideChart(x: number, y: number) {
    const rect = viewport.current?.getBoundingClientRect();
    return (
      !!rect &&
      x >= rect.left &&
      x <= rect.right &&
      y >= rect.top &&
      y <= rect.bottom
    );
  }
  function gridLocation(drag: Drag) {
    return {
      x: snapChartCoordinate(
        drag.logicalX +
          (drag.x -
            drag.startX +
            (viewport.current?.scrollLeft ?? 0) -
            drag.scrollLeft) /
            current.current.zoom
      ),
      y: snapChartCoordinate(
        drag.logicalY +
          (drag.y -
            drag.startY +
            (viewport.current?.scrollTop ?? 0) -
            drag.scrollTop) /
            current.current.zoom
      )
    };
  }
  function showFeedback() {
    const drag = active.current;
    if (!drag?.moved) return;
    const destination =
      drag.mode === "reporting" ? destinationAt(drag.x, drag.y) : null;
    const grid = gridLocation(drag);
    const next: Feedback = {
      id: drag.id,
      x: drag.x,
      y: drag.y,
      target: destination?.target,
      valid:
        drag.mode === "layout"
          ? insideChart(drag.x, drag.y)
          : !!destination?.valid,
      label:
        drag.mode === "layout"
          ? insideChart(drag.x, drag.y)
            ? `Move card to grid ${grid.x}, ${grid.y}. Reporting stays the same.`
            : "Drop inside the connected chart, or press Escape to cancel."
          : (destination?.label ??
            "Drop on a reporting position, Top of chart or Not connected yet.")
    };
    setFeedback((previous) =>
      previous &&
      previous.x === next.x &&
      previous.y === next.y &&
      previous.label === next.label &&
      previous.target === next.target &&
      previous.valid === next.valid
        ? previous
        : next
    );
  }
  function cancel(message?: string) {
    const drag = active.current;
    active.current = null;
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    if (drag?.handle.hasPointerCapture(drag.pointer))
      drag.handle.releasePointerCapture(drag.pointer);
    setFeedback(null);
    if (message) current.current.editor.setMessage(message);
  }
  function scrollAtEdge() {
    const drag = active.current;
    if (!drag) return;
    if (drag.moved) {
      const element = viewport.current;
      const rect = element?.getBoundingClientRect();
      if (element && rect && insideChart(drag.x, drag.y)) {
        const delta = (value: number, low: number, high: number) =>
          value < low + 36 ? -12 : value > high - 36 ? 12 : 0;
        element.scrollBy(
          delta(drag.x, rect.left, rect.right),
          delta(drag.y, rect.top, rect.bottom)
        );
      }
      if (drag.mode === "reporting") {
        if (drag.y < 48) window.scrollBy(0, -12);
        else if (drag.y > window.innerHeight - 48) window.scrollBy(0, 12);
      }
      showFeedback();
    }
    frame.current = requestAnimationFrame(scrollAtEdge);
  }
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && active.current) {
        event.preventDefault();
        cancel("Drag canceled. No chart change was made.");
      }
    };
    const blur = () => cancel();
    window.addEventListener("keydown", escape);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", escape);
      window.removeEventListener("blur", blur);
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      active.current = null;
    };
    // The active gesture reads current editor data through the ref.
  }, []);
  function handlers(id: string, mode: Mode) {
    return {
      onClick: (event: ReactMouseEvent<HTMLButtonElement>) => {
        if (event.detail !== 0) return;
        chooseWithoutDragging(id);
        if (!active.current)
          current.current.editor.setMessage(
            "Position selected. Use the reporting picker or card movement buttons to stage a change."
          );
      },
      onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => {
        if (
          !current.current.editor.canChange ||
          event.button !== 0 ||
          active.current
        )
          return;
        const node = current.current.nodes.find((n) => n.position.id === id);
        if (mode === "layout" && !node) return;
        event.preventDefault();
        event.stopPropagation();
        active.current = {
          pointer: event.pointerId,
          id,
          mode,
          startX: event.clientX,
          startY: event.clientY,
          x: event.clientX,
          y: event.clientY,
          moved: false,
          handle: event.currentTarget,
          logicalX: node?.logicalX ?? 0,
          logicalY: node?.logicalY ?? 0,
          scrollLeft: viewport.current?.scrollLeft ?? 0,
          scrollTop: viewport.current?.scrollTop ?? 0
        };
        event.currentTarget.setPointerCapture(event.pointerId);
        frame.current = requestAnimationFrame(scrollAtEdge);
      },
      onPointerMove: (event: ReactPointerEvent<HTMLButtonElement>) => {
        const drag = active.current;
        if (!drag || drag.pointer !== event.pointerId) return;
        drag.x = event.clientX;
        drag.y = event.clientY;
        drag.moved ||=
          Math.hypot(drag.x - drag.startX, drag.y - drag.startY) >= 8;
        showFeedback();
      },
      onPointerUp: (event: ReactPointerEvent<HTMLButtonElement>) => {
        const drag = active.current;
        if (!drag || drag.pointer !== event.pointerId) return;
        drag.x = event.clientX;
        drag.y = event.clientY;
        const destination =
          drag.mode === "reporting" ? destinationAt(drag.x, drag.y) : null;
        const grid = gridLocation(drag);
        const validGrid = insideChart(drag.x, drag.y);
        cancel();
        // Revealing the selected position's picker changes the height above the
        // canvas. Wait until release so targets cannot move during the gesture.
        select(id);
        if (!drag.moved || !current.current.editor.canChange) return;
        if (drag.mode === "layout" && validGrid)
          current.current.editor.moveOnGrid(id, grid);
        else if (destination?.valid)
          current.current.editor.move(
            id,
            destination.placement,
            destination.parentId
          );
        else
          current.current.editor.setMessage(
            destination?.label ??
              "No valid drop target. The chart is unchanged."
          );
      },
      onPointerCancel: () => cancel("Drag canceled. No chart change was made."),
      onLostPointerCapture: () => {
        if (active.current) cancel("Drag canceled. No chart change was made.");
      }
    };
  }
  return { handlers, feedback };
}
