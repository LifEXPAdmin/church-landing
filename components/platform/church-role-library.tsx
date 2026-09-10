"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  rolePresets,
  roleRecommendationChoices,
  sensitiveRoleRecommendations,
  starterRoles,
  type ChurchRoleSummary,
  type RolePresetKey,
  type StarterRole
} from "@/lib/platform/church-role-library";
import {
  structureCapabilities,
  type StructureSnapshot
} from "@/lib/platform/church-structure-types";
import { portalButtonClass, portalInputClass } from "./portal-action-form";
import { portalLinkClass } from "./portal-ui";

type Draft = Omit<ChurchRoleSummary, "id" | "version"> & {
  id?: string;
  version?: number;
  requestKey: string;
};
export function ChurchRoleLibrary({
  snapshot
}: {
  snapshot: Pick<StructureSnapshot, "version" | "roleTemplates"> & {
    church: { id: string };
  };
}) {
  const [titles, setTitles] = useState(snapshot.roleTemplates ?? []);
  const [version, setVersion] = useState(snapshot.version);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const leaving = useRef(false);
  const [confirmation, setConfirmation] = useState<{
    message: string;
    label: string;
    run: () => void;
  } | null>(null);
  const confirmationRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (confirmation) confirmationRef.current?.focus();
  }, [confirmation]);
  const [feedback, setFeedback] = useState<{
    error: boolean;
    message: string;
  } | null>(null);
  const [latest, setLatest] = useState<StructureSnapshot | null>(null);
  const feedbackRef = useRef<HTMLParagraphElement>(null);
  const editorRef = useRef<HTMLHeadingElement>(null);
  const firstDraftId = useRef<string | null>(null);
  useEffect(() => {
    if (feedback) feedbackRef.current?.focus();
  }, [feedback]);
  useEffect(() => {
    if (draft && firstDraftId.current !== draft.requestKey) {
      firstDraftId.current = draft.requestKey;
      editorRef.current?.focus();
    }
    if (!draft) firstDraftId.current = null;
  }, [draft]);
  const hasDraft = Boolean(draft);
  useEffect(() => {
    if (!hasDraft) return;
    const warn = (event: BeforeUnloadEvent) => {
      if (!leaving.current) event.preventDefault();
    };
    const follow = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const anchor =
        event.target instanceof Element
          ? event.target.closest("a[href]")
          : null;
      if (anchor instanceof HTMLAnchorElement) {
        event.preventDefault();
        event.stopPropagation();
        const href = anchor.href;
        setConfirmation({
          message: "Leave this page and discard the unsaved title draft?",
          label: "Discard draft and leave",
          run: () => {
            leaving.current = true;
            window.location.assign(href);
          }
        });
      }
    };
    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", follow, true);
    return () => {
      window.removeEventListener("beforeunload", warn);
      document.removeEventListener("click", follow, true);
    };
  }, [hasDraft]);
  function open(source?: ChurchRoleSummary | StarterRole) {
    if (draft) {
      setConfirmation({
        message: "Replace the current unsaved draft with another title?",
        label: "Replace draft",
        run: () => begin(source)
      });
      return;
    }
    begin(source);
  }
  function begin(source?: ChurchRoleSummary | StarterRole) {
    const owned = source && "version" in source ? source : null;
    const starter = source && "family" in source ? source : null;
    const presetKey = source?.presetKey ?? "G";
    setDraft({
      ...(owned ? { id: owned.id, version: owned.version } : {}),
      name: source?.name ?? "",
      description: source?.description ?? "",
      responsibilities: source?.responsibilities ?? "",
      starterId: owned?.starterId ?? starter?.id ?? null,
      presetKey,
      presetVersion: owned?.presetVersion ?? rolePresets[presetKey].version,
      recommendations: [
        ...(owned?.recommendations ?? rolePresets[presetKey].recommendations)
      ],
      requestKey: crypto.randomUUID()
    });
    setLatest(null);
    setFeedback(null);
  }
  async function readCurrent() {
    const response = await fetch(
      `/api/platform/church-structure?churchId=${encodeURIComponent(snapshot.church.id)}&view=roles`,
      { cache: "no-store" }
    );
    if (!response.ok)
      throw new Error(
        "Your current church access could not be confirmed. The draft has been kept."
      );
    return (await response.json()) as StructureSnapshot;
  }
  async function save(
    operation: "template-create" | "template-edit" | "template-archive",
    values: Record<string, unknown>
  ) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setFeedback(null);
    setLatest(null);
    let confirmed = false;
    try {
      const response = await fetch("/api/platform/church-structure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          churchId: snapshot.church.id,
          expectedVersion: version,
          operation,
          ...values
        })
      });
      const result = await response.json().catch(() => null);
      const message =
        typeof result?.message === "string"
          ? result.message
          : "The title could not be saved. Your draft is kept.";
      if (!response.ok) {
        setFeedback({ error: true, message });
        if (response.status === 409) {
          const current = await readCurrent();
          if (draft) setLatest(current);
          else {
            setTitles(current.roleTemplates ?? []);
            setVersion(current.version);
          }
        }
        return;
      }
      if (typeof result?.id !== "string" || typeof result?.message !== "string")
        throw new Error("Unconfirmed response");
      confirmed = true;
      // Once confirmed saved, do not offer a stale create as an unsaved draft.
      setDraft(null);
      setFeedback({ error: false, message });
      const current = await readCurrent();
      setTitles(current.roleTemplates ?? []);
      setVersion(current.version);
    } catch (error) {
      setFeedback({
        error: true,
        message: confirmed
          ? "Your title change was saved, but the library could not refresh. Review the saved library before another change."
          : error instanceof Error && error.message.startsWith("Your current")
            ? error.message
            : "We could not confirm the result. Your draft and retry key are kept. Review the saved library before retrying."
      });
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const matchingTitles = titles.filter((role) =>
    `${role.name} ${role.description} ${role.responsibilities}`
      .toLocaleLowerCase()
      .includes(normalizedQuery)
  );
  const matchingStarters = starterRoles.filter((role) =>
    `${role.name} ${role.family} ${role.description}`
      .toLocaleLowerCase()
      .includes(normalizedQuery)
  );
  const update = (values: Partial<Draft>) =>
    setDraft((current) => (current ? { ...current, ...values } : current));
  return (
    <div className="space-y-6">
      <p className="max-w-3xl text-gc-muted">
        Choose from 82 starter titles or create a title for your church. A title
        can be used by several separate positions. Its recommendations are
        guidance for future review; saving a title never assigns a person or
        grants access.
      </p>
      {confirmation && (
        <section
          aria-label="Review title action"
          className="max-w-3xl space-y-3 rounded-xl border border-gc-action bg-gc-surface p-4"
        >
          <h2
            ref={confirmationRef}
            tabIndex={-1}
            className="font-semibold focus:outline-none focus:ring-2 focus:ring-gc-focus"
          >
            Review this action
          </h2>
          <p>{confirmation.message}</p>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={busy}
              className={portalButtonClass}
              onClick={() => {
                const action = confirmation;
                setConfirmation(null);
                action.run();
              }}
            >
              {confirmation.label}
            </button>
            <button
              type="button"
              disabled={busy}
              className={portalLinkClass}
              onClick={() => {
                setConfirmation(null);
                setFeedback({
                  error: false,
                  message:
                    "Action canceled. Your saved information and any open draft are unchanged."
                });
              }}
            >
              Keep current information
            </button>
          </div>
        </section>
      )}
      {feedback && (
        <p
          ref={feedbackRef}
          tabIndex={-1}
          role={feedback.error ? "alert" : "status"}
          className="rounded-xl border border-gc-divider p-4 focus:outline-none focus:ring-2 focus:ring-gc-focus"
        >
          {feedback.message}
        </p>
      )}
      {feedback?.error && (
        <button
          type="button"
          disabled={busy}
          className={portalButtonClass}
          onClick={async () => {
            if (inFlight.current) return;
            inFlight.current = true;
            setBusy(true);
            try {
              const current = await readCurrent();
              if (draft) setLatest(current);
              else {
                setTitles(current.roleTemplates ?? []);
                setVersion(current.version);
              }
              setFeedback({
                error: false,
                message: draft
                  ? "Saved library loaded for review below. Your draft is retained."
                  : "The current saved library is loaded."
              });
            } catch {
              setFeedback({
                error: true,
                message:
                  "The current library could not load. Please try again; no change was submitted."
              });
            } finally {
              inFlight.current = false;
              setBusy(false);
            }
          }}
        >
          Review saved library
        </button>
      )}
      {draft ? (
        <section className="max-w-3xl space-y-4 rounded-2xl border border-gc-divider bg-gc-surface p-4 sm:p-6">
          <h2
            ref={editorRef}
            tabIndex={-1}
            className="text-xl font-semibold focus:outline-none focus:ring-2 focus:ring-gc-focus"
          >
            {draft.id ? "Edit church title" : "Add church title"}
          </h2>
          <p className="text-sm text-gc-muted">
            Unsaved draft · Changes apply to future recommendations. Existing
            positions, assignments and permissions stay as saved.
          </p>
          <form
            className="space-y-4"
            aria-label="Save church title"
            aria-busy={busy}
            onSubmit={(event) => {
              event.preventDefault();
              void save(draft.id ? "template-edit" : "template-create", {
                ...draft,
                templateId: draft.id,
                templateVersion: draft.version
              });
            }}
          >
            <fieldset
              disabled={busy || Boolean(confirmation)}
              className="min-w-0 space-y-4"
            >
              <legend className="sr-only">
                Title details and recommendations
              </legend>
              <label className="block font-semibold" htmlFor="role-name">
                Title (required)
                <input
                  id="role-name"
                  required
                  maxLength={100}
                  className={portalInputClass}
                  value={draft.name}
                  onChange={(e) => update({ name: e.target.value })}
                />
              </label>
              <label className="block font-semibold" htmlFor="role-description">
                Description
                <textarea
                  id="role-description"
                  maxLength={500}
                  rows={2}
                  className={portalInputClass}
                  value={draft.description}
                  onChange={(e) => update({ description: e.target.value })}
                />
              </label>
              <label
                className="block font-semibold"
                htmlFor="role-responsibilities"
              >
                Responsibilities
                <textarea
                  id="role-responsibilities"
                  maxLength={3000}
                  rows={4}
                  className={portalInputClass}
                  value={draft.responsibilities}
                  onChange={(e) => update({ responsibilities: e.target.value })}
                />
              </label>
              <label className="block font-semibold" htmlFor="role-preset">
                Recommended preset
                <select
                  id="role-preset"
                  className={portalInputClass}
                  value={draft.presetKey}
                  onChange={(e) => {
                    const key = e.target.value as RolePresetKey;
                    setConfirmation({
                      message: `Replace this draft's recommendation choices with ${rolePresets[key].name}? No saved title or permission changes yet.`,
                      label: "Use these recommendations",
                      run: () => {
                        update({
                          presetKey: key,
                          presetVersion: rolePresets[key].version,
                          recommendations: [...rolePresets[key].recommendations]
                        });
                        setFeedback({
                          error: false,
                          message:
                            "Preset recommendations applied to the unsaved draft. Review and edit before saving."
                        });
                      }
                    });
                  }}
                >
                  {Object.entries(rolePresets).map(([key, preset]) => (
                    <option key={key} value={key}>
                      {key} — {preset.name}
                    </option>
                  ))}
                </select>
              </label>
              <fieldset className="min-w-0 space-y-2 rounded-xl border border-gc-divider p-3">
                <legend className="px-1 font-semibold">
                  Edit recommended privileges
                </legend>
                <p className="text-sm text-gc-muted">
                  {[...draft.recommendations].sort().join() ===
                  [...rolePresets[draft.presetKey].recommendations]
                    .sort()
                    .join()
                    ? "Recommended preset"
                    : "Customized recommendations"}{" "}
                  · version {draft.presetVersion}. These checkboxes change
                  guidance only. A manager must separately review and authorize
                  any real access.
                </p>
                {roleRecommendationChoices.map((capability) => (
                  <label
                    key={capability}
                    className="flex min-h-11 items-start gap-3 py-2"
                  >
                    <input
                      className="mt-1 h-5 w-5 shrink-0"
                      type="checkbox"
                      checked={draft.recommendations.includes(capability)}
                      onChange={(e) =>
                        update({
                          recommendations: e.target.checked
                            ? [...draft.recommendations, capability]
                            : draft.recommendations.filter(
                                (c) => c !== capability
                              )
                        })
                      }
                    />
                    <span>
                      {structureCapabilities[capability]}
                      {sensitiveRoleRecommendations.includes(capability) && (
                        <span className="block text-sm text-gc-muted">
                          Sensitive management · off in every starter preset
                        </span>
                      )}
                    </span>
                  </label>
                ))}
                {rolePresets[draft.presetKey].unavailable.map((reason) => (
                  <p key={reason} className="text-sm text-gc-muted">
                    Unavailable here: {reason}
                  </p>
                ))}
                <p className="text-sm text-gc-muted">
                  Titles do not unlock finance, private care or child-account
                  tools, override contact sharing, verify a representative or
                  transfer ownership.
                </p>
              </fieldset>
              <div className="flex flex-wrap gap-3">
                <button type="submit" className={portalButtonClass}>
                  {busy ? "Saving…" : "Save title and recommendations"}
                </button>
                <button
                  type="button"
                  className={portalLinkClass}
                  onClick={() => {
                    setConfirmation({
                      message: "Discard the unsaved title draft?",
                      label: "Discard draft",
                      run: () => {
                        setDraft(null);
                        setLatest(null);
                        setFeedback({
                          error: false,
                          message:
                            "Draft discarded. Saved titles are unchanged."
                        });
                      }
                    });
                  }}
                >
                  Cancel
                </button>
              </div>
            </fieldset>
          </form>
          {latest && (
            <div className="space-y-3 rounded-xl border border-gc-divider p-3">
              <h3 className="font-semibold">
                Review the current saved library
              </h3>
              <p className="text-sm text-gc-muted">
                Your draft is above. A conflicting name must be changed before
                saving.
              </p>
              {draft.id &&
                (() => {
                  const saved = latest.roleTemplates?.find(
                    (role) => role.id === draft.id
                  );
                  return saved ? (
                    <div className="space-y-2">
                      <p>
                        Saved title: {saved.name} · version {saved.version}
                      </p>
                      <p className="whitespace-pre-wrap">{saved.description}</p>
                      <p className="whitespace-pre-wrap">
                        {saved.responsibilities}
                      </p>
                      <p>
                        Recommendations:{" "}
                        {saved.recommendations
                          .map((c) => structureCapabilities[c])
                          .join(", ") || "No additional permissions"}
                      </p>
                    </div>
                  ) : (
                    <p>
                      This title is no longer active. Cancel this draft and
                      review the library.
                    </p>
                  );
                })()}
              <button
                type="button"
                disabled={
                  busy ||
                  Boolean(
                    draft.id &&
                    !latest.roleTemplates?.some((role) => role.id === draft.id)
                  )
                }
                className={portalButtonClass}
                onClick={() => {
                  const saved = latest.roleTemplates?.find(
                    (role) => role.id === draft.id
                  );
                  setTitles(latest.roleTemplates ?? []);
                  setVersion(latest.version);
                  if (saved) update({ version: saved.version });
                  setLatest(null);
                  setFeedback({
                    error: false,
                    message:
                      "Current saved version reviewed. Your draft is retained; save only when its changes are ready."
                  });
                }}
              >
                Keep draft using the reviewed version
              </button>
            </div>
          )}
        </section>
      ) : (
        <button
          type="button"
          className={portalButtonClass}
          disabled={busy}
          onClick={() => open()}
        >
          Create a custom title
        </button>
      )}
      <div className="max-w-xl">
        <label htmlFor="role-search" className="font-semibold">
          Search role titles
          <input
            id="role-search"
            type="search"
            className={portalInputClass}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            maxLength={100}
          />
        </label>
      </div>
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Your church titles</h2>
        <p className="text-sm text-gc-muted" role="status">
          {matchingTitles.length} of {titles.length} church titles
        </p>
        {!matchingTitles.length && (
          <p>
            No church titles match. Choose a starter below or create your own.
          </p>
        )}
        <ul className="grid gap-3 md:grid-cols-2">
          {matchingTitles.map((role) => (
            <li
              key={role.id}
              className="min-w-0 space-y-2 rounded-xl border border-gc-divider bg-gc-surface p-4"
            >
              <h3 className="font-semibold">{role.name}</h3>
              <p className="whitespace-pre-wrap text-sm text-gc-muted">
                {role.description}
              </p>
              <p className="text-sm text-gc-muted">
                {role.presetKey} — {rolePresets[role.presetKey].name} · title
                version {role.version}
              </p>
              <div className="flex flex-wrap gap-x-4">
                <button
                  type="button"
                  className={portalLinkClass}
                  disabled={busy}
                  onClick={() => open(role)}
                >
                  Edit {role.name}
                </button>
                <button
                  type="button"
                  className={portalLinkClass}
                  disabled={busy || Boolean(draft)}
                  onClick={() => {
                    setConfirmation({
                      message: `Archive ${role.name}? Existing positions, responsibilities, assignments and permissions will remain unchanged.`,
                      label: "Archive title",
                      run: () => {
                        void save("template-archive", {
                          templateId: role.id,
                          templateVersion: role.version,
                          confirmed: true
                        });
                      }
                    });
                  }}
                >
                  Archive {role.name}
                </button>
              </div>
            </li>
          ))}
        </ul>
        <Link
          href={`/platform/churches/${encodeURIComponent(snapshot.church.id)}/structure/new`}
          className={portalLinkClass}
        >
          Create a position using a church title
        </Link>
      </section>
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Starter library</h2>
        <p className="text-sm text-gc-muted" role="status">
          {matchingStarters.length} of 82 starter titles
        </p>
        <p className="text-sm text-gc-muted">
          Choosing a starter opens an editable draft for this church. It does
          not create a position or select a supervisor.
        </p>
        {!matchingStarters.length && <p>No starter titles match.</p>}
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {matchingStarters.map((role) => (
            <li
              key={role.id}
              className="min-w-0 space-y-2 rounded-xl border border-gc-divider bg-gc-surface p-4"
            >
              <h3 className="font-semibold">{role.name}</h3>
              <p className="text-sm text-gc-muted">{role.family}</p>
              <p className="text-sm text-gc-muted">
                {role.presetKey} — {rolePresets[role.presetKey].name}
              </p>
              <button
                type="button"
                className={portalLinkClass}
                disabled={busy}
                onClick={() => open(role)}
              >
                Use {role.name}
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
