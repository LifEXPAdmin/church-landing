"use client";
import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type ReactNode
} from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  List,
  RotateCw,
  Maximize2
} from "lucide-react";
import { FocusedFeed } from "./focused-feed";
import { useReadingPreferences } from "./reading-preferences";
import {
  newWheelGesture,
  readerDate,
  readerHref,
  readerId,
  readerMode,
  touchTurn,
  wheelTurn
} from "@/lib/platform/reader-navigation";

type Item = { id: string; label: string; content: ReactNode };
const interactive =
  "a,button,input,textarea,select,label,summary,details,video,audio,[contenteditable],dialog,[role=dialog]";
function hasDraft(root: HTMLElement | null) {
  return (
    !!root?.querySelector('[data-reader-dirty="true"]') ||
    Array.from(
      root?.querySelectorAll<HTMLInputElement>(
        '.gc-comment-form input[name="content"]'
      ) ?? []
    ).some((input) => input.value.length > 0)
  );
}
function isBusy(root: HTMLElement | null) {
  return !!root?.querySelector('[aria-busy="true"], [data-reader-busy="true"]');
}
export function FeedReader({
  items,
  initialPost,
  initialMode,
  moreHref,
  anchor,
  emptyContent
}: {
  items: Item[];
  initialPost?: string;
  initialMode?: "pages" | "list";
  moreHref?: string;
  anchor?: { id: string; at: string };
  emptyContent?: ReactNode;
}) {
  const { preferences, update } = useReadingPreferences(),
    router = useRouter(),
    search = useSearchParams();
  const pathname = usePathname(),
    focused = pathname === "/platform/feed";
  const homeMode =
    readerMode(search.get("mode")) ?? initialMode ?? preferences.mode;
  const mode = focused ? "pages" : homeMode;
  const openButton = useRef<HTMLButtonElement>(null),
    homeScroll = useRef(0);
  useEffect(() => {
    document.title = `${focused ? "My feed" : "Home"} | Godschurches`;
  }, [focused]);
  function openFocused() {
    turningCleanup();
    homeScroll.current = window.scrollY;
    const url = new URL(location.href);
    url.pathname = "/platform/feed";
    if (current) url.searchParams.set("post", current.id);
    history.pushState(null, "", url);
  }
  function closeFocused() {
    turningCleanup();
    const url = new URL(location.href);
    url.pathname = "/platform";
    history.replaceState(null, "", url);
  }
  const selected = readerId(search.get("post")) ?? initialPost ?? items[0]?.id;
  const index = Math.max(
      0,
      items.findIndex((item) => item.id === selected)
    ),
    current = items[index];
  const unavailable = !!selected && !items.some((item) => item.id === selected);
  const root = useRef<HTMLDivElement>(null),
    sheet = useRef<HTMLDivElement>(null),
    heading = useRef<HTMLParagraphElement>(null);
  const turning = useRef(false),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touch = useRef<{ x: number; y: number; time: number } | null>(null),
    wheel = useRef(newWheelGesture());
  const [leaving, setLeaving] = useState<string | null>(null),
    [direction, setDirection] = useState<"next" | "previous">("next"),
    [height, setHeight] = useState<number>();
  const [announcement, announce] = useState(""),
    [notice, setNotice] = useState(""),
    [leaveHref, setLeaveHref] = useState<string | null>(null);
  const [transitionPending, navigate] = useTransition();
  const [refreshingSet, setRefreshingSet] = useState(false);
  const loading = transitionPending || refreshingSet;
  const discardNavigation = useRef(false);
  const turningCleanup = () => {
    if (timer.current) clearTimeout(timer.current);
    turning.current = false;
    setLeaving(null);
    setHeight(undefined);
  };
  const positionHref = (id = current?.id, nextMode = homeMode) =>
    id ? readerHref(location.href, id, nextMode, anchor) : "/platform";
  function remember(id: string, nextMode = homeMode) {
    history.replaceState(null, "", positionHref(id, nextMode));
  }
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const stop = () => {
      if (media.matches || preferences.reduceMotion) turningCleanup();
    };
    stop();
    media.addEventListener("change", stop);
    return () => {
      media.removeEventListener("change", stop);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [preferences.reduceMotion]);
  useEffect(() => {
    if (
      current &&
      (!readerId(search.get("post")) ||
        !readerDate(search.get("through")) ||
        !readerId(search.get("anchor")))
    ) {
      // Let the router install its history integration before recording the
      // initial position. An earlier native write can erase its Back state.
      const frame = requestAnimationFrame(() =>
        history.replaceState(
          null,
          "",
          readerHref(location.href, selected ?? current.id, homeMode, anchor)
        )
      );
      return () => cancelAnimationFrame(frame);
    }
  }, [current, selected, homeMode, anchor, search]);
  useEffect(() => {
    // Draft content stays in its mounted form, never in a URL or browser storage.
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (
        !discardNavigation.current &&
        (hasDraft(root.current) || isBusy(root.current))
      ) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    const click = (event: MouseEvent) => {
      const link =
        event.target instanceof Element
          ? event.target.closest<HTMLAnchorElement>("a[href]")
          : null;
      if (
        !link ||
        link.target === "_blank" ||
        link.hasAttribute("download") ||
        link.getAttribute("href")?.startsWith("#") ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey ||
        event.button !== 0
      )
        return;
      if (isBusy(root.current)) {
        event.preventDefault();
        event.stopPropagation();
        setNotice(
          "Wait for your current submission to finish before leaving this reader."
        );
      } else if (hasDraft(root.current)) {
        event.preventDefault();
        event.stopPropagation();
        setLeaveHref(link.href);
        setNotice(
          "You have unsent entries on these posts. Keep reading, or open the destination in a new tab to keep your entries here."
        );
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", click, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", click, true);
    };
  }, []);
  useEffect(() => {
    if (focused || mode !== "list" || !root.current) return;
    // Use the reading line, not a preceding post's last visible pixels. Keep
    // scroll work to one animation frame and never move focus while scrolling.
    const nodes = Array.from(
      root.current.querySelectorAll<HTMLElement>("[data-post]")
    );
    let pendingFrame = 0;
    const position = () => {
      pendingFrame = 0;
      const node =
        nodes.find(
          (item) => item.getBoundingClientRect().bottom > innerHeight * 0.25
        ) ?? nodes.at(-1);
      const id = node?.dataset.post;
      if (id && new URL(location.href).searchParams.get("post") !== id)
        history.replaceState(
          null,
          "",
          readerHref(location.href, id, "list", anchor)
        );
    };
    const scroll = () => {
      if (!pendingFrame) pendingFrame = requestAnimationFrame(position);
    };
    const restored =
      readerId(new URL(location.href).searchParams.get("post")) ?? initialPost;
    const frame = requestAnimationFrame(() => {
      const node = nodes.find((item) => item.dataset.post === restored);
      const rect = node?.getBoundingClientRect();
      if (rect && (rect.bottom <= 0 || rect.top >= innerHeight * 0.5))
        node?.scrollIntoView({ block: "start", behavior: "instant" });
      position();
    });
    window.addEventListener("scroll", scroll, { passive: true });
    window.addEventListener("resize", scroll);
    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(pendingFrame);
      window.removeEventListener("scroll", scroll);
      window.removeEventListener("resize", scroll);
    };
  }, [focused, mode, items, anchor, initialPost]);
  const blockedGesture = (target: EventTarget | null) =>
    focused ||
    mode !== "pages" ||
    loading ||
    turning.current ||
    isBusy(root.current) ||
    (target instanceof Element && !!target.closest(interactive)) ||
    !!document.querySelector(
      'dialog[open],[role="dialog"][aria-modal="true"]'
    ) ||
    !!getSelection()?.toString();
  function turn(delta: number, fromBottom = false) {
    if (turning.current || loading) return;
    if (isBusy(root.current)) {
      setNotice(
        "Wait for your current submission to finish before turning the page."
      );
      return;
    }
    const next = items[index + delta];
    if (!next) {
      announce(
        delta < 0
          ? "This is the first post in this set."
          : moreHref
            ? "This is the last post in this set. Older posts are available below."
            : "You have reached the last available post."
      );
      return;
    }
    setNotice("");
    setLeaveHref(null);
    setDirection(delta > 0 ? "next" : "previous");
    if (
      !focused &&
      !preferences.reduceMotion &&
      !matchMedia("(prefers-reduced-motion: reduce)").matches &&
      current
    ) {
      turning.current = true;
      setHeight(sheet.current?.offsetHeight);
      setLeaving(current.id);
      timer.current = setTimeout(turningCleanup, 520);
    }
    remember(next.id);
    announce(`Post ${index + delta + 1} of ${items.length}, by ${next.label}`);
    if (fromBottom)
      requestAnimationFrame(() => {
        heading.current?.focus({ preventScroll: true });
        root.current?.scrollIntoView({ block: "start", behavior: "instant" });
      });
  }
  function changeMode(nextMode: "pages" | "list") {
    turningCleanup();
    update({ mode: nextMode });
    if (current) remember(current.id, nextMode);
    announce(
      `${nextMode === "pages" ? "Pages" : "List"} view. Your entries stay with their posts.`
    );
    requestAnimationFrame(() => {
      Array.from(
        root.current?.querySelectorAll<HTMLElement>("[data-post]") ?? []
      )
        .find((node) => node.dataset.post === current?.id)
        ?.scrollIntoView({ block: "nearest", behavior: "instant" });
    });
  }
  function navigation(bottom = false) {
    return (
      <div
        className="gc-page-navigation"
        role="group"
        aria-label={bottom ? "Continue reading" : "Post navigation"}
      >
        <button
          type="button"
          className="gc-button gc-button-quiet"
          aria-disabled={index === 0 || loading}
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
          className="gc-button gc-button-quiet"
          aria-disabled={index === items.length - 1 || loading}
          onClick={() => turn(1, bottom)}
        >
          Next
          <ArrowRight aria-hidden="true" />
        </button>
      </div>
    );
  }
  // Native non-passive handling cancels only eligible horizontal scrolling, so
  // the browser cannot also interpret the same gesture as history navigation.
  // Rebind after renders to use current selection and permissions.
  useEffect(() => {
    const node = sheet.current;
    const onWheel = (event: WheelEvent) => {
      const eligible =
        !focused &&
        mode === "pages" &&
        !event.ctrlKey &&
        !event.metaKey &&
        event.clientX >= 32 &&
        event.clientX <= innerWidth - 32 &&
        !(
          event.target instanceof Element && event.target.closest(interactive)
        ) &&
        !getSelection()?.toString() &&
        !document.querySelector(
          'dialog[open],[role="dialog"][aria-modal="true"]'
        );
      if (
        eligible &&
        Math.abs(event.deltaX) > Math.abs(event.deltaY) * 2 &&
        event.cancelable
      )
        event.preventDefault();
      const result = wheelTurn(wheel.current, {
        x: event.deltaX,
        y: event.deltaY,
        mode: event.deltaMode,
        height: innerHeight,
        time: performance.now(),
        blocked: !eligible || loading || turning.current || isBusy(root.current)
      });
      wheel.current = result.state;
      if (result.delta) turn(result.delta);
    };
    node?.addEventListener("wheel", onWheel, { passive: false });
    return () => node?.removeEventListener("wheel", onWheel);
  });
  return (
    <div ref={root} className="gc-feed" data-mode={mode} aria-busy={loading}>
      <div className="gc-feed-entry" hidden={focused}>
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
          <Maximize2 aria-hidden="true" /> Open My feed
        </button>
      </div>
      <FocusedFeed
        active={focused}
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
          <p className="mb-4 text-sm text-gc-muted" role="status">
            The post you were reading is no longer in this set. Its content and
            unsent entries are no longer available here.
            {current
              ? " Showing the first available post."
              : " No posts remain in this set."}
          </p>
        )}
        <div className="gc-feed-toolbar" hidden={focused}>
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
          <button
            type="button"
            className="gc-refresh"
            disabled={loading}
            onClick={() => {
              if (isBusy(root.current) || hasDraft(root.current)) {
                setNotice(
                  "Finish or clear your unsent entries before refreshing. You can keep using Pages and List without losing them."
                );
                return;
              }
              if (current) remember(current.id);
              // Request a fresh document at the frozen reading URL. A server
              // failure then uses the route's explicit retry screen.
              setRefreshingSet(true);
              announce(
                "Refreshing this set while keeping your reading position."
              );
              location.reload();
            }}
          >
            <RotateCw aria-hidden="true" />
            {loading ? "Loading posts…" : "Refresh posts"}
          </button>
        </div>
        <p
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="sr-only"
        >
          {announcement}
        </p>
        {notice && (
          <div
            role="status"
            className="my-4 space-y-3 rounded-xl border border-gc-divider p-4"
          >
            <p>{notice}</p>
            {leaveHref && (
              <div className="flex flex-wrap gap-4">
                <button
                  type="button"
                  className="gc-button gc-button-quiet"
                  onClick={() => {
                    setNotice("");
                    setLeaveHref(null);
                  }}
                >
                  Keep reading
                </button>
                <a
                  href={leaveHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="gc-button gc-button-quiet"
                >
                  Open in a new tab
                </a>
                <button
                  type="button"
                  className="gc-button gc-button-quiet"
                  onClick={() => {
                    discardNavigation.current = true;
                    location.assign(leaveHref);
                  }}
                >
                  Discard unsent entries and leave
                </button>
              </div>
            )}
          </div>
        )}
        {!focused && current && mode === "pages" && (
          <>
            {navigation()}
            <p ref={heading} tabIndex={-1} className="gc-reading-hint">
              One post at a time. Swipe right for next, left for previous.
              Scroll down to keep reading.
            </p>
          </>
        )}
        <div
          ref={sheet}
          className="gc-feed-items"
          data-direction={direction}
          style={height ? { minHeight: height } : undefined}
          onSubmitCapture={(event) => {
            const form = event.target as HTMLFormElement,
              id = form.closest<HTMLElement>("[data-post]")?.dataset.post;
            const destination = form.elements?.namedItem("redirectTo");
            if (id) {
              remember(id);
              if (destination instanceof HTMLInputElement)
                destination.value = positionHref(id);
            }
          }}
          onTouchStart={(event) => {
            touch.current = null;
            const point = event.touches[0];
            if (
              !point ||
              event.touches.length !== 1 ||
              point.clientX < 32 ||
              point.clientX > innerWidth - 32 ||
              blockedGesture(event.target)
            )
              return;
            touch.current = {
              x: point.clientX,
              y: point.clientY,
              time: performance.now()
            };
          }}
          onTouchMove={(event) => {
            if (
              touch.current &&
              (event.touches.length !== 1 ||
                Math.abs(event.touches[0].clientY - touch.current.y) > 20)
            )
              touch.current = null;
          }}
          onTouchCancel={() => {
            touch.current = null;
          }}
          onTouchEnd={(event) => {
            const start = touch.current,
              end = event.changedTouches[0];
            touch.current = null;
            if (
              !start ||
              !end ||
              event.touches.length ||
              blockedGesture(event.target)
            )
              return;
            const delta = touchTurn(
              end.clientX - start.x,
              end.clientY - start.y,
              performance.now() - start.time
            );
            if (delta) turn(delta);
          }}
        >
          {!items.length && emptyContent}
          {items.map((item) => {
            const isLeaving =
              mode === "pages" &&
              leaving === item.id &&
              item.id !== current?.id;
            const hidden =
              mode === "pages" && item.id !== current?.id && !isLeaving;
            return (
              <div
                key={item.id}
                data-post={item.id}
                data-leaving={isLeaving || undefined}
                hidden={hidden}
                inert={hidden || isLeaving}
                aria-hidden={hidden || isLeaving || undefined}
                className="gc-post-page"
              >
                {item.content}
              </div>
            );
          })}
        </div>
        {!focused && current && mode === "pages" && navigation(true)}
        {!focused &&
          items.length > 0 &&
          (mode === "list" || !current || index === items.length - 1) && (
            <div className="gc-feed-end">
              <p>You&apos;ve reached the end of this set.</p>
              {moreHref ? (
                <a
                  href={`${moreHref}&mode=${mode}`}
                  onClick={(event) => {
                    event.preventDefault();
                    navigate(() => router.push(`${moreHref}&mode=${mode}`));
                  }}
                  className="gc-button gc-button-quiet"
                >
                  Read older posts
                  <ArrowRight aria-hidden="true" />
                </a>
              ) : (
                <p className="text-sm text-gc-muted">
                  You&apos;re caught up with the posts available when you opened
                  this page.
                </p>
              )}
              <a
                href="/platform"
                onClick={(event) => {
                  event.preventDefault();
                  navigate(() => router.push("/platform"));
                }}
                className="inline-flex min-h-11 items-center text-gc-accent underline"
              >
                Start again with the newest posts
              </a>
            </div>
          )}
      </FocusedFeed>
    </div>
  );
}
