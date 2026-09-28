"use client";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState
} from "react";
import Link from "next/link";
import type { readTopicManagement } from "@/lib/platform/topic-communities";
import { socialRequest } from "@/lib/platform/social-client";
import { topicHref, topicRestrictionReasons } from "@/lib/platform/topic-types";
import { TopicManagement } from "./topic-controls";
import { TopicFormWorkspace, type TopicFormWork } from "./topic-form-workspace";
import { useReadVisibility } from "./read-visibility";

type Management = Awaited<ReturnType<typeof readTopicManagement>>;
export function TopicManagementWorkspace({
  owner,
  slug,
  after,
  auditAfter
}: {
  owner: string;
  slug: string;
  after?: string;
  auditAfter?: string;
}) {
  const originalOwner = useRef(owner).current,
    scopeVisible = useReadVisibility();
  const url = `/api/platform/topics?${new URLSearchParams({
    view: "management",
    slug,
    ...(after ? { after } : {}),
    ...(auditAfter ? { auditAfter } : {})
  })}`;
  const path = `${topicHref(slug)}/manage`;
  const [snapshot, setSnapshot] = useState<{
    data: Management;
    revision: number;
  } | null>(null);
  const [visible, setVisible] = useState(false),
    [currentAccess, setCurrentAccess] = useState(false);
  const [notice, setNotice] = useState(
    "Checking current topic management access…"
  );
  const [work, setWork] = useState<Record<string, TopicFormWork>>({});
  const workNow = useRef<Record<string, TopicFormWork>>({}),
    checksum = useRef<string | null>(null);
  const active = useRef(false),
    generation = useRef(0),
    reading = useRef(false),
    queued = useRef(false);
  const scopeNow = useRef(scopeVisible),
    accessNow = useRef(false),
    latest = useRef<() => Promise<void>>(async () => {});
  const register = useCallback((id: string, entry: TopicFormWork | null) => {
    const next = { ...workNow.current };
    if (entry) next[id] = entry;
    else delete next[id];
    workNow.current = next;
    setWork(next);
  }, []);
  const hide = useCallback(() => {
    active.current = false;
    queued.current = false;
    generation.current++;
    accessNow.current = false;
    setCurrentAccess(false);
    setVisible(false);
    setNotice("Checking current topic management access…");
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
    setNotice("Checking current topic management access…");
    try {
      const { data } = await socialRequest<Management>(
        url,
        undefined,
        originalOwner
      );
      const digest = Array.from(
        new Uint8Array(
          await crypto.subtle.digest(
            "SHA-256",
            new TextEncoder().encode(JSON.stringify(data))
          )
        ),
        (b) => b.toString(16).padStart(2, "0")
      ).join("");
      if (seq !== generation.current || !active.current || !scopeNow.current)
        return;
      if (
        !data?.view?.community?.id ||
        !data.view.viewer ||
        (data.members !== null && !Array.isArray(data.members?.members)) ||
        (data.history !== null && !Array.isArray(data.history?.entries))
      )
        throw Error(
          "Current topic management information could not be confirmed."
        );
      accessNow.current = true;
      setCurrentAccess(true);
      const changed = checksum.current !== null && checksum.current !== digest;
      if (
        changed &&
        Object.values(workNow.current).some((entry) => entry.protectedWork)
      ) {
        setNotice(
          "This topic management information or its access changed. Your local entries are retained. Confirm an original request, or reload to inspect current details. Reloading clears local entries and does not undo saved changes."
        );
        return;
      }
      if (checksum.current === null || changed) {
        checksum.current = digest;
        setSnapshot((previous) => ({
          data,
          revision: (previous?.revision ?? 0) + 1
        }));
      }
      setVisible(true);
      setNotice("");
    } catch (error) {
      if (seq === generation.current && active.current)
        setNotice(
          error instanceof Error
            ? error.message
            : "Current topic management access could not be confirmed."
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
    window.addEventListener("blur", hide);
    window.addEventListener("pagehide", hide);
    window.addEventListener("offline", hide);
    window.addEventListener("focus", resume);
    window.addEventListener("pageshow", resume);
    window.addEventListener("online", refresh);
    window.addEventListener("social-relationships-changed", refresh);
    document.addEventListener("visibilitychange", visibility);
    return () => {
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
      active.current && accessNow.current && scopeNow.current
        ? generation.current
        : null,
    []
  );
  const denied = useCallback(
    (seq: number | null | undefined) => {
      if (seq === generation.current) hide();
    },
    [hide]
  );
  const saved = useCallback(() => {
    if (active.current) void latest.current();
  }, []);
  const concealed = !visible || !scopeVisible;
  return (
    <TopicFormWorkspace.Provider
      value={{ concealed, register, accessVersion, denied, saved }}
    >
      {concealed && (
        <div className="space-y-3 rounded-xl border p-4">
          <p role="status">
            {notice || "Checking current topic management access…"}
          </p>
          {currentAccess &&
            scopeVisible &&
            Object.entries(work)
              .filter(([, entry]) => entry.pending)
              .map(([id, entry]) => (
                <button
                  key={id}
                  type="button"
                  className="gc-button"
                  disabled={entry.busy}
                  onClick={entry.retry}
                >
                  {entry.busy
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
                  "Reload current details and discard local entries? An unconfirmed request may already be saved. Reloading does not undo saved changes."
                )
              )
                window.location.reload();
            }}
          >
            Reload current information
          </button>
          <Link
            prefetch={false}
            className="inline-flex min-h-11 items-center underline"
            href="/platform/settings/account"
          >
            Review account verification
          </Link>
        </div>
      )}
      {snapshot && (
        <div className="space-y-6">
          {!concealed && (
            <>
              <h1 className="break-words text-4xl">
                Manage {snapshot.data.view.community.name}
              </h1>
              <p>
                {snapshot.data.view.community.lifecycle === "ACTIVE"
                  ? "Active topic"
                  : "Archived topic"}{" "}
                ·{" "}
                {snapshot.data.view.community.moderationState === "VISIBLE"
                  ? "No topic visibility restriction"
                  : "Topic visibility is restricted by moderation"}
              </p>
              <Link
                prefetch={false}
                className="gc-button gc-button-quiet"
                href={topicHref(slug)}
              >
                Open public topic
              </Link>
              {after && (
                <a className="gc-button gc-button-quiet" href={path}>
                  First member page
                </a>
              )}
            </>
          )}
          <TopicManagement
            key={snapshot.revision}
            view={snapshot.data.view}
            members={snapshot.data.members}
            owner={originalOwner}
            concealed={concealed}
          />
          {!concealed && snapshot.data.history && (
            <section
              className="space-y-4"
              aria-label="Topic management history"
            >
              <h2 className="text-2xl">Management history</h2>
              <p>
                Topic changes and reasons are retained for accountable review.
                Private follow choices are excluded.
              </p>
              {auditAfter && (
                <a className="gc-button gc-button-quiet" href={path}>
                  Latest history
                </a>
              )}
              <ol className="space-y-3">
                {snapshot.data.history.entries.map((entry) => {
                  const at = new Date(entry.createdAt).toISOString();
                  return (
                    <li
                      key={entry.id}
                      className="rounded-xl border border-gc-divider p-4"
                    >
                      <p className="font-semibold">
                        {(
                          {
                            CREATED: "Topic created",
                            EDITED: "Details or rules updated",
                            LIFECYCLE: "Topic visibility changed",
                            ROLE_ACCEPTED: "Responsibility accepted",
                            "OFFER-ROLE": "Responsibility offered",
                            "CANCEL-ROLE": "Role offer cancelled",
                            "REVOKE-ROLE": "Moderator role revoked",
                            RESTRICT: "Participation restriction reviewed",
                            DISCUSSION_MODERATED:
                              "Discussion permissions changed"
                          } as Record<string, string>
                        )[entry.action] ?? "Topic management change"}
                      </p>
                      <p className="text-sm text-gc-muted">
                        <time dateTime={at}>
                          {at.replace("T", " ").slice(0, 16)} UTC
                        </time>
                      </p>
                      {entry.reason && (
                        <p>
                          {topicRestrictionReasons[
                            entry.reason as keyof typeof topicRestrictionReasons
                          ] ?? "A fixed moderation reason was recorded."}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ol>
              {snapshot.data.history.after && (
                <a
                  className="gc-button gc-button-quiet"
                  href={`${path}?${new URLSearchParams({ auditAfter: snapshot.data.history.after })}`}
                >
                  Older management history
                </a>
              )}
            </section>
          )}
        </div>
      )}
    </TopicFormWorkspace.Provider>
  );
}
