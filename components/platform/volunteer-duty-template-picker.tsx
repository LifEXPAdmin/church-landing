"use client";
import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { socialRequest, SocialClientError } from "@/lib/platform/social-client";
import { useReadVisibility } from "./read-visibility";
import { portalInputClass } from "./portal-action-form";

export const dutyTemplateEndpoint = "/api/platform/volunteer-duty-templates";
export type DutyTemplateFields = {
  title: string;
  duties: string;
  requirements: string;
  commitment: string;
};
export type DutyTemplateList = {
  ownerId: string;
  churchId: string;
  page: number;
  total: number;
  templates: {
    id: string;
    version: number;
    title: string;
    updatedAt: string;
  }[];
};

// Private data disappears while the mounted owner keeps unsent drafts elsewhere.
export function useDutyTemplateRead<T extends { ownerId: string }>(
  url: string | null,
  owner: string | null,
  enabled = true
) {
  const parentVisible = useReadVisibility();
  const [snapshot, setSnapshot] = useState<{
    url: string;
    owner: string;
    data: T;
  } | null>(null);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);
  const epoch = useRef(0),
    access = useRef(false);
  const conceal = useCallback(() => {
    epoch.current++;
    access.current = false;
    setSnapshot(null);
  }, []);
  const reload = useCallback(() => {
    conceal();
    setTick((value) => value + 1);
  }, [conceal]);
  useEffect(() => {
    let live = true,
      focused = document.hasFocus(),
      connected = navigator.onLine;
    const active = () =>
      live &&
      enabled &&
      !!url &&
      !!owner &&
      parentVisible &&
      focused &&
      document.hasFocus() &&
      connected &&
      document.visibilityState !== "hidden";
    const read = async () => {
      if (!active() || !url || !owner) return;
      const generation = ++epoch.current;
      try {
        const result = await socialRequest<T>(url, undefined, owner);
        if (result.data.ownerId !== owner)
          throw new Error(
            "Your sign-in changed. Return to the original account before continuing."
          );
        if (generation !== epoch.current || !active()) return;
        access.current = true;
        setSnapshot({ url, owner, data: result.data });
        setError("");
      } catch (cause) {
        if (generation !== epoch.current || !active()) return;
        conceal();
        setError(
          cause instanceof Error
            ? cause.message
            : "Template access could not be confirmed."
        );
      }
    };
    const hide = () => {
      focused = false;
      conceal();
    };
    const focus = () => {
      focused = true;
      conceal();
      void read();
    };
    const offline = () => {
      connected = false;
      conceal();
    };
    const online = () => {
      connected = true;
      conceal();
      void read();
    };
    const visibility = () =>
      document.visibilityState === "hidden" ? hide() : focus();
    const changed = () => {
      conceal();
      void read();
    };
    conceal();
    void read();
    const timer = setInterval(() => void read(), 30000);
    window.addEventListener("blur", hide);
    window.addEventListener("focus", focus);
    window.addEventListener("pagehide", hide);
    window.addEventListener("pageshow", focus);
    window.addEventListener("offline", offline);
    window.addEventListener("online", online);
    window.addEventListener("social-relationships-changed", changed);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      live = false;
      conceal();
      clearInterval(timer);
      window.removeEventListener("blur", hide);
      window.removeEventListener("focus", focus);
      window.removeEventListener("pagehide", hide);
      window.removeEventListener("pageshow", focus);
      window.removeEventListener("offline", offline);
      window.removeEventListener("online", online);
      window.removeEventListener("social-relationships-changed", changed);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [url, owner, enabled, parentVisible, tick, conceal]);
  return {
    data:
      enabled &&
      parentVisible &&
      snapshot?.url === url &&
      snapshot.owner === owner
        ? snapshot.data
        : null,
    error,
    reload,
    conceal,
    epoch,
    access
  };
}

export function VolunteerDutyTemplatePicker({
  owner,
  churchId,
  postId,
  postVersion,
  draftFingerprint,
  blocked,
  onApply
}: {
  owner: string;
  churchId: string;
  postId: string;
  postVersion: number;
  draftFingerprint: string;
  blocked: boolean;
  onApply: (fields: DutyTemplateFields) => void;
}) {
  const originalOwner = useRef(owner),
    parentVisible = useReadVisibility();
  const [page, setPage] = useState(0),
    [selectedId, setSelectedId] = useState("");
  const [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const flight = useRef(false),
    resultRef = useRef<HTMLParagraphElement>(null);
  const id = useId();
  const scope = JSON.stringify([owner, churchId, postId, postVersion]);
  const read = useDutyTemplateRead<DutyTemplateList>(
    `${dutyTemplateEndpoint}?${new URLSearchParams({ view: "list", churchId, page: String(page) })}`,
    originalOwner.current,
    owner === originalOwner.current
  );
  const latest = useRef({
    scope,
    draftFingerprint,
    blocked,
    parentVisible,
    onApply
  });
  latest.current = { scope, draftFingerprint, blocked, parentVisible, onApply };
  const current =
    read.data?.churchId === churchId && read.data.page === page
      ? read.data
      : null;
  const selected = current?.templates.find(
    (template) => template.id === selectedId
  );
  const apply = async () => {
    if (
      flight.current ||
      blocked ||
      !selected ||
      !current ||
      !read.access.current
    )
      return;
    flight.current = true;
    setBusy(true);
    setNotice("");
    const generation = read.epoch.current,
      originalScope = scope,
      originalDraft = draftFingerprint;
    const stillCurrent = () =>
      generation === read.epoch.current &&
      read.access.current &&
      latest.current.parentVisible &&
      latest.current.scope === originalScope &&
      document.hasFocus() &&
      document.visibilityState !== "hidden" &&
      navigator.onLine;
    try {
      const { data } = await socialRequest<{
        ownerId: string;
        postId: string;
        postVersion: number;
        template: DutyTemplateFields & { id: string; version: number };
      }>(
        `${dutyTemplateEndpoint}?${new URLSearchParams({ view: "apply", id: selected.id, postId, expectedVersion: String(selected.version), postVersion: String(postVersion) })}`,
        undefined,
        originalOwner.current
      );
      if (!stillCurrent()) return;
      if (
        latest.current.blocked ||
        latest.current.draftFingerprint !== originalDraft
      ) {
        setNotice(
          "Your opportunity changed while the template loaded. Review your edits and choose the template again."
        );
        resultRef.current?.focus();
        return;
      }
      if (
        data.ownerId !== originalOwner.current ||
        data.postId !== postId ||
        data.postVersion !== postVersion ||
        data.template.id !== selected.id ||
        data.template.version !== selected.version
      )
        throw new Error(
          "The source or template changed. Check current templates before applying one."
        );
      const { title, duties, requirements, commitment } = data.template;
      latest.current.onApply({ title, duties, requirements, commitment });
      setNotice(
        "Template copied into this unsaved opportunity. Review all details before saving."
      );
      resultRef.current?.focus();
    } catch (cause) {
      if (!stillCurrent()) return;
      setNotice(
        cause instanceof Error
          ? cause.message
          : "The template could not be applied. Your draft is unchanged."
      );
      if (
        cause instanceof SocialClientError &&
        [401, 403, 404].includes(cause.status)
      )
        read.conceal();
      else if (cause instanceof SocialClientError && cause.status === 409)
        read.reload();
      else resultRef.current?.focus();
    } finally {
      flight.current = false;
      setBusy(false);
    }
  };
  return (
    <section
      aria-label="Use a duty template"
      className="space-y-3 rounded-xl border p-4"
    >
      <h2 className="text-xl font-semibold">Use a duty template</h2>
      {!current ? (
        <>
          <p role="status">
            {read.error ||
              "Checking current duty template access. Your opportunity entries are retained."}
          </p>
          <button
            type="button"
            className="gc-button gc-button-quiet"
            onClick={read.reload}
          >
            Check template access
          </button>
        </>
      ) : (
        <>
          <p id={`${id}-help`}>
            Using a template replaces the title, duties, requirements and
            commitment in this unsaved form. Review those fields before saving.
            Contact, places and scheduling choices stay as entered.
          </p>
          <label className="block space-y-2" htmlFor={id}>
            <span>Duty template</span>
            <select
              id={id}
              className={portalInputClass}
              value={selectedId}
              disabled={blocked || busy}
              aria-describedby={`${id}-help`}
              onChange={(event) => {
                setSelectedId(event.target.value);
                setNotice("");
              }}
            >
              <option value="">Choose a template</option>
              {current.templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.title}
                </option>
              ))}
            </select>
          </label>
          {!current.total && (
            <p>No duty templates have been saved for this church.</p>
          )}
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className="gc-button gc-button-quiet"
              disabled={blocked || busy || !selected}
              onClick={() => void apply()}
            >
              {busy ? "Checking template…" : "Use template in draft"}
            </button>
            {page > 0 && (
              <button
                type="button"
                className="gc-button gc-button-quiet"
                disabled={busy || blocked}
                onClick={() => {
                  setPage(page - 1);
                  setSelectedId("");
                }}
              >
                Previous templates
              </button>
            )}
            {(page + 1) * 20 < current.total && (
              <button
                type="button"
                className="gc-button gc-button-quiet"
                disabled={busy || blocked}
                onClick={() => {
                  setPage(page + 1);
                  setSelectedId("");
                }}
              >
                Next templates
              </button>
            )}
            <Link
              prefetch={false}
              className="min-h-11 py-2 underline"
              href="/platform/serve/templates"
            >
              Manage duty templates
            </Link>
          </div>
          <p ref={resultRef} tabIndex={-1} role="status">
            {notice}
          </p>
        </>
      )}
    </section>
  );
}
