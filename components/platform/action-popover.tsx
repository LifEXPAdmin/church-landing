"use client";

import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode
} from "react";
import { Ellipsis } from "lucide-react";
import { createPortal } from "react-dom";

/** A small nonmodal action surface. The owning control keeps its retry state. */
export function ActionPopover({
  label,
  trigger,
  open,
  onOpenChange,
  children,
  className = "gc-post-action"
}: {
  label: string;
  trigger: ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
  className?: string;
}) {
  const id = useId(),
    button = useRef<HTMLButtonElement>(null),
    panel = useRef<HTMLDivElement>(null);
  const change = useRef(onOpenChange);
  const [target, setTarget] = useState<Element | null>(null);
  const [position, setPosition] = useState({
    left: 8,
    top: 8,
    width: 272,
    maxHeight: 400
  });
  useLayoutEffect(() => {
    change.current = onOpenChange;
  });
  useLayoutEffect(() => {
    if (!open) return;
    setTarget(
      button.current?.closest("dialog") ??
        button.current?.closest(".platform-design") ??
        document.body
    );
  }, [open]);
  useLayoutEffect(() => {
    if (!open || !target || !panel.current) return;
    const opener = button.current!,
      surface = panel.current;
    const place = () => {
      const rect = opener.getBoundingClientRect(),
        viewport = window.visualViewport;
      const leftEdge = viewport?.offsetLeft ?? 0,
        topEdge = viewport?.offsetTop ?? 0;
      const width = viewport?.width ?? innerWidth,
        height = viewport?.height ?? innerHeight;
      const panelWidth = Math.min(272, width - 16),
        below = topEdge + height - rect.bottom - 8,
        above = rect.top - topEdge - 8;
      const goesAbove =
        below < Math.min(surface.scrollHeight, 240) && above > below;
      const maxHeight = Math.max(
        64,
        Math.min(height - 16, (goesAbove ? above : below) - 8)
      );
      const surfaceHeight = Math.min(surface.scrollHeight + 2, maxHeight);
      const preferredTop = goesAbove
        ? rect.top - surfaceHeight - 8
        : rect.bottom + 8;
      setPosition({
        left: Math.max(
          leftEdge + 8,
          Math.min(rect.right - panelWidth, leftEdge + width - panelWidth - 8)
        ),
        top: Math.max(
          topEdge + 8,
          Math.min(preferredTop, topEdge + height - surfaceHeight - 8)
        ),
        width: panelWidth,
        maxHeight
      });
    };
    place();
    surface.focus({ preventScroll: true });
    const outside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !surface.contains(event.target) &&
        !opener.contains(event.target)
      )
        change.current(false);
    };
    const keyboard = (event: KeyboardEvent) => {
      if (
        event.target instanceof Element &&
        event.target.closest("dialog") !== surface.closest("dialog")
      )
        return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        change.current(false);
      }
    };
    const focus = (event: FocusEvent) => {
      if (
        event.target instanceof Node &&
        !surface.contains(event.target) &&
        !opener.contains(event.target)
      )
        change.current(false);
    };
    const resize = new ResizeObserver(place);
    resize.observe(surface);
    resize.observe(document.body);
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", keyboard);
    document.addEventListener("focusin", focus);
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    window.visualViewport?.addEventListener("resize", place);
    return () => {
      resize.disconnect();
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("keydown", keyboard);
      document.removeEventListener("focusin", focus);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
      window.visualViewport?.removeEventListener("resize", place);
      if (
        document.activeElement === document.body ||
        surface.contains(document.activeElement)
      )
        opener.focus({ preventScroll: true });
    };
  }, [open, target]);
  return (
    <>
      <button
        ref={button}
        type="button"
        className={className}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => onOpenChange(!open)}
      >
        {trigger}
      </button>
      {open &&
        target &&
        createPortal(
          <div
            ref={panel}
            id={id}
            role="dialog"
            aria-label={label}
            tabIndex={-1}
            className="gc-action-popover"
            style={position}
            onClick={(event) => {
              if (
                event.target instanceof Element &&
                event.target.closest("a[href]")
              )
                onOpenChange(false);
            }}
          >
            {children}
          </div>,
          target
        )}
    </>
  );
}

export function MoreActions({
  label,
  children
}: {
  label: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <ActionPopover
      label={label}
      trigger={<Ellipsis aria-hidden="true" />}
      className="gc-icon-button"
      open={open}
      onOpenChange={setOpen}
    >
      <div
        onClick={(event) => {
          if (
            event.target instanceof Element &&
            event.target.closest("button, a[href]")
          )
            setOpen(false);
        }}
      >
        {children}
      </div>
    </ActionPopover>
  );
}
