"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode
} from "react";
import { socialRequest } from "@/lib/platform/social-client";
import type { MenuShortcutsState } from "@/lib/platform/menu-shortcuts";
import { ReadVisibility } from "./read-visibility";
import { MenuLink } from "./menu-link";
import { MenuShortcutsEditor } from "./menu-shortcuts";

// Keep one editor owner while authority-only reads filter available choices.
// The route sends no saved order or capability-derived entries in its payload.
export function MenuPrivateWorkspace({
  owner,
  refreshKey,
  children
}: {
  owner?: string;
  refreshKey: string;
  children: ReactNode;
}) {
  const [page, setPage] = useState<MenuShortcutsState | null>(null);
  const [visible, setVisible] = useState(false);
  const [currentAccess, setCurrentAccess] = useState(false);
  const [notice, setNotice] = useState("Checking current Menu access…");
  const snapshot = useRef<MenuShortcutsState | null>(null);
  const confirmed = useRef<number | null>(null);
  const generation = useRef(0),
    active = useRef(false),
    reading = useRef(false),
    queued = useRef(false);
  const load = useCallback(async () => {
    if (
      !owner ||
      !active.current ||
      document.visibilityState === "hidden" ||
      navigator.onLine === false
    )
      return;
    if (reading.current) {
      queued.current = true;
      return;
    }
    reading.current = true;
    const seq = ++generation.current;
    setVisible(false);
    setCurrentAccess(false);
    setNotice("Checking current Menu access…");
    try {
      const { data } = await socialRequest<MenuShortcutsState>(
        "/api/platform/menu-shortcuts",
        undefined,
        owner
      );
      if (seq !== generation.current || !active.current) return;
      if (data.ownerId !== owner)
        throw Error("These choices are not available to the current account.");
      setCurrentAccess(true);
      if (
        (confirmed.current !== null && data.version < confirmed.current) ||
        (snapshot.current &&
          data.version !== snapshot.current.version &&
          confirmed.current === null)
      ) {
        setNotice(
          "Your saved choices changed. Reload to inspect the current choices. Local edits will be cleared; an unconfirmed save may already be received."
        );
      } else {
        snapshot.current = data;
        confirmed.current = null;
        setPage(data);
        setVisible(true);
        setNotice("");
      }
    } catch (error) {
      if (seq === generation.current && active.current)
        setNotice(
          error instanceof Error
            ? error.message
            : "Current Menu access could not be confirmed."
        );
    } finally {
      reading.current = false;
      if (queued.current && active.current) {
        queued.current = false;
        void load();
      }
    }
  }, [owner]);
  const hide = useCallback(() => {
    active.current = false;
    queued.current = false;
    generation.current++;
    setVisible(false);
    setCurrentAccess(false);
    setNotice("Checking current Menu access…");
  }, []);
  const recheck = useCallback(() => {
    if (document.visibilityState !== "hidden" && navigator.onLine !== false) {
      active.current = true;
      void load();
    }
  }, [load]);
  useEffect(() => {
    if (!owner) return;
    const visibility = () =>
      document.visibilityState === "hidden" ? hide() : recheck();
    const changed = () => {
      if (active.current) void load();
    };
    recheck();
    window.addEventListener("blur", hide);
    window.addEventListener("offline", hide);
    window.addEventListener("pagehide", hide);
    window.addEventListener("focus", recheck);
    window.addEventListener("online", recheck);
    window.addEventListener("pageshow", recheck);
    window.addEventListener("social-relationships-changed", changed);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      hide();
      window.removeEventListener("blur", hide);
      window.removeEventListener("offline", hide);
      window.removeEventListener("pagehide", hide);
      window.removeEventListener("focus", recheck);
      window.removeEventListener("online", recheck);
      window.removeEventListener("pageshow", recheck);
      window.removeEventListener("social-relationships-changed", changed);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [owner, hide, load, recheck]);
  // Same-address Next navigation must recheck authority without replacing edits.
  const previousRefresh = useRef(refreshKey);
  useEffect(() => {
    if (previousRefresh.current === refreshKey) return;
    previousRefresh.current = refreshKey;
    if (active.current) void load();
  }, [refreshKey, load]);
  const onConfirmed = useCallback(
    (receipt: { version: number }) => {
      confirmed.current = receipt.version;
      if (active.current) void load();
    },
    [load]
  );
  const admin = visible
    ? page?.choices.find((item) => item.id === "admin")
    : null;
  return (
    <>
      {owner && (
        <section aria-labelledby="menu-shortcuts-title">
          <h2 id="menu-shortcuts-title">Your shortcuts</h2>
          {!visible && (
            <div className="space-y-3 rounded-xl border p-4">
              <p role="status">{notice}</p>
              <button
                type="button"
                className="gc-button gc-button-quiet"
                onClick={recheck}
              >
                Recheck current access
              </button>
              <button
                type="button"
                className="gc-button gc-button-quiet"
                onClick={() => {
                  if (
                    confirm(
                      "Reload current saved choices and discard local entries? An unconfirmed save may already be received."
                    )
                  )
                    window.location.reload();
                }}
              >
                Reload current information
              </button>
            </div>
          )}
          {visible &&
            page &&
            (page.ids.length ? (
              <ul className="gc-menu-links" aria-label="Saved Menu shortcuts">
                {page.ids.map((id) => (
                  <MenuLink
                    key={id}
                    item={page.choices.find((item) => item.id === id)!}
                  />
                ))}
              </ul>
            ) : (
              <p>No shortcuts selected. Choose the places you use most.</p>
            ))}
          <ReadVisibility.Provider value={visible}>
            {page && (
              <MenuShortcutsEditor
                key={`${owner}:${page.version}`}
                initial={page}
                privacy={{ currentAccess, onAccessDenied: hide, onConfirmed }}
              />
            )}
          </ReadVisibility.Provider>
        </section>
      )}
      {children}
      {admin && (
        <section aria-labelledby="menu-admin">
          <h2 id="menu-admin">Admin</h2>
          <ul className="gc-menu-links">
            <MenuLink item={admin} />
          </ul>
        </section>
      )}
    </>
  );
}
