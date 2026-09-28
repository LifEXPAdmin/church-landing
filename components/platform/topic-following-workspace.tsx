"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode
} from "react";
import { socialRequest } from "@/lib/platform/social-client";
import type { PostView } from "@/lib/platform/post-reads";
import {
  PrivatePostWorkspace,
  type PrivatePostRecovery
} from "./private-post-workspace";
import { ReadVisibility, useReadVisibility } from "./read-visibility";
import { PostCardContent } from "./post-card-content";
import { PostParticipationClient } from "./post-participation-client";

type Stream = {
  accountId: string;
  following: string[];
  posts: PostView[];
  next: { before: string; cursor: string } | null;
};
const Data = createContext<{
  snapshot: Stream | null;
  concealed: boolean;
  before?: string;
  cursor?: string;
  accessPanel?: ReactNode;
}>({ snapshot: null, concealed: true });
const path = "/platform/topics/following";

// This owner lives above the shell, including its lazy prayer workspace. A
// current-account RSC refresh cannot replace controllers opened by another owner.
export function TopicFollowingScope({
  owner,
  before,
  cursor,
  children
}: {
  owner: string;
  before?: string;
  cursor?: string;
  children: ReactNode;
}) {
  const originalOwner = useRef(owner).current;
  const scopeVisible = useReadVisibility();
  const [snapshot, setSnapshot] = useState<Stream | null>(null);
  const [visible, setVisible] = useState(false),
    [currentAccess, setCurrentAccess] = useState(false);
  const [notice, setNotice] = useState(
    "Checking current followed topics access…"
  );
  const [recoveries, setRecoveries] = useState<
    Record<string, PrivatePostRecovery>
  >({});
  const work = useRef<Record<string, boolean>>({}),
    checksum = useRef<string | null>(null);
  const active = useRef(false),
    generation = useRef(0),
    reading = useRef(false),
    queued = useRef(false);
  const scopeNow = useRef(scopeVisible),
    accessNow = useRef(false),
    latest = useRef<() => Promise<void>>(async () => {});
  const url = `/api/platform/topics?${new URLSearchParams({ view: "following-stream", ...(before ? { before } : {}), ...(cursor ? { cursor } : {}) })}`;
  const registerWork = useCallback((id: string, protectedWork: boolean) => {
    if (protectedWork) work.current[id] = true;
    else delete work.current[id];
  }, []);
  const registerRecovery = useCallback(
    (id: string, entry: PrivatePostRecovery | null) => {
      setRecoveries((previous) => {
        if (!entry && !previous[id]) return previous;
        const next = { ...previous };
        if (entry) next[id] = entry;
        else delete next[id];
        return next;
      });
    },
    []
  );
  const hide = useCallback(() => {
    active.current = false;
    queued.current = false;
    generation.current++;
    accessNow.current = false;
    setCurrentAccess(false);
    setVisible(false);
    setNotice("Checking current followed topics access…");
  }, []);
  useLayoutEffect(() => {
    scopeNow.current = scopeVisible;
    if (!scopeVisible) hide();
  }, [scopeVisible, hide]);
  const read = useCallback(async () => {
    if (
      !active.current ||
      !scopeNow.current ||
      document.visibilityState === "hidden"
    )
      return;
    if (reading.current) {
      queued.current = true;
      return;
    }
    reading.current = true;
    const seq = ++generation.current;
    accessNow.current = false;
    setCurrentAccess(false);
    setVisible(false);
    setNotice("Checking current followed topics access…");
    try {
      const { data } = await socialRequest<Stream>(
        url,
        undefined,
        originalOwner
      );
      const digest = JSON.stringify(data);
      if (seq !== generation.current || !active.current || !scopeNow.current)
        return;
      if (
        data.accountId !== originalOwner ||
        !Array.isArray(data.following) ||
        !Array.isArray(data.posts) ||
        data.posts.length > 20
      )
        throw Error("Current followed topics could not be confirmed.");
      accessNow.current = true;
      setCurrentAccess(true);
      const changed = checksum.current !== null && checksum.current !== digest;
      if (changed && Object.keys(work.current).length) {
        setNotice(
          "These followed topics or their posts changed. Your local entries are retained. Confirm an original request, or reload to inspect current posts. Reloading clears local entries and does not undo saved changes."
        );
        return;
      }
      if (checksum.current === null || changed) {
        checksum.current = digest;
        setSnapshot(data);
      }
      setVisible(true);
      setNotice("");
    } catch (error) {
      if (seq === generation.current && active.current)
        setNotice(
          error instanceof Error
            ? error.message
            : "Current followed topics access could not be confirmed."
        );
    } finally {
      reading.current = false;
      if (queued.current && active.current) {
        queued.current = false;
        void latest.current();
      }
    }
  }, [url, originalOwner]);
  latest.current = read;
  useEffect(() => {
    const resume = () => {
      if (!scopeNow.current || document.visibilityState === "hidden") return;
      active.current = true;
      void read();
    };
    const refresh = () => {
      if (active.current) void read();
    };
    const visibility = () =>
      document.visibilityState === "hidden" ? hide() : resume();
    if (scopeVisible) resume();
    else hide();
    const timer = setInterval(refresh, 30000);
    window.addEventListener("blur", hide);
    window.addEventListener("pagehide", hide);
    window.addEventListener("offline", hide);
    window.addEventListener("focus", resume);
    window.addEventListener("pageshow", resume);
    window.addEventListener("online", refresh);
    window.addEventListener("social-relationships-changed", refresh);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      clearInterval(timer);
      hide();
      window.removeEventListener("blur", hide);
      window.removeEventListener("pagehide", hide);
      window.removeEventListener("offline", hide);
      window.removeEventListener("focus", resume);
      window.removeEventListener("pageshow", resume);
      window.removeEventListener("online", refresh);
      window.removeEventListener("social-relationships-changed", refresh);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [scopeVisible, read, hide]);
  const accessVersion = useCallback(
    () =>
      active.current && scopeNow.current && accessNow.current
        ? generation.current
        : null,
    []
  );
  const refresh = useCallback(() => {
    if (active.current) void latest.current();
  }, []);
  const concealed = !visible || !scopeVisible;
  const accessPanel = concealed && (
    <section
      aria-label="Followed topics access"
      className="container-shell space-y-3 rounded-xl border p-4"
    >
      <p role="status">
        {notice || "Checking current followed topics access…"}
      </p>
      {currentAccess &&
        scopeVisible &&
        Object.entries(recoveries).map(([id, recovery]) => (
          <button
            key={id}
            type="button"
            className="gc-button"
            disabled={recovery.busy}
            onClick={() => {
              if (accessVersion() !== null) recovery.retry();
            }}
          >
            {recovery.busy
              ? "Confirming original request…"
              : "Confirm original request"}
          </button>
        ))}
      <button
        type="button"
        className="gc-button gc-button-quiet"
        onClick={() => {
          if (!scopeNow.current || document.visibilityState === "hidden")
            return;
          active.current = true;
          void read();
        }}
      >
        Recheck current access
      </button>
      <button
        type="button"
        className="gc-button gc-button-quiet"
        onClick={() => {
          if (
            confirm(
              "Reload current posts and discard local entries? An unconfirmed request may already be saved. Reloading does not undo saved changes."
            )
          )
            window.location.reload();
        }}
      >
        Reload current information
      </button>
    </section>
  );
  return (
    <PrivatePostWorkspace.Provider
      value={{
        owner: originalOwner,
        concealed,
        accessVersion,
        refresh,
        registerWork,
        registerRecovery
      }}
    >
      <Data.Provider
        value={{ snapshot, concealed, before, cursor, accessPanel }}
      >
        <ReadVisibility.Provider value={!concealed}>
          {children}
        </ReadVisibility.Provider>
      </Data.Provider>
    </PrivatePostWorkspace.Provider>
  );
}

export function TopicFollowingWorkspace() {
  const { snapshot, concealed, before, cursor, accessPanel } = useContext(Data);
  const currentPath =
    path +
    (before && cursor ? `?${new URLSearchParams({ before, cursor })}` : "");
  return (
    <section aria-label="Posts in topics you follow" className="space-y-5">
      <h2 className="text-2xl">Posts in topics you follow</h2>
      {accessPanel}
      {!concealed && before && cursor && (
        <a className="gc-button gc-button-quiet" href={path}>
          Latest topic posts
        </a>
      )}
      {!concealed && snapshot?.posts.length === 0 && (
        <p>
          No posts to show here yet. Follow a public topic to add its
          discussions to this stream.
        </p>
      )}
      {snapshot?.posts.map((post) => (
        <PostCardContent
          key={post.id}
          post={post}
          currentUserId={snapshot.accountId}
          redirectTo={currentPath}
          concealed={concealed}
          participation={
            <PostParticipationClient
              postId={
                post.repost?.kind === "PLAIN" && post.repost.source
                  ? post.repost.source.id
                  : post.id
              }
              manage={false}
            />
          }
        />
      ))}
      {!concealed && snapshot?.next && (
        <a
          className="gc-button gc-button-quiet"
          href={`${path}?${new URLSearchParams(snapshot.next)}`}
        >
          Older topic posts
        </a>
      )}
    </section>
  );
}
