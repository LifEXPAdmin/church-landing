"use client";
import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { mediaTopicSuggestions } from "@/lib/platform/media-topic-options";
import {
  MediaNavigation,
  MediaReadNotice,
  useMediaRead
} from "./media-catalog-library";
import {
  MEDIA_EXTERNAL_NOTICE,
  MEDIA_POLICY,
  mediaFormatNames,
  mediaAudienceNames
} from "@/lib/platform/media-catalog-options";
import { catalogSource } from "@/lib/platform/media-catalog-sources";
import { socialRequest, SocialClientError } from "@/lib/platform/social-client";
import { useUnsavedSocialWork } from "./use-unsaved-social-work";
import type { MediaFields } from "@/lib/platform/media-catalog-input";
import {
  normalizeScripture,
  scriptureLabel
} from "@/lib/platform/media-scripture";
import {
  SCRIPTURE_REGISTRY_VERSION,
  scriptureSystems,
  scriptureBooks
} from "@/lib/platform/scripture-registry";
type ScriptureDraft = {
  systemId: string;
  text: string;
  originals?: string[];
  referenceVersion?: string;
};
const empty: MediaFields = {
  title: "",
  description: "",
  format: null,
  presentation: null,
  audience: null,
  durationSeconds: null,
  languageIds: [],
  speakers: [],
  churchCredit: "",
  series: "",
  sequence: null,
  topics: [],
  scriptureRanges: [],
  recordedOn: null,
  details: null,
  sourceUrl: null,
  attribution: ""
};
type Item = MediaFields & {
  id: string;
  version: number;
  state: string;
  ownerChurchId: string | null;
  sourceState: string;
  moderationState: string;
  recoveryRequired: boolean;
  canPublish: boolean;
};
type View = {
  actorId: string;
  churches: { id: string; name: string }[];
  item?: Item;
};
const fieldClass =
  "mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-slate-900";
export function MediaEditor({
  owner,
  id
}: {
  owner: string | null;
  id?: string;
}) {
  const [activeId, setActiveId] = useState(id),
    [f, setFields] = useState<MediaFields>(empty),
    [scriptureDrafts, setScriptureDrafts] = useState<ScriptureDraft[]>([]),
    [church, setChurch] = useState<string | null>(null),
    [version, setVersion] = useState(0),
    [state, setState] = useState("DRAFT"),
    [loaded, setLoaded] = useState(false),
    [dirty, setDirty] = useState(false),
    [ack, setAck] = useState(false),
    [rightsReviewed, setRightsReviewed] = useState(false),
    [basis, setBasis] = useState("OWN"),
    [evidence, setEvidence] = useState(""),
    [license, setLicense] = useState(""),
    [consent, setConsent] = useState(""),
    [expiry, setExpiry] = useState(""),
    [busy, setBusy] = useState(false),
    [retry, setRetry] = useState<string | null>(null),
    [message, setMessage] = useState(""),
    [removed, setRemoved] = useState(false);
  const feedbackId = useId(),
    resultRef = useRef<HTMLParagraphElement>(null),
    sourceRef = useRef<HTMLInputElement>(null),
    focusEpoch = useRef(0),
    resultFocus = useRef<{ target: "source" | "status"; epoch: number } | null>(
      null
    );
  const [focusRequest, setFocusRequest] = useState(0);
  const originalOwner = useRef(owner);
  const locked = useRef(false),
    { data, error, reload } = useMediaRead<View>(
      `/api/platform/media-catalog?view=${activeId ? "editor&id=" + encodeURIComponent(activeId) : "studio"}`,
      originalOwner.current
    );
  const conflict = !!(data?.item && loaded && data.item.version !== version),
    concealed = owner !== originalOwner.current || !data || !loaded || removed;
  // Only a deliberate action requests focus. Background reads never do.
  useEffect(() => {
    const cancel = () => {
      focusEpoch.current++;
      resultFocus.current = null;
    };
    const visibility = () => {
      if (document.visibilityState === "hidden") cancel();
    };
    cancel();
    for (const event of ["blur", "offline", "pagehide"])
      window.addEventListener(event, cancel);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      cancel();
      for (const event of ["blur", "offline", "pagehide"])
        window.removeEventListener(event, cancel);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [owner]);
  function requestResultFocus(target: "source" | "status", epoch: number) {
    if (epoch !== focusEpoch.current) return;
    resultFocus.current = { target, epoch };
    setFocusRequest((value) => value + 1);
  }
  useEffect(() => {
    const request = resultFocus.current;
    if (!request) return;
    if (
      request.epoch !== focusEpoch.current ||
      owner !== originalOwner.current ||
      !document.hasFocus() ||
      document.visibilityState !== "visible" ||
      !navigator.onLine
    ) {
      resultFocus.current = null;
      return;
    }
    // An own save conceals and remounts the editor until its fresh read settles.
    if (busy || (concealed && !removed) || data?.actorId !== owner) return;
    const target =
      request.target === "source" ? sourceRef.current : resultRef.current;
    if (!target) return;
    resultFocus.current = null;
    target.focus();
  }, [focusRequest, busy, concealed, removed, data, owner]);
  function load(item?: Item) {
    setScriptureDrafts(
      (item?.scriptureRanges ?? []).map((r) => ({
        systemId: r.referenceSystemId,
        text: r.originals.join(";"),
        originals: r.originals,
        referenceVersion: r.referenceVersion
      }))
    );
    if (item) {
      setFields(
        Object.fromEntries(
          Object.keys(empty).map((k) => [k, item[k as keyof MediaFields]])
        ) as MediaFields
      );
      setVersion(item.version);
      setChurch(item.ownerChurchId);
      setState(item.state);
    } else {
      setFields(empty);
      setVersion(0);
      setChurch(null);
      setState("DRAFT");
    }
    setLoaded(true);
    setDirty(false);
    setAck(false);
    setRightsReviewed(false);
    setEvidence("");
    setLicense("");
    setConsent("");
    setExpiry("");
  }
  useEffect(() => {
    if (data && !loaded) load(data.item);
  }, [data, loaded]);
  useUnsavedSocialWork(
    { dirty, saving: busy || !!retry, conflict },
    () =>
      setMessage("Save or discard your unsent media changes before leaving."),
    true
  );
  const change = (patch: Partial<MediaFields>) => {
    setFields((current) => ({ ...current, ...patch }));
    setDirty(true);
    setAck(false);
    setRightsReviewed(false);
  };
  const changeScripture = (next: ScriptureDraft[]) => {
    setScriptureDrafts(next);
    change({});
  };
  let scriptureRanges: MediaFields["scriptureRanges"] = [],
    scriptureProblem = "";
  try {
    scriptureRanges = normalizeScripture(
      scriptureDrafts
        .filter((r) => r.text.trim() || r.systemId)
        .map((r) => ({
          referenceSystemId: r.systemId,
          referenceVersion: r.referenceVersion ?? SCRIPTURE_REGISTRY_VERSION,
          originals: r.originals ?? [r.text]
        }))
    );
  } catch (e) {
    scriptureProblem =
      e instanceof Error ? e.message : "Check the Scripture references.";
  }
  let source: ReturnType<typeof catalogSource> = null,
    sourceProblem = "";
  try {
    source = catalogSource(f.sourceUrl);
  } catch {
    sourceProblem =
      "Public source URL: use a canonical public item link without extra options or private tokens.";
  }
  const act = async (operation: string, original?: string) => {
    if (locked.current || !owner || owner !== originalOwner.current) return;
    const actionFocusEpoch = focusEpoch.current;
    resultFocus.current = null;
    let body = original;
    if (!body) {
      if (conflict) {
        setMessage(
          "This item changed. Keep your edits until you choose to reload."
        );
        requestResultFocus("status", actionFocusEpoch);
        return;
      }
      if (["save", "publish"].includes(operation) && sourceProblem) {
        setMessage(sourceProblem);
        requestResultFocus("source", actionFocusEpoch);
        return;
      }
      if (["save", "publish"].includes(operation) && scriptureProblem) {
        setMessage(scriptureProblem);
        requestResultFocus("status", actionFocusEpoch);
        return;
      }
      if (["save", "publish"].includes(operation) && source && !ack) {
        setMessage(
          "Acknowledge the displayed source and audience before saving."
        );
        requestResultFocus("status", actionFocusEpoch);
        return;
      }
      const payload: Record<string, unknown> = {
        operation: operation === "save" && !activeId ? "create" : operation,
        mutationId: crypto.randomUUID(),
        ...(activeId
          ? { itemId: activeId, expectedVersion: version }
          : { ownerChurchId: church })
      };
      if (["save", "publish"].includes(operation))
        Object.assign(payload, {
          fields: {
            ...f,
            scriptureRanges,
            languageIds: f.languageIds.filter((x) => x.trim()),
            speakers: f.speakers.filter((x) => x.trim()),
            topics: f.topics.filter((x) => x.trim()),
            sourceUrl: source?.url ?? null
          },
          acknowledgment: source
            ? {
                policy: MEDIA_POLICY,
                sourceUrl: source.url,
                audience: f.audience,
                accepted: ack
              }
            : null,
          ...(rightsReviewed
            ? {
                rights: {
                  basis,
                  evidenceReference: evidence,
                  license,
                  consentReference: consent,
                  expiresAt: expiry
                    ? new Date(expiry + "T23:59:59Z").toISOString()
                    : "",
                  reviewed: true,
                  publicRecording: true,
                  textRights: true
                }
              }
            : {})
        });
      body = JSON.stringify(payload);
    }
    locked.current = true;
    setBusy(true);
    setRetry(body);
    setMessage("");
    try {
      const { data: result } = await socialRequest<{
        id: string;
        version: number;
        message: string;
      }>("/api/platform/media-catalog", body, owner);
      if (!result.id || !Number.isInteger(result.version))
        throw Error(
          "The response could not be confirmed. Retry the original request."
        );
      setRetry(null);
      setDirty(false);
      setVersion(result.version);
      setActiveId(result.id);
      setMessage(result.message);
      requestResultFocus("status", actionFocusEpoch);
      setAck(false);
      setRightsReviewed(false);
      if (JSON.parse(body).operation === "remove") {
        setRemoved(true);
      } else {
        setLoaded(false);
        reload();
      }
    } catch (e) {
      setMessage(
        e instanceof Error
          ? e.message
          : "The result is uncertain. Retry the original request."
      );
      requestResultFocus("status", actionFocusEpoch);
      if (e instanceof SocialClientError && [401, 403].includes(e.status))
        reload();
      if (
        e instanceof SocialClientError &&
        [400, 409, 429].includes(e.status)
      ) {
        setRetry(null);
        if (e.status === 409) reload();
      }
    } finally {
      locked.current = false;
      setBusy(false);
    }
  };
  return (
    <section className="space-y-5">
      <MediaNavigation />
      <h1 className="text-3xl font-semibold">
        {activeId ? "Edit media" : "Create media draft"}
      </h1>
      <p>
        Your draft stays private. Publishing requires a selected audience and a
        current rights review.
      </p>
      {!owner ? (
        <p>
          <Link
            className="underline"
            href="/platform/login?next=%2Fplatform%2Fmedia%2Fstudio"
          >
            Sign in
          </Link>{" "}
          with a verified adult account to manage media.
        </p>
      ) : null}
      {concealed && !removed && (
        <MediaReadNotice error={error} reload={reload} />
      )}
      {(!concealed || removed) && (
        <p
          ref={resultRef}
          role="status"
          tabIndex={-1}
          className="whitespace-pre-wrap focus:outline-none focus:ring-2 focus:ring-gc-focus"
        >
          {message}
        </p>
      )}
      {retry && (
        <button
          className="gc-button"
          disabled={busy}
          onClick={() => void act("", retry)}
        >
          Retry original request
        </button>
      )}
      {removed ? (
        <p>
          Removed.{" "}
          <Link href="/platform/media/studio" className="underline">
            Return to publishing studio
          </Link>
        </p>
      ) : !concealed ? (
        <div>
          {conflict && (
            <p role="alert" className="rounded-xl border p-4">
              The saved item changed. Your unsent entries are preserved. Discard
              them to load the latest version before saving.
            </p>
          )}
          <form
            aria-label="Media editor"
            className="space-y-5"
            onSubmit={(e) => {
              e.preventDefault();
              void act("save");
            }}
          >
            <fieldset disabled={busy || !!retry} className="min-w-0 space-y-4">
              {!activeId ? (
                <label className="block">
                  Publish as
                  <select
                    className={fieldClass}
                    value={church ?? ""}
                    onChange={(e) => {
                      setChurch(e.target.value || null);
                      change({ audience: null });
                    }}
                  >
                    <option value="">My personal account</option>
                    {data?.churches.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <p>
                  Ownership:{" "}
                  {church
                    ? (data?.churches.find((c) => c.id === church)?.name ??
                      "Church")
                    : "Personal account"}
                  . State: {state.toLowerCase()}.
                </p>
              )}
              <label className="block">
                Title
                <input
                  className={fieldClass}
                  value={f.title}
                  maxLength={160}
                  onChange={(e) => change({ title: e.target.value })}
                />
              </label>
              <label className="block">
                Description
                <textarea
                  className={fieldClass}
                  rows={5}
                  aria-label="Description"
                  value={f.description}
                  maxLength={5000}
                  onChange={(e) => change({ description: e.target.value })}
                />
              </label>
              <section
                aria-label="Scripture tags"
                aria-describedby={
                  scriptureProblem ? `${feedbackId}-scripture-error` : undefined
                }
                className="space-y-3 rounded-lg border p-4"
              >
                <h2 className="text-lg font-semibold">Scripture passages</h2>
                <p>
                  Optional publisher-supplied tags. Choose the numbering used by
                  the recording. Systems are searched separately; no translation
                  or reading history is collected.
                </p>
                <p>
                  Use full book names, such as John 3:16-18 or 1 John 3.
                  Separate passages with semicolons.
                </p>
                {scriptureDrafts.map((r, index) => (
                  <div key={index} className="space-y-2 rounded-lg border p-3">
                    <label className="block">
                      Reference system {index + 1}
                      <select
                        className={fieldClass}
                        value={r.systemId}
                        onChange={(e) =>
                          changeScripture(
                            scriptureDrafts.map((v, i) =>
                              i === index
                                ? {
                                    ...v,
                                    systemId: e.target.value,
                                    referenceVersion: SCRIPTURE_REGISTRY_VERSION
                                  }
                                : v
                            )
                          )
                        }
                      >
                        <option value="">Choose explicitly</option>
                        {scriptureSystems.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      Passage text {index + 1}
                      <textarea
                        className={fieldClass}
                        value={r.text}
                        maxLength={4000}
                        rows={2}
                        onChange={(e) =>
                          changeScripture(
                            scriptureDrafts.map((v, i) =>
                              i === index
                                ? {
                                    ...v,
                                    text: e.target.value,
                                    originals: undefined,
                                    referenceVersion: SCRIPTURE_REGISTRY_VERSION
                                  }
                                : v
                            )
                          )
                        }
                      />
                    </label>
                    {r.systemId && (
                      <details>
                        <summary>Supported book names and IDs</summary>
                        <p className="mt-2">
                          {scriptureBooks(r.systemId)
                            .map((b) => `${b.name} (${b.id})`)
                            .join(", ")}
                        </p>
                      </details>
                    )}
                    <button
                      type="button"
                      className="gc-button gc-button-quiet"
                      onClick={() =>
                        changeScripture(
                          scriptureDrafts.filter((_, i) => i !== index)
                        )
                      }
                    >
                      Remove passage entry {index + 1}
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="gc-button gc-button-quiet"
                  disabled={scriptureDrafts.length >= 20}
                  onClick={() =>
                    changeScripture([
                      ...scriptureDrafts,
                      { systemId: "", text: "" }
                    ])
                  }
                >
                  Add Scripture passage
                </button>
                {scriptureProblem ? (
                  <p id={`${feedbackId}-scripture-error`} role="alert">
                    {scriptureProblem}
                  </p>
                ) : (
                  scriptureRanges.length > 0 && (
                    <div aria-label="Normalized Scripture tags">
                      <p>Searchable passages:</p>
                      <ul className="list-disc pl-5">
                        {scriptureRanges.map((r, i) => (
                          <li key={i}>{scriptureLabel(r)}</li>
                        ))}
                      </ul>
                    </div>
                  )
                )}
              </section>
              <div className="grid gap-4 sm:grid-cols-2">
                <label>
                  Format
                  <select
                    className={fieldClass}
                    aria-label="Format"
                    value={f.format ?? ""}
                    onChange={(e) => {
                      setMessage(
                        f.format
                          ? "Changing format replaces its previous details. Review the new fields before saving."
                          : ""
                      );
                      change({
                        format:
                          (e.target.value as MediaFields["format"]) || null,
                        details: e.target.value ? {} : null
                      });
                    }}
                  >
                    <option value="">Not selected</option>
                    {Object.entries(mediaFormatNames).map(([v, label]) => (
                      <option key={v} value={v}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Audio or video
                  <select
                    className={fieldClass}
                    aria-label="Audio or video"
                    value={f.presentation ?? ""}
                    onChange={(e) =>
                      change({
                        presentation:
                          (e.target.value as MediaFields["presentation"]) ||
                          null
                      })
                    }
                  >
                    <option value="">Not selected</option>
                    <option value="AUDIO">Audio</option>
                    <option value="VIDEO">Video</option>
                  </select>
                </label>
              </div>
              {f.format === "PODCAST" && (
                <div className="grid gap-3 sm:grid-cols-3">
                  {["season", "episode"].map((k) => (
                    <label key={k}>
                      {k === "season" ? "Season" : "Episode"}
                      <input
                        className={fieldClass}
                        type="number"
                        min={1}
                        max={100000}
                        value={f.details?.[k] ?? ""}
                        onChange={(e) =>
                          change({
                            details: {
                              ...f.details,
                              [k]: e.target.value
                                ? Number(e.target.value)
                                : null
                            }
                          })
                        }
                      />
                    </label>
                  ))}
                  <label>
                    Episode kind
                    <select
                      className={fieldClass}
                      value={f.details?.episodeKind ?? ""}
                      onChange={(e) =>
                        change({
                          details: {
                            ...f.details,
                            episodeKind: e.target.value || null
                          }
                        })
                      }
                    >
                      <option value="">Not selected</option>
                      <option value="FULL">Full episode</option>
                      <option value="TRAILER">Trailer</option>
                      <option value="BONUS">Bonus</option>
                    </select>
                  </label>
                </div>
              )}
              {f.format === "TESTIMONY" && (
                <label className="block">
                  Testimony subject
                  <select
                    className={fieldClass}
                    value={f.details?.subject ?? ""}
                    onChange={(e) =>
                      change({ details: { subject: e.target.value || null } })
                    }
                  >
                    <option value="">Not selected</option>
                    <option value="SELF">My own testimony</option>
                    <option value="CONSENTED_OTHER">
                      Another person with explicit consent
                    </option>
                  </select>
                </label>
              )}
              {f.format === "SERMON" && (
                <label className="block">
                  Preached on
                  <input
                    type="date"
                    className={fieldClass}
                    value={f.details?.preachedOn ?? ""}
                    onChange={(e) =>
                      change({
                        details: { preachedOn: e.target.value || null }
                      })
                    }
                  />
                </label>
              )}
              {f.format === "TEACHING" && (
                <label className="block">
                  Lesson number
                  <input
                    type="number"
                    min={1}
                    max={100000}
                    className={fieldClass}
                    value={f.details?.lessonNumber ?? ""}
                    onChange={(e) =>
                      change({
                        details: {
                          lessonNumber: e.target.value
                            ? Number(e.target.value)
                            : null
                        }
                      })
                    }
                  />
                </label>
              )}
              <details className="rounded-xl border p-4">
                <summary className="cursor-pointer py-2 font-semibold">
                  Optional catalog details
                </summary>
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <section
                    aria-label="Optional topic suggestions"
                    className="space-y-2 sm:col-span-2"
                  >
                    <h2 className="font-semibold">Optional topic labels</h2>
                    <p>
                      Choose labels that describe this recording, or enter your
                      own below. Topics do not describe a listener or diagnose a
                      condition. Up to 12 topics.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {mediaTopicSuggestions.map((topic) => (
                        <button
                          key={topic}
                          type="button"
                          className="gc-button gc-button-quiet"
                          disabled={
                            f.topics.filter((t) => t.trim()).length >= 12 ||
                            f.topics.some(
                              (t) =>
                                t.trim().toLowerCase() === topic.toLowerCase()
                            )
                          }
                          onClick={() =>
                            change({
                              topics: [
                                ...f.topics.filter((t) => t.trim()),
                                topic
                              ]
                            })
                          }
                        >
                          Add {topic}
                        </button>
                      ))}
                    </div>
                  </section>
                  {(
                    [
                      ["speakers", "Speaker names, one per line", 10, 120],
                      ["topics", "Topics, one per line", 12, 40],
                      [
                        "languageIds",
                        "Language IDs, one per line (for example en)",
                        5,
                        30
                      ]
                    ] as const
                  ).map(([key, label, count, max]) => (
                    <label key={key}>
                      {label}
                      <textarea
                        className={fieldClass}
                        aria-label={label}
                        value={f[key].join("\n")}
                        maxLength={count * (max + 1)}
                        onChange={(e) =>
                          change({ [key]: e.target.value.split("\n") })
                        }
                      />
                    </label>
                  ))}
                  {(
                    [
                      ["churchCredit", "Church credit"],
                      ["series", "Series"],
                      ["attribution", "Public rights attribution"]
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key}>
                      {label}
                      <input
                        className={fieldClass}
                        value={f[key]}
                        maxLength={key === "attribution" ? 500 : 160}
                        onChange={(e) => change({ [key]: e.target.value })}
                      />
                    </label>
                  ))}
                  <label>
                    Recorded on
                    <input
                      className={fieldClass}
                      type="date"
                      value={f.recordedOn ?? ""}
                      onChange={(e) =>
                        change({ recordedOn: e.target.value || null })
                      }
                    />
                  </label>
                  {(
                    [
                      ["durationSeconds", "Duration in seconds", 604800],
                      ["sequence", "Series sequence", 100000]
                    ] as const
                  ).map(([key, label, max]) => (
                    <label key={key}>
                      {label}
                      <input
                        type="number"
                        min={1}
                        max={max}
                        className={fieldClass}
                        value={f[key] ?? ""}
                        onChange={(e) =>
                          change({
                            [key]: e.target.value
                              ? Number(e.target.value)
                              : null
                          })
                        }
                      />
                    </label>
                  ))}
                </div>
              </details>
              <label className="block">
                Catalog audience
                <select
                  className={fieldClass}
                  aria-label="Catalog audience"
                  value={f.audience ?? ""}
                  onChange={(e) =>
                    change({
                      audience:
                        (e.target.value as MediaFields["audience"]) || null
                    })
                  }
                >
                  <option value="">Not selected</option>
                  {Object.entries(mediaAudienceNames)
                    .filter(([v]) => v !== "CHURCH" || church)
                    .map(([v, label]) => (
                      <option key={v} value={v}>
                        {label}
                      </option>
                    ))}
                </select>
              </label>
              <label className="block">
                Public source URL
                <input
                  className={fieldClass}
                  type="url"
                  ref={sourceRef}
                  aria-invalid={!!sourceProblem || undefined}
                  aria-describedby={`${feedbackId}-source-help${sourceProblem ? ` ${feedbackId}-source-error` : ""}`}
                  value={f.sourceUrl ?? ""}
                  maxLength={2048}
                  placeholder="https://www.youtube.com/watch?v=…"
                  onChange={(e) =>
                    change({ sourceUrl: e.target.value || null })
                  }
                />
              </label>
              <p id={`${feedbackId}-source-help`} className="text-sm">
                YouTube video, Vimeo video or SoundCloud track. Use the
                canonical public recording link, without timestamps, playlists
                or private access tokens.
              </p>
              {sourceProblem && (
                <p id={`${feedbackId}-source-error`} role="alert">
                  {sourceProblem}
                </p>
              )}
              <section
                className="space-y-3 rounded-xl border p-5"
                aria-label="Audience and source preview"
              >
                <h2 className="text-lg font-semibold">Review before saving</h2>
                <p>
                  Catalog audience:{" "}
                  {f.audience ? mediaAudienceNames[f.audience] : "Not selected"}
                </p>
                <p>Provider: {source?.provider ?? "Not selected"}</p>
                {source && (
                  <p className="break-all">Destination: {source.url}</p>
                )}
                <p>{MEDIA_EXTERNAL_NOTICE}</p>
                {source && (
                  <label className="flex gap-3">
                    <input
                      type="checkbox"
                      checked={ack}
                      onChange={(e) => {
                        setAck(e.target.checked);
                        setDirty(true);
                      }}
                    />
                    <span>I understand this source and catalog audience.</span>
                  </label>
                )}
              </section>
              <section
                className="space-y-3 rounded-xl border p-5"
                aria-label="Rights review"
              >
                <h2 className="text-lg font-semibold">
                  Rights review for publication
                </h2>
                <p>
                  Private permission references are kept separate from public
                  attribution. Do not enter passwords, access tokens or
                  sensitive personal testimony here.
                </p>
                <label className="block">
                  Rights basis
                  <select
                    className={fieldClass}
                    value={basis}
                    onChange={(e) => {
                      setBasis(e.target.value);
                      setRightsReviewed(false);
                      setDirty(true);
                    }}
                  >
                    <option value="OWN">I own this work</option>
                    <option value="PERMISSION">
                      Permission for this use and audience
                    </option>
                    <option value="LICENSE">Applicable license</option>
                  </select>
                </label>
                {[
                  ["Private permission reference", evidence, setEvidence],
                  ["License identification", license, setLicense],
                  ["Private testimony consent reference", consent, setConsent]
                ].map(([label, value, setter]) => (
                  <label className="block" key={String(label)}>
                    {String(label)}
                    <input
                      className={fieldClass}
                      value={String(value)}
                      maxLength={label === "License identification" ? 500 : 160}
                      onChange={(e) => {
                        (setter as (v: string) => void)(e.target.value);
                        setRightsReviewed(false);
                        setDirty(true);
                      }}
                    />
                  </label>
                ))}
                <label className="block">
                  Rights expire on (optional)
                  <input
                    type="date"
                    className={fieldClass}
                    value={expiry}
                    onChange={(e) => {
                      setExpiry(e.target.value);
                      setRightsReviewed(false);
                      setDirty(true);
                    }}
                  />
                </label>
                <label className="flex gap-3">
                  <input
                    type="checkbox"
                    checked={rightsReviewed}
                    onChange={(e) => {
                      setRightsReviewed(e.target.checked);
                      setDirty(true);
                    }}
                  />
                  <span>
                    I reviewed this exact source, text, attribution and
                    audience. The recording has ended, is publicly accessible on
                    its provider, and I have current rights and any required
                    testimony consent.
                  </span>
                </label>
              </section>
              <div className="flex flex-wrap gap-3">
                <button className="gc-button" disabled={conflict} type="submit">
                  {state === "PUBLISHED"
                    ? "Save reviewed publication"
                    : "Save private draft"}
                </button>
                {activeId && data?.item?.canPublish && (
                  <button
                    className="gc-button"
                    disabled={conflict || state === "PUBLISHED"}
                    type="button"
                    onClick={() => void act("publish")}
                  >
                    Publish media
                  </button>
                )}
                <button
                  type="button"
                  className="gc-button gc-button-quiet"
                  onClick={() => {
                    load(data?.item);
                    setMessage("Unsent changes discarded.");
                  }}
                >
                  Discard unsent changes
                </button>
              </div>
              {activeId && data?.item?.canPublish && (
                <details className="border-t pt-4">
                  <summary className="cursor-pointer py-3">
                    Manage availability
                  </summary>
                  <p>
                    These actions immediately hide the catalog entry. Remove
                    clears its descriptive content. Unsent edits are not saved.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-3">
                    {[
                      ["unpublish", "Unpublish"],
                      ["withdraw-rights", "Withdraw rights"],
                      ["source-unavailable", "Source is unavailable"],
                      ["remove", "Remove media"]
                    ].map(([op, label]) => (
                      <button
                        key={op}
                        type="button"
                        className="gc-button gc-button-quiet"
                        disabled={conflict}
                        onClick={() => void act(op)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </details>
              )}
            </fieldset>
          </form>
        </div>
      ) : null}
    </section>
  );
}
