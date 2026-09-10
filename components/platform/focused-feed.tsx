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
  "a,button,input,textarea,select,summary,video,audio,[contenteditable],[role=slider]";
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
  const dialog = useRef<HTMLDialogElement>(null);
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
    modal.showModal();
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
      modal.close();
      Object.assign(bodyStyle, {
        position: previous.position,
        top: previous.top,
        width: previous.width,
        overflow: previous.overflow
      });
      htmlStyle.overflow = previous.htmlOverflow;
      // Wait for Home's post list to remount before restoring its scroll range.
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
  }, [returnFocus, initialScroll]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: 0, behavior: "instant" });
    if (
      dialog.current?.open &&
      !dialog.current.contains(document.activeElement)
    )
      scroller.current?.focus({ preventScroll: true });
  }, [postId]);

  return (
    <dialog
      ref={dialog}
      className="gc-focused-feed"
      aria-labelledby="focused-feed-title"
      aria-describedby="focused-feed-help"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div ref={panel} className="gc-focused-panel" data-direction={direction}>
        <header className="gc-focused-header">
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
        <p id="focused-feed-help" className="gc-focused-help">
          Swipe left or right for posts. Pull down from the top to close.
        </p>
        <div
          ref={scroller}
          className="gc-focused-scroll"
          tabIndex={0}
          role="region"
          aria-label="Current post. Use left and right arrow keys to change posts."
        >
          <div className="gc-focused-post" key={postId} data-post={postId}>
            {children}
          </div>
          {count > 0 && index === count - 1 && (
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
        <footer className="gc-focused-footer">
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
    </dialog>
  );
}
