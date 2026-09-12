"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  type ReactNode,
  type RefObject
} from "react";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import {
  feedGestureAxis,
  feedGestureResult,
  type FeedGestureAxis
} from "@/lib/platform/feed-gesture";

const controls =
  "a,button,input,textarea,select,summary,video,audio,[contenteditable],[role=slider],dialog,[data-comment-thread]";
type Gesture = {
  x: number;
  y: number;
  time: number;
  top: boolean;
  bottom: boolean;
  axis: FeedGestureAxis | null;
};

export function FocusedFeed({
  children,
  active,
  index,
  count,
  label,
  postId,
  direction,
  onTurn,
  onClose,
  returnFocus,
  initialScroll,
  moreHref
}: {
  children: ReactNode;
  active: boolean;
  index: number;
  count: number;
  label?: string;
  postId?: string;
  direction: string;
  onTurn: (delta: number) => void;
  onClose: () => void;
  returnFocus: RefObject<HTMLButtonElement | null>;
  initialScroll: number;
  moreHref?: string;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  // Native listeners keep the current callbacks without reinstalling while a
  // post changes. They never retain post content or account data.
  const actions = useRef({ onTurn, onClose });
  useEffect(() => {
    actions.current = { onTurn, onClose };
  });

  useLayoutEffect(() => {
    if (!active) return;
    const modal = dialog.current!;
    const content = scroller.current!;
    const frame = panel.current!;
    const opener = returnFocus.current;
    const y = initialScroll;
    const bodyStyle = document.body.style;
    const htmlStyle = document.documentElement.style;
    const previous = {
      position: bodyStyle.position,
      top: bodyStyle.top,
      width: bodyStyle.width,
      overflow: bodyStyle.overflow,
      htmlOverflow: htmlStyle.overflow
    };
    bodyStyle.position = "fixed";
    bodyStyle.top = `-${y}px`;
    bodyStyle.width = "100%";
    bodyStyle.overflow = "hidden";
    htmlStyle.overflow = "hidden";
    // Preserve the same mounted post forms when moving between Home and My feed.
    // Inert only siblings along our ancestor path, never an ancestor of the modal.
    const inertBefore: Array<[HTMLElement, boolean]> = [];
    for (
      let branch: HTMLElement = modal;
      branch.parentElement && branch !== document.body;
    ) {
      const parent = branch.parentElement;
      for (const sibling of Array.from(parent.children)) {
        if (sibling !== branch && sibling instanceof HTMLElement) {
          inertBefore.push([sibling, sibling.inert]);
          sibling.inert = true;
        }
      }
      branch = parent;
    }
    closeButton.current?.focus({ preventScroll: true });
    let gesture: Gesture | null = null;
    let mouseId: number | null = null;
    let wheelDistance = 0;
    let lastWheel = 0;
    let wheelTurned = false;

    function reset() {
      gesture = null;
      frame.style.removeProperty("transform");
      frame.removeAttribute("data-dragging");
    }
    function start(x: number, y: number, target: EventTarget | null) {
      reset();
      if (
        !(target instanceof Element) ||
        target.closest(controls) ||
        window.getSelection()?.toString() ||
        x < 24 ||
        x > innerWidth - 24
      )
        return;
      const grip = !!target.closest("[data-feed-grip]");
      gesture = {
        x,
        y,
        time: Date.now(),
        axis: null,
        top: grip || content.scrollTop <= 2,
        bottom:
          grip ||
          content.scrollTop + content.clientHeight >= content.scrollHeight - 2
      };
    }
    function move(x: number, y: number, event: Event) {
      if (!gesture) return;
      if (window.getSelection()?.toString()) {
        reset();
        return;
      }
      const dx = x - gesture.x,
        dy = y - gesture.y;
      gesture.axis ??= feedGestureAxis(dx, dy, gesture.top, gesture.bottom);
      if (gesture.axis === "horizontal" || gesture.axis === "dismiss") {
        if (event.cancelable) event.preventDefault();
        frame.dataset.dragging = "true";
        // Keep the post near its resting position while swiping sideways.
        frame.style.transform =
          gesture.axis === "dismiss"
            ? `translateY(${dy * 0.65}px) scale(${1 - Math.min(Math.abs(dy) / 6000, 0.04)})`
            : `translateX(${Math.max(-70, Math.min(70, dx * 0.3))}px)`;
      }
    }
    function end(x: number, y: number) {
      const start = gesture;
      reset();
      if (!start || window.getSelection()?.toString()) return;
      const result = feedGestureResult(
        start.axis,
        x - start.x,
        y - start.y,
        Date.now() - start.time
      );
      if (result === "close") actions.current.onClose();
      else if (result) actions.current.onTurn(result === "next" ? 1 : -1);
    }
    function touchStart(e: TouchEvent) {
      if (e.touches.length !== 1) {
        reset();
        return;
      }
      start(e.touches[0].clientX, e.touches[0].clientY, e.target);
    }
    function touchMove(e: TouchEvent) {
      if (e.touches.length !== 1) {
        reset();
        return;
      }
      move(e.touches[0].clientX, e.touches[0].clientY, e);
    }
    function touchEnd(e: TouchEvent) {
      if (e.touches.length || !e.changedTouches[0]) {
        reset();
        return;
      }
      end(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
    }
    // Mouse dragging is limited to the handle; post text remains selectable.
    function pointerDown(e: PointerEvent) {
      if (
        e.pointerType !== "mouse" ||
        e.button !== 0 ||
        !(e.target instanceof Element) ||
        !e.target.closest("[data-feed-grip]")
      )
        return;
      start(e.clientX, e.clientY, e.target);
      if (gesture) {
        mouseId = e.pointerId;
        frame.setPointerCapture(e.pointerId);
        e.preventDefault();
      }
    }
    function pointerMove(e: PointerEvent) {
      if (e.pointerId === mouseId) move(e.clientX, e.clientY, e);
    }
    function pointerUp(e: PointerEvent) {
      if (e.pointerId !== mouseId) return;
      mouseId = null;
      if (frame.hasPointerCapture(e.pointerId))
        frame.releasePointerCapture(e.pointerId);
      end(e.clientX, e.clientY);
    }
    function pointerCancel(e: PointerEvent) {
      // Browsers cancel touch pointer streams when native panning starts; the
      // separate touch listeners still own that gesture and its edge handling.
      if (e.pointerId !== mouseId) return;
      mouseId = null;
      reset();
    }
    function wheel(e: WheelEvent) {
      if (
        e.ctrlKey ||
        !(e.target instanceof Element) ||
        e.target.closest(controls) ||
        window.getSelection()?.toString() ||
        Math.abs(e.deltaX) <= Math.abs(e.deltaY) * 1.3
      )
        return;
      e.preventDefault();
      const now = Date.now();
      // One turn per trackpad gesture, including its inertial tail.
      if (now - lastWheel > 180) {
        wheelDistance = 0;
        wheelTurned = false;
      }
      lastWheel = now;
      wheelDistance +=
        e.deltaX *
        (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? content.clientWidth : 1);
      if (!wheelTurned && Math.abs(wheelDistance) >= 48) {
        wheelTurned = true;
        actions.current.onTurn(wheelDistance > 0 ? 1 : -1);
      }
    }
    function keyDown(e: KeyboardEvent) {
      // A nested native dialog owns its own keyboard interaction.
      if (e.defaultPrevented || document.querySelector("dialog[open]")) return;
      if (e.key === "Escape") {
        e.preventDefault();
        actions.current.onClose();
        return;
      }
      if (e.key === "Tab") {
        const targets = Array.from(
          modal.querySelectorAll<HTMLElement>(
            "a[href],button,input,textarea,select,summary,[tabindex]"
          )
        ).filter(
          (element) =>
            element.tabIndex >= 0 &&
            !element.matches(":disabled") &&
            !element.closest("[hidden],[inert]") &&
            element.getClientRects().length > 0 &&
            getComputedStyle(element).visibility !== "hidden"
        );
        const first = targets[0],
          last = targets.at(-1);
        if (!first) {
          e.preventDefault();
          modal.focus();
        } else if (
          e.shiftKey &&
          (document.activeElement === first ||
            !targets.includes(document.activeElement as HTMLElement))
        ) {
          e.preventDefault();
          last?.focus();
        } else if (
          !e.shiftKey &&
          (document.activeElement === last ||
            !targets.includes(document.activeElement as HTMLElement))
        ) {
          e.preventDefault();
          first.focus();
        }
        return;
      }
      if (
        e.defaultPrevented ||
        e.altKey ||
        e.ctrlKey ||
        e.metaKey ||
        e.shiftKey ||
        !(e.target instanceof Element) ||
        e.target.closest(
          "input,textarea,select,summary,video,audio,[contenteditable],[role=slider]"
        ) ||
        window.getSelection()?.toString()
      )
        return;
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        actions.current.onTurn(e.key === "ArrowRight" ? 1 : -1);
      }
    }
    frame.addEventListener("touchstart", touchStart, { passive: true });
    frame.addEventListener("touchmove", touchMove, { passive: false });
    frame.addEventListener("touchend", touchEnd);
    frame.addEventListener("touchcancel", reset);
    frame.addEventListener("pointerdown", pointerDown);
    frame.addEventListener("pointermove", pointerMove);
    frame.addEventListener("pointerup", pointerUp);
    frame.addEventListener("pointercancel", pointerCancel);
    frame.addEventListener("wheel", wheel, { passive: false });
    modal.addEventListener("keydown", keyDown);
    return () => {
      frame.removeEventListener("touchstart", touchStart);
      frame.removeEventListener("touchmove", touchMove);
      frame.removeEventListener("touchend", touchEnd);
      frame.removeEventListener("touchcancel", reset);
      frame.removeEventListener("pointerdown", pointerDown);
      frame.removeEventListener("pointermove", pointerMove);
      frame.removeEventListener("pointerup", pointerUp);
      frame.removeEventListener("pointercancel", pointerCancel);
      frame.removeEventListener("wheel", wheel);
      modal.removeEventListener("keydown", keyDown);
      for (const [element, inert] of inertBefore) element.inert = inert;
      Object.assign(bodyStyle, {
        position: previous.position,
        top: previous.top,
        width: previous.width,
        overflow: previous.overflow
      });
      htmlStyle.overflow = previous.htmlOverflow;
      // Wait for Home layout to settle before restoring its scroll position.
      requestAnimationFrame(() => {
        if (
          location.pathname === "/platform" ||
          location.pathname === "/platform/feed"
        ) {
          window.scrollTo({ top: y, behavior: "instant" });
          opener?.focus({ preventScroll: true });
        }
      });
    };
  }, [active, returnFocus, initialScroll]);

  useEffect(() => {
    if (!active) return;
    scroller.current?.scrollTo({ top: 0, behavior: "instant" });
    if (
      dialog.current &&
      (!dialog.current.contains(document.activeElement) ||
        (document.activeElement instanceof Element &&
          !!document.activeElement.closest("[hidden],[inert]")))
    )
      scroller.current?.focus({ preventScroll: true });
  }, [active, postId]);

  return (
    <div
      ref={dialog}
      className={active ? "gc-focused-feed" : "gc-inline-feed"}
      role={active ? "dialog" : undefined}
      aria-modal={active || undefined}
      aria-labelledby={active ? "focused-feed-title" : undefined}
      aria-describedby={active ? "focused-feed-help" : undefined}
      tabIndex={active ? -1 : undefined}
    >
      <div
        ref={panel}
        className={active ? "gc-focused-panel" : undefined}
        data-direction={direction}
      >
        <header className="gc-focused-header" hidden={!active}>
          <div data-feed-grip className="gc-feed-grip">
            <span aria-hidden="true" className="gc-feed-grip-mark" />
            <h2 id="focused-feed-title">My feed</h2>
          </div>
          <button
            ref={closeButton}
            type="button"
            onClick={onClose}
            className="gc-button gc-button-quiet"
            aria-label="Close My feed"
          >
            <X aria-hidden="true" /> Close
          </button>
        </header>
        <p id="focused-feed-help" className="gc-focused-help" hidden={!active}>
          Swipe left or right for posts. Pull down from the top to close.
        </p>
        <div
          ref={scroller}
          className={active ? "gc-focused-scroll" : undefined}
          tabIndex={active ? 0 : undefined}
          role={active ? "region" : undefined}
          aria-label={
            active
              ? "Current post. Use left and right arrow keys to change posts."
              : undefined
          }
        >
          <div className={active ? "gc-focused-post" : undefined}>
            {children}
          </div>
          {active && count > 0 && index === count - 1 && (
            <div className="gc-feed-end">
              <p>You&apos;ve reached the end of this set.</p>
              {moreHref ? (
                <a href={moreHref} className="gc-button gc-button-quiet">
                  Read older posts <ArrowRight aria-hidden="true" />
                </a>
              ) : (
                <p>You&apos;re caught up. Take a moment, or return Home.</p>
              )}
            </div>
          )}
        </div>
        <footer className="gc-focused-footer" hidden={!active}>
          <button
            type="button"
            className="gc-button gc-button-quiet"
            aria-disabled={index === 0 || !count}
            onClick={() => onTurn(-1)}
          >
            <ArrowLeft aria-hidden="true" />
            Previous
          </button>
          <p aria-live="polite" aria-atomic="true">
            <span className="sr-only">{label ? `Post by ${label}. ` : ""}</span>
            {count ? `${index + 1} / ${count}` : "No posts yet"}
          </p>
          <button
            type="button"
            className="gc-button gc-button-quiet"
            aria-disabled={index >= count - 1}
            onClick={() => onTurn(1)}
          >
            Next
            <ArrowRight aria-hidden="true" />
          </button>
        </footer>
      </div>
    </div>
  );
}
