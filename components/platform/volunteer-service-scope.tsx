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
import { ReadVisibility, useReadVisibility } from "./read-visibility";

const foreground = () =>
  document.hasFocus() &&
  document.visibilityState !== "hidden" &&
  navigator.onLine !== false;

type Props = {
  owner: string | null;
  url: string;
  ready: boolean;
  children: ReactNode;
};
type Original = { owner: string; url: string };

/** The first authorized account owns this working tree until a deliberate
 * reload. Keep this wrapper above the shell's account-keyed providers. */
export function VolunteerServiceScope(props: Props) {
  const [original, setOriginal] = useState<Original | null>(() =>
    props.owner && props.ready ? { owner: props.owner, url: props.url } : null
  );
  if (!original && props.owner && props.ready) {
    setOriginal({ owner: props.owner, url: props.url });
    return null;
  }
  return original ? (
    <RetainedServiceScope {...props} original={original} />
  ) : (
    props.children
  );
}

function RetainedServiceScope({
  owner,
  url,
  ready,
  children,
  original
}: Props & { original: Original }) {
  const router = useRouter();
  const parentVisible = useReadVisibility();
  const [retained, setRetained] = useState({
    url: original.url,
    frame: children
  });
  const [verified, setVerified] = useState<{
    generation: number;
    revision: ReactNode;
    frame: ReactNode;
    url: string;
    presentable: boolean;
  } | null>(null);
  const [notice, setNotice] = useState("Checking current service access…");
  const [recoveries, setRecoveries] = useState<
    Record<string, PrivatePostRecovery>
  >({});
  const work = useRef<Record<string, boolean>>({});
  const pending = useRef<Record<string, PrivatePostRecovery>>({});
  const [workRevision, setWorkRevision] = useState(0);
  const generation = useRef(0);
  const permitted = useRef<typeof verified>(null);
  const flight = useRef<AbortController | null>(null);
  const live = useRef(false);
  const refreshRequested = useRef<string | null>(null);
  const current = useRef({ owner, url, ready, children, parentVisible });
  current.current = { owner, url, ready, children, parentVisible };
  const sourceUrl = useRef(retained.url);
  sourceUrl.current = retained.url;
  const sourceFrame = useRef(retained.frame);
  sourceFrame.current = retained.frame;
  const snapshot = useRef<{ frame: ReactNode; fingerprint: string } | null>(
    null
  );

  const registerWork = useCallback((id: string, protectedWork: boolean) => {
    if (!!work.current[id] === protectedWork) return;
    if (protectedWork) work.current[id] = true;
    else delete work.current[id];
    setWorkRevision((value) => value + 1);
  }, []);
  const registerRecovery = useCallback(
    (id: string, recovery: PrivatePostRecovery | null) => {
      if (!recovery && !pending.current[id]) return;
      const next = { ...pending.current };
      if (recovery) next[id] = recovery;
      else delete next[id];
      pending.current = next;
      setRecoveries(next);
    },
    []
  );

  // A receipt can clear work before the following RSC arrives. Only an
  // authorized, ready frame from the original account may replace that tree.
  // Pagination is adoptable only after every draft and original request clears.
  useLayoutEffect(() => {
    if (
      owner === original.owner &&
      ready &&
      Object.keys(work.current).length === 0 &&
      Object.keys(pending.current).length === 0
    ) {
      setRetained((prior) =>
        prior.url === url && prior.frame === children
          ? prior
          : { url, frame: children }
      );
    }
  }, [owner, original.owner, ready, url, children, workRevision, recoveries]);

  const hide = useCallback(() => {
    generation.current++;
    permitted.current = null;
    flight.current?.abort();
    flight.current = null;
    setVerified(null);
  }, []);

  const check = useCallback(async () => {
    hide();
    if (!live.current || !current.current.parentVisible || !foreground())
      return;
    const seq = generation.current;
    const revision = current.current.children;
    const checkedUrl = sourceUrl.current;
    const checkedFrame = sourceFrame.current;
    const controller = new AbortController();
    flight.current = controller;
    const timer = setTimeout(() => controller.abort(), 10000);
    setNotice("Checking current service access…");
    let releaseAbort = () => {};
    try {
      // Settles even when an interrupted transport or body reader ignores abort.
      const aborted = new Promise<never>((_, reject) => {
        const stop = () =>
          reject(
            Error(
              "Service access could not be confirmed. Your local work is retained. Reconnect and try again."
            )
          );
        controller.signal.addEventListener("abort", stop, { once: true });
        releaseAbort = () =>
          controller.signal.removeEventListener("abort", stop);
      });
      const read = async () => {
        const identity = async () => {
          const response = await fetch("/api/platform/profile?view=identity", {
            credentials: "same-origin",
            cache: "no-store",
            signal: controller.signal,
            headers: { "X-Expected-Account": original.owner }
          });
          if (!response.ok) {
            await response.body?.cancel();
            throw Error(
              "Return to the original account to recover your service entries and requests."
            );
          }
          const value: unknown = await response.json();
          if (
            !value ||
            typeof value !== "object" ||
            (value as { id?: unknown }).id !== original.owner
          )
            throw Error(
              "Return to the original account to recover your service entries and requests."
            );
        };
        await identity();
        if (controller.signal.aborted)
          throw Error("Service access check interrupted.");
        const response = await fetch(checkedUrl, {
          credentials: "same-origin",
          cache: "no-store",
          signal: controller.signal,
          headers: { "X-Expected-Account": original.owner }
        });
        if (!response.ok) {
          await response.body?.cancel();
          throw Error(
            "Current service access is unavailable. Your original entries and requests are retained."
          );
        }
        const value: unknown = await response.json();
        const view = new URL(
          checkedUrl,
          "https://service.invalid"
        ).searchParams.get("view");
        if (
          !value ||
          typeof value !== "object" ||
          Array.isArray(value) ||
          (value as { ownerId?: unknown }).ownerId !== original.owner ||
          (value as { view?: unknown }).view !== view
        )
          throw Error(
            "The original service page could not be confirmed. Your local work is retained."
          );
        if (controller.signal.aborted)
          throw Error("Service access check interrupted.");
        await identity();
        return JSON.stringify(value);
      };
      const fingerprint = await Promise.race([read(), aborted]);
      if (
        !live.current ||
        controller.signal.aborted ||
        flight.current !== controller ||
        seq !== generation.current ||
        revision !== current.current.children ||
        checkedUrl !== sourceUrl.current ||
        checkedFrame !== sourceFrame.current ||
        !current.current.parentVisible ||
        !foreground()
      )
        return;
      if (current.current.url !== checkedUrl) {
        setNotice(
          "Your original service page and local work are retained. Return to that page before continuing."
        );
        return;
      }
      if (current.current.owner !== original.owner || !current.current.ready) {
        setNotice(
          "The original account and source are available. Checking the current page before restoring your local work…"
        );
        const key = JSON.stringify([
          current.current.owner,
          checkedUrl,
          current.current.ready
        ]);
        if (refreshRequested.current !== key) {
          refreshRequested.current = key;
          router.refresh();
        }
        return;
      }
      refreshRequested.current = null;
      // A full canonical page change permits original recovery, but cannot
      // reveal an older retained frame. The nested guard still owns its initial
      // server checksum; this additional stamp protects later frozen reads.
      if (!snapshot.current || snapshot.current.frame !== checkedFrame)
        snapshot.current = { frame: checkedFrame, fingerprint };
      const presentable = snapshot.current.fingerprint === fingerprint;
      const stamp = {
        generation: seq,
        revision,
        frame: checkedFrame,
        url: checkedUrl,
        presentable
      };
      permitted.current = stamp;
      setVerified(stamp);
      setNotice(
        presentable
          ? ""
          : "Current service information changed. Your original entries are retained. Confirm any original request, or deliberately reload current information."
      );
    } catch (error) {
      if (
        live.current &&
        seq === generation.current &&
        flight.current === controller &&
        revision === current.current.children
      )
        setNotice(
          error instanceof Error
            ? error.message
            : "Service access could not be confirmed. Your local work is retained."
        );
    } finally {
      clearTimeout(timer);
      releaseAbort();
      if (flight.current === controller) flight.current = null;
    }
  }, [hide, original.owner, router]);

  useLayoutEffect(() => {
    live.current = true;
    void check();
    return hide;
  }, [
    owner,
    url,
    ready,
    children,
    retained.url,
    retained.frame,
    parentVisible,
    check,
    hide
  ]);

  useEffect(() => {
    live.current = true;
    const restore = () => void check();
    const visibility = () =>
      document.visibilityState === "hidden" ? hide() : restore();
    const timer = setInterval(() => {
      if (foreground()) restore();
    }, 30000);
    for (const event of ["blur", "offline", "pagehide"])
      window.addEventListener(event, hide);
    for (const event of [
      "focus",
      "online",
      "pageshow",
      "social-relationships-changed"
    ])
      window.addEventListener(event, restore);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      live.current = false;
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
        window.removeEventListener(event, restore);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [check, hide]);

  const accessVersion = useCallback(() => {
    const stamp = permitted.current;
    return live.current &&
      stamp &&
      current.current.parentVisible &&
      current.current.owner === original.owner &&
      current.current.ready &&
      current.current.url === stamp.url &&
      sourceUrl.current === stamp.url &&
      sourceFrame.current === stamp.frame &&
      current.current.children === stamp.revision &&
      stamp.generation === generation.current &&
      foreground()
      ? stamp.generation
      : null;
  }, [original.owner]);
  const refresh = useCallback(() => {
    refreshRequested.current = null;
    void check();
  }, [check]);
  const canRecover = !!verified && accessVersion() !== null;
  const allowed = canRecover && !!verified?.presentable;
  return (
    <PrivatePostWorkspace.Provider
      value={{
        owner: original.owner,
        concealed: !allowed,
        accessVersion,
        refresh,
        registerWork,
        registerRecovery
      }}
    >
      {!allowed && (
        <section
          aria-label="Original service access"
          className="container-shell space-y-3 rounded-xl border p-4"
        >
          <p role="status">{notice || "Checking current service access…"}</p>
          <button
            type="button"
            className="gc-button gc-button-quiet"
            onClick={refresh}
          >
            Recheck original service access
          </button>
          <button
            type="button"
            className="gc-button gc-button-quiet"
            onClick={() => {
              if (
                confirm(
                  "Reload current information and discard local entries? An unconfirmed request may already be saved. Reloading does not undo saved changes."
                )
              )
                window.location.reload();
            }}
          >
            Reload current information
          </button>
        </section>
      )}
      {canRecover &&
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
              ? "Confirming original service request…"
              : "Confirm original service request"}
          </button>
        ))}
      <ReadVisibility.Provider value={allowed}>
        <div hidden={!allowed} inert={!allowed}>
          {retained.frame}
        </div>
      </ReadVisibility.Provider>
    </PrivatePostWorkspace.Provider>
  );
}
