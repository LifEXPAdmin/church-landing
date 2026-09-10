"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { FocusedFeed } from "./focused-feed";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  List,
  RotateCw,
  Maximize2
} from "lucide-react";
import { useReadingPreferences } from "./reading-preferences";

type Item = { id: string; label: string; content: ReactNode };
export function FeedReader({
  items,
  initialPost,
  initialMode,
  moreHref,
  emptyContent
}: {
  items: Item[];
  initialPost?: string;
  initialMode?: "pages" | "list";
  moreHref?: string;
  emptyContent?: ReactNode;
}) {
  const pathname = usePathname();
  const focused = pathname === "/platform/feed";
  const openButton = useRef<HTMLButtonElement>(null);
  const homeHeight = useRef<number>(0);
  const homeScroll = useRef<number>(0);
  const { preferences, update } = useReadingPreferences();
  const [mode, setMode] = useState(initialMode ?? preferences.mode);
  const [selected, setSelected] = useState(
    items.find((p) => p.id === initialPost)?.id ?? items[0]?.id
  );
  const [announcement, announce] = useState("");
  const [direction, setDirection] = useState("next");
  const root = useRef<HTMLDivElement>(null);
  const touch = useRef<{ x: number; y: number; time: number } | null>(null);
  const index = Math.max(
    0,
    items.findIndex((p) => p.id === selected)
  );
  const current = items[index];
  const unavailable =
    !!initialPost && !items.some((item) => item.id === initialPost);

  useEffect(() => {
    document.title = `${focused ? "My feed" : "Home"} | Godschurches`;
  }, [focused]);

  function openFocused() {
    homeScroll.current = window.scrollY;
    homeHeight.current = root.current?.getBoundingClientRect().height ?? 0;
    const url = new URL(window.location.href);
    url.pathname = "/platform/feed";
    if (current) url.searchParams.set("post", current.id);
    window.history.pushState(null, "", url);
  }
  function closeFocused() {
    const url = new URL(window.location.href);
    url.pathname = "/platform";
    window.history.replaceState(null, "", url);
  }
  function remember(id: string, nextMode = mode) {
    const url = new URL(window.location.href);
    url.searchParams.set("post", id);
    url.searchParams.set("mode", nextMode);
    // Let Next synchronize its router state; passing its private history marker bypasses that.
    window.history.replaceState(null, "", url);
  }
  function turn(delta: number, fromBottom = false) {
    const next = items[index + delta];
    if (!next) return;
    setDirection(delta > 0 ? "next" : "previous");
    setSelected(next.id);
    remember(next.id);
    announce(`Post ${index + delta + 1} of ${items.length}, by ${next.label}`);
    if (fromBottom && !focused)
      requestAnimationFrame(() => {
        const control = root.current?.querySelector<HTMLButtonElement>(
          `[data-top-${delta > 0 ? "next" : "previous"}]`
        );
        control?.focus({ preventScroll: true });
        root.current?.scrollIntoView({ block: "start", behavior: "instant" });
      });
  }
  function changeMode(nextMode: "pages" | "list") {
    setMode(nextMode);
    update({ mode: nextMode });
    if (current) remember(current.id, nextMode);
    announce(`${nextMode === "pages" ? "Pages" : "List"} view`);
    requestAnimationFrame(() =>
      root.current
        ?.querySelector(`[data-post="${current?.id}"]`)
        ?.scrollIntoView({ block: "nearest", behavior: "instant" })
    );
  }
  useEffect(() => {
    if (focused || mode !== "list" || !root.current) return;
    // Follow reading position in List without a scroll listener or persisting post content.
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort(
            (a, b) => a.boundingClientRect.top - b.boundingClientRect.top
          )[0];
        const id = (visible?.target as HTMLElement | undefined)?.dataset.post;
        if (id) {
          setSelected(id);
          const url = new URL(location.href);
          url.searchParams.set("post", id);
          url.searchParams.set("mode", "list");
          history.replaceState(null, "", url);
        }
      },
      { rootMargin: "-10% 0px -65% 0px" }
    );
    root.current
      .querySelectorAll("[data-post]")
      .forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [mode, items, focused]);

  function navigation(bottom = false) {
    return (
      <div
        className="gc-page-navigation"
        role="group"
        aria-label={bottom ? "Continue reading" : "Post navigation"}
      >
        <button
          type="button"
          {...(!bottom ? { "data-top-previous": true } : {})}
          className="gc-button gc-button-quiet"
          aria-disabled={index === 0}
          onClick={() => turn(-1, bottom)}
        >
          <ArrowLeft aria-hidden="true" />
          Previous
        </button>
        <span>
          {index + 1} / {items.length}
        </span>
        <button
          type="button"
          {...(!bottom ? { "data-top-next": true } : {})}
          className="gc-button gc-button-quiet"
          aria-disabled={index === items.length - 1}
          onClick={() => turn(1, bottom)}
        >
          Next
          <ArrowRight aria-hidden="true" />
        </button>
      </div>
    );
  }
  return (
    <div
      ref={root}
      className="gc-feed"
      data-mode={mode}
      style={
        focused && homeHeight.current
          ? { minHeight: homeHeight.current }
          : undefined
      }
      onSubmitCapture={(event) => {
        const form = event.target as HTMLFormElement;
        const destination = form.elements?.namedItem("redirectTo");
        if (destination instanceof HTMLInputElement)
          destination.value = location.pathname + location.search;
      }}
    >
      <div className="gc-feed-entry">
        <div>
          <h2>Your feed</h2>
          <p>Read here, or open one post at a time.</p>
        </div>
        <button
          ref={openButton}
          type="button"
          className="gc-button"
          onClick={openFocused}
          aria-haspopup="dialog"
        >
          <Maximize2 aria-hidden="true" />
          Open My feed
        </button>
      </div>
      {focused ? (
        <FocusedFeed
          index={index}
          count={items.length}
          label={current?.label}
          postId={current?.id}
          direction={direction}
          onTurn={turn}
          onClose={closeFocused}
          returnFocus={openButton}
          initialScroll={homeScroll.current}
          moreHref={moreHref?.replace("/platform?", "/platform/feed?")}
        >
          {unavailable && (
            <p className="gc-reading-hint" role="status">
              The post you were reading is no longer in this set. Showing the
              first available post.
            </p>
          )}
          {current?.content ?? emptyContent}
        </FocusedFeed>
      ) : (
        <>
          {unavailable && (
            <p className="mb-4 text-sm text-gc-muted" role="status">
              The post you were reading is no longer in this set. Showing the
              first available post.
            </p>
          )}
          <div className="gc-feed-toolbar">
            <div role="group" aria-label="Feed view" className="gc-mode-picker">
              <button
                type="button"
                aria-pressed={mode === "list"}
                onClick={() => changeMode("list")}
              >
                <List aria-hidden="true" />
                List
              </button>
              <button
                type="button"
                aria-pressed={mode === "pages"}
                onClick={() => changeMode("pages")}
              >
                <BookOpen aria-hidden="true" />
                Pages
              </button>
            </div>
            <a href="/platform" className="gc-refresh">
              <RotateCw aria-hidden="true" />
              Refresh posts
            </a>
          </div>
          <p
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className="sr-only"
          >
            {announcement}
          </p>
          {items.length > 0 && mode === "pages" && (
            <>
              {navigation()}
              <p className="gc-reading-hint">
                One post at a time. Read at your own pace.
              </p>
            </>
          )}
          <div
            className="gc-feed-items"
            data-direction={direction}
            onTouchStart={(event) => {
              const point = event.touches[0];
              const target = event.target as Element;
              touch.current = null;
              if (
                mode !== "pages" ||
                event.touches.length !== 1 ||
                point.clientX < 32 ||
                point.clientX > innerWidth - 32 ||
                target.closest(
                  "a,button,input,textarea,select,summary,details,video,audio,[contenteditable],dialog"
                ) ||
                document.querySelector("dialog[open]") ||
                window.getSelection()?.toString()
              )
                return;
              touch.current = {
                x: point.clientX,
                y: point.clientY,
                time: Date.now()
              };
            }}
            onTouchMove={(event) => {
              if (!touch.current) return;
              if (
                event.touches.length !== 1 ||
                Math.abs(event.touches[0].clientY - touch.current.y) > 20
              )
                touch.current = null;
            }}
            onTouchCancel={() => {
              touch.current = null;
            }}
            onTouchEnd={(event) => {
              const start = touch.current;
              touch.current = null;
              if (
                !start ||
                event.touches.length ||
                Date.now() - start.time > 650 ||
                window.getSelection()?.toString()
              )
                return;
              const end = event.changedTouches[0];
              const dx = end.clientX - start.x;
              if (Math.abs(dx) > 80 && Math.abs(end.clientY - start.y) < 20)
                turn(dx < 0 ? 1 : -1);
            }}
          >
            {!items.length && emptyContent}
            {(mode === "pages" ? (current ? [current] : []) : items).map(
              (item) => (
                <div key={item.id} data-post={item.id} className="gc-post-page">
                  {item.content}
                </div>
              )
            )}
          </div>
          {items.length > 0 && mode === "pages" && navigation(true)}
          {items.length > 0 &&
            (mode === "list" || index === items.length - 1) && (
              <div className="gc-feed-end">
                <p>You&apos;ve reached the end of this set.</p>
                {moreHref ? (
                  <a href={moreHref} className="gc-button gc-button-quiet">
                    Read older posts
                    <ArrowRight aria-hidden="true" />
                  </a>
                ) : (
                  <p className="text-sm text-gc-muted">
                    You&apos;re caught up with the posts available when you
                    opened this page.
                  </p>
                )}
              </div>
            )}
        </>
      )}
    </div>
  );
}
