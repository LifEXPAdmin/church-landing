"use client";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode
} from "react";
import { useRouter } from "next/navigation";
import {
  PrivatePostWorkspace,
  type PrivatePostRecovery
} from "./private-post-workspace";
import { CommentThread } from "./comment-thread";
import { ReadVisibility, useReadVisibility } from "./read-visibility";

/** Keep the original working tree above the account-keyed shell. A server
 * refresh may update read-only content, but cannot replace a protected owner. */
type RecruitmentScopeProps = {
  owner: string | null;
  opportunityId: string;
  postId: string | null;
  children: ReactNode;
};
type RecruitmentSource = {
  owner: string | null;
  opportunityId: string;
  postId: string;
};
export function RecruitmentConversationScope(props: RecruitmentScopeProps) {
  const [initial, setInitial] = useState<RecruitmentSource | null>(() =>
    props.postId
      ? {
          owner: props.owner,
          opportunityId: props.opportunityId,
          postId: props.postId
        }
      : null
  );
  // A denied initial response has no working owner. Initialize on the first
  // permitted source, then retain that component through later denied responses.
  if (!initial && props.postId) {
    setInitial({
      owner: props.owner,
      opportunityId: props.opportunityId,
      postId: props.postId
    });
    return null;
  }
  return initial ? (
    <RetainedRecruitmentScope {...props} original={initial} />
  ) : (
    props.children
  );
}
function RetainedRecruitmentScope({
  owner,
  opportunityId,
  postId,
  children,
  original
}: RecruitmentScopeProps & { original: RecruitmentSource }) {
  const router = useRouter();
  const [frame, setFrame] = useState(children);
  const [visible, setVisible] = useState(false);
  const [notice, setNotice] = useState("Checking current recruitment access…");
  const [recoveries, setRecoveries] = useState<
    Record<string, PrivatePostRecovery>
  >({});
  const work = useRef<Record<string, boolean>>({});
  const [protectedCount, setProtectedCount] = useState(0);
  const generation = useRef(0),
    permitted = useRef(false);
  const flight = useRef<AbortController | null>(null);
  const sameSource =
    owner === original.owner &&
    opportunityId === original.opportunityId &&
    postId === original.postId;
  const sourceNow = useRef(sameSource);
  const registerWork = useCallback((id: string, protectedWork: boolean) => {
    if (!!work.current[id] === protectedWork) return;
    if (protectedWork) work.current[id] = true;
    else delete work.current[id];
    setProtectedCount(Object.keys(work.current).length);
  }, []);
  const registerRecovery = useCallback(
    (id: string, value: PrivatePostRecovery | null) => {
      setRecoveries((current) => {
        if (!value && !current[id]) return current;
        const next = { ...current };
        if (value) next[id] = value;
        else delete next[id];
        return next;
      });
    },
    []
  );
  useEffect(() => {
    if (sameSource && protectedCount === 0) setFrame(children);
  }, [children, sameSource, protectedCount]);
  const hide = useCallback(() => {
    generation.current++;
    permitted.current = false;
    flight.current?.abort();
    flight.current = null;
    setVisible(false);
  }, []);
  const read = useCallback(async () => {
    hide();
    if (
      !sourceNow.current ||
      !document.hasFocus() ||
      document.visibilityState === "hidden" ||
      !navigator.onLine
    )
      return;
    const seq = generation.current;
    const controller = new AbortController();
    flight.current = controller;
    const timer = setTimeout(() => controller.abort(), 10000);
    setNotice("Checking current recruitment access…");
    try {
      const response = await fetch(
        `/api/platform/volunteers?${new URLSearchParams({ view: "opportunity", id: original.opportunityId })}`,
        {
          credentials: "same-origin",
          cache: "no-store",
          signal: controller.signal,
          headers: original.owner
            ? { "X-Expected-Account": original.owner }
            : {}
        }
      );
      const data = await response.json();
      if (
        !response.ok ||
        data.ownerId !== original.owner ||
        data.opportunity?.id !== original.opportunityId ||
        data.opportunity?.postId !== original.postId
      )
        throw Error(
          "This recruitment page is unavailable to the original account. Your local working copy is retained."
        );
      const identity = await fetch("/api/platform/profile?view=identity", {
        credentials: "same-origin",
        cache: "no-store",
        signal: controller.signal
      });
      const current =
        identity.status === 401
          ? null
          : identity.ok
            ? (await identity.json()).id
            : undefined;
      if (identity.status === 401) await identity.body?.cancel();
      if (current !== original.owner)
        throw Error(
          "Your sign-in changed. Return to the original account to continue this working copy."
        );
      if (
        !sourceNow.current ||
        seq !== generation.current ||
        controller.signal.aborted ||
        !document.hasFocus() ||
        !navigator.onLine
      )
        return;
      permitted.current = true;
      setVisible(true);
      setNotice("");
    } catch (error) {
      if (seq === generation.current)
        setNotice(
          controller.signal.aborted
            ? "Current recruitment access could not be confirmed. Reconnect and try again. Your local working copy is retained."
            : error instanceof Error
              ? error.message
              : "Current recruitment access could not be confirmed."
        );
    } finally {
      clearTimeout(timer);
      if (flight.current === controller) flight.current = null;
    }
  }, [hide, original]);
  useLayoutEffect(() => {
    sourceNow.current = sameSource;
    hide();
    if (sameSource) void read();
    else
      setNotice(
        "This page’s account or source changed. Your original working copy is retained. Return to the original account and page to continue."
      );
    return hide;
  }, [sameSource, owner, opportunityId, postId, hide, read]);
  useEffect(() => {
    const refresh = () => {
      void read();
    };
    const visibility = () =>
      document.visibilityState === "hidden" ? hide() : refresh();
    const timer = setInterval(() => {
      if (document.hasFocus() && navigator.onLine) refresh();
    }, 30000);
    for (const event of ["blur", "offline", "pagehide"])
      window.addEventListener(event, hide);
    for (const event of [
      "focus",
      "online",
      "pageshow",
      "social-relationships-changed"
    ])
      window.addEventListener(event, refresh);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      clearInterval(timer);
      hide();
      for (const event of ["blur", "offline", "pagehide"])
        window.removeEventListener(event, hide);
      for (const event of [
        "focus",
        "online",
        "pageshow",
        "social-relationships-changed"
      ])
        window.removeEventListener(event, refresh);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [read, hide]);
  const accessVersion = useCallback(
    () =>
      sourceNow.current &&
      permitted.current &&
      document.hasFocus() &&
      navigator.onLine
        ? generation.current
        : null,
    []
  );
  const refresh = useCallback(() => {
    if (!sourceNow.current) router.refresh();
    else void read();
  }, [read, router]);
  const concealed = !visible || !sameSource;
  return (
    <PrivatePostWorkspace.Provider
      value={
        original.owner
          ? {
              owner: original.owner,
              concealed,
              accessVersion,
              refresh,
              registerWork,
              registerRecovery
            }
          : null
      }
    >
      {concealed && (
        <section
          aria-label="Recruitment access"
          className="container-shell space-y-3 rounded-xl border p-4"
        >
          <p role="status">
            {notice || "Checking current recruitment access…"}
          </p>
          <button
            type="button"
            className="gc-button gc-button-quiet"
            onClick={refresh}
          >
            Recheck discussion access
          </button>
          <button
            type="button"
            className="gc-button gc-button-quiet"
            onClick={() => {
              if (
                confirm(
                  "Reload this page and discard local entries? An unconfirmed request may already be saved. Reloading does not undo saved changes."
                )
              )
                window.location.reload();
            }}
          >
            Reload current information
          </button>
        </section>
      )}
      {!concealed &&
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
              ? "Confirming original comment request…"
              : "Confirm original comment request"}
          </button>
        ))}
      <ReadVisibility.Provider value={!concealed}>
        <div hidden={concealed} inert={concealed}>
          {frame}
        </div>
      </ReadVisibility.Provider>
    </PrivatePostWorkspace.Provider>
  );
}

/** A recruitment page presents its existing post thread, never its applications.
 * Retain the original owner/target while server refreshes replace page props. */
export function RecruitmentConversation({
  owner,
  opportunityId,
  postId
}: {
  owner: string | null;
  opportunityId: string;
  postId: string;
}) {
  const original = useRef({ owner, opportunityId, postId }).current;
  const visible = useReadVisibility();
  const same =
    original.owner === owner &&
    original.opportunityId === opportunityId &&
    original.postId === postId;
  return (
    <section
      aria-label="Recruitment discussion"
      className="min-w-0 space-y-4 rounded-xl border p-4 max-[359px]:px-[12px]"
    >
      {visible && same && (
        <p>
          This is the church recruitment post’s shared discussion. Comments are
          visible to everyone who can read that post. Use the separate
          application form for your private application note and availability.
          Commenting does not apply or reserve a place.
        </p>
      )}
      {!same && (
        <p role="status">
          This discussion’s account or source changed. Your original working
          copy is retained. Return to the original account and page to continue.
        </p>
      )}
      <ReadVisibility.Provider value={visible && same}>
        <CommentThread
          postId={original.postId}
          expectedOwner={original.owner}
          returnTo={`/platform/serve/${original.opportunityId}`}
        />
      </ReadVisibility.Provider>
    </section>
  );
}
