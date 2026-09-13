"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { socialRequest, SocialClientError } from "@/lib/platform/social-client";
import type { readFounderAnnouncements } from "@/lib/platform/founder-announcements";
import { useUnsavedSocialWork } from "./use-unsaved-social-work";
type Result = Awaited<ReturnType<typeof readFounderAnnouncements>>;
type Announcement = NonNullable<Result["announcement"]>;
type Member = NonNullable<Result["audience"]>[number];
const endpoint = "/api/platform/founder-announcements";
const stamp = (date: string) => new Date(date).toLocaleString();
const sameIds = (a: string[], b: string[]) =>
  a.length === b.length && a.every((id) => b.includes(id));
export function FounderAnnouncements({ owner }: { owner: string }) {
  const [list, setList] = useState<NonNullable<Result["announcements"]>>([]),
    [after, setAfter] = useState<string | null>(null);
  const [row, setRow] = useState<Announcement | null>(null),
    [content, setContent] = useState("");
  const [audience, setAudience] = useState<Member[]>([]),
    [audienceAfter, setAudienceAfter] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]),
    [confirmed, setConfirmed] = useState(false);
  const [available, setAvailable] = useState(false),
    [loaded, setLoaded] = useState(false),
    [concealed, setConcealed] = useState(false);
  const [busy, setBusy] = useState(false),
    [pending, setPending] = useState<string | null>(null),
    [conflict, setConflict] = useState(false),
    [message, setMessage] = useState("");
  const drafted = !row || row.status === "DRAFT";
  const textDirty = drafted && content !== (row?.content ?? "");
  const selectionDirty =
    drafted &&
    !sameIds(
      selected,
      row?.recipients
        .filter((r) => r.status === "SELECTED")
        .map((r) => r.recipientId) ?? []
    );
  const dirty = textDirty || selectionDirty;
  const current = useRef({ row, dirty, pending });
  current.current = { row, dirty, pending };
  const generation = useRef(0),
    inFlight = useRef(false);
  useUnsavedSocialWork(
    { dirty, saving: busy || !!pending, conflict },
    () =>
      setMessage("Save or resolve your announcement changes before leaving."),
    true
  );
  const fail = useCallback((error: unknown) => {
    setMessage(
      error instanceof Error
        ? error.message
        : "The request could not be confirmed. Retry the same request."
    );
    if (
      error instanceof SocialClientError &&
      (error.status === 401 || error.status === 403)
    )
      setConcealed(true);
  }, []);
  const load = useCallback(
    async (id: string | null, replace = false) => {
      const seq = ++generation.current;
      try {
        const { data } = await socialRequest<Result>(
          endpoint + (id ? "?id=" + id : ""),
          undefined,
          owner
        );
        if (seq !== generation.current) return;
        setLoaded(true);
        setConcealed(false);
        setAvailable(data.available ?? false);
        if (data.announcement) {
          const next = data.announcement;
          if (replace || (!current.current.dirty && !current.current.pending)) {
            setRow(next);
            setContent(next.content ?? "");
            setSelected(
              next.recipients
                .filter((r) => r.status === "SELECTED")
                .map((r) => r.recipientId)
            );
            setConfirmed(false);
            setConflict(false);
          } else if (
            next.version !== current.current.row?.version &&
            !current.current.pending
          )
            setConflict(true);
        } else {
          setList(data.announcements ?? []);
          setAfter(data.after ?? null);
        }
      } catch (error) {
        if (seq === generation.current) fail(error);
      }
    },
    [owner, fail]
  );
  useEffect(() => {
    void load(null);
    const check = () => {
      if (document.visibilityState !== "hidden" && !inFlight.current)
        void load(current.current.row?.id ?? null);
    };
    window.addEventListener("focus", check);
    window.addEventListener("online", check);
    return () => {
      // Request generation counter, not a DOM ref.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      generation.current++;
      window.removeEventListener("focus", check);
      window.removeEventListener("online", check);
    };
  }, [load]);
  useEffect(() => {
    if (row?.status !== "SENDING") return;
    const timer = setInterval(() => {
      if (document.visibilityState !== "hidden" && !inFlight.current)
        void load(row.id);
    }, 15000);
    return () => clearInterval(timer);
  }, [row?.id, row?.status, load]);
  async function members(after?: string) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const { data } = await socialRequest<Result>(
        endpoint + "?view=audience" + (after ? "&after=" + after : ""),
        undefined,
        owner
      );
      setAudience((old) => [
        ...new Map(
          [...(after ? old : []), ...(data.audience ?? [])].map((m) => [
            m.id,
            m
          ])
        ).values()
      ]);
      setAudienceAfter(data.after ?? null);
    } catch (error) {
      fail(error);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  async function act(operation: string, retry = false) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setMessage("");
    const body =
      retry && pending
        ? pending
        : JSON.stringify({
            operation,
            mutationId: crypto.randomUUID(),
            ownerId: owner,
            ...(row ? { id: row.id } : {}),
            expectedVersion: row?.version ?? 0,
            ...(operation === "save" ? { content } : {}),
            ...(operation === "preview" ? { recipientIds: selected } : {}),
            ...(operation === "send" ? { confirmed } : {})
          });
    setPending(body);
    try {
      const { data } = await socialRequest<{ id: string; message: string }>(
        endpoint,
        body,
        owner
      );
      setPending(null);
      setMessage(data.message);
      setConfirmed(false);
      await load(data.id, true);
    } catch (error) {
      if (
        error instanceof SocialClientError &&
        [400, 409, 429].includes(error.status)
      ) {
        setPending(null);
        if (error.status === 409 && row) setConflict(true);
      }
      fail(error);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  async function keepText() {
    if (!row || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const { data } = await socialRequest<Result>(
        endpoint + "?id=" + row.id,
        undefined,
        owner
      );
      if (data.announcement) {
        setRow(data.announcement);
        setAvailable(data.available ?? false);
        setConflict(false);
        setConfirmed(false);
        if (data.announcement.status !== "DRAFT") {
          setContent("");
          setSelected([]);
        }
        setMessage(
          "Current version loaded. Review your text and selected members, then prepare a fresh preview."
        );
      }
    } catch (error) {
      fail(error);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  async function more() {
    if (!after || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const { data } = await socialRequest<Result>(
        endpoint + "?after=" + after,
        undefined,
        owner
      );
      setList((old) => [
        ...new Map(
          [...old, ...(data.announcements ?? [])].map((item) => [item.id, item])
        ).values()
      ]);
      setAfter(data.after ?? null);
    } catch (error) {
      fail(error);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  const disabled = busy || !!pending || conflict;
  const previewReady =
    row?.status === "DRAFT" &&
    !!row.previewedAt &&
    Date.now() - Date.parse(row.previewedAt) < 15 * 60000 &&
    !dirty;
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link href="/platform/messages" prefetch={false}>
        Back to messages
      </Link>
      <h1 className="text-3xl font-semibold">Founder announcements</h1>
      <p>
        Send an optional update to explicitly selected members who received a
        welcome. Members can turn announcements off without losing personal
        replies.
      </p>
      {message && (
        <p role="status" className="rounded-xl border p-3">
          {message}
        </p>
      )}
      {concealed ? (
        <p>
          Your private announcement work is hidden because your sign-in or
          access changed. Return to the original account and reload this page.
        </p>
      ) : !loaded ? (
        <p>Loading announcement controls…</p>
      ) : (
        <>
          {!available && (
            <p role="status">
              Sending is paused. You can prepare and save a draft.
            </p>
          )}
          {pending && (
            <button
              className="gc-button gc-button-quiet"
              disabled={busy}
              onClick={() => void act("", true)}
            >
              Retry the same request
            </button>
          )}
          {conflict && (
            <div className="flex flex-wrap gap-3">
              <button
                className="gc-button gc-button-quiet"
                disabled={busy}
                onClick={() => void keepText()}
              >
                Use current version and keep my text
              </button>
              {row && (
                <button
                  className="gc-button gc-button-quiet"
                  disabled={busy}
                  onClick={() => void load(row.id, true)}
                >
                  Discard my changes and reload saved draft
                </button>
              )}
            </div>
          )}
          <section
            aria-label="Announcement draft"
            className="space-y-4 rounded-xl border p-4"
          >
            <h2 className="text-xl font-semibold">
              {row
                ? row.status === "DRAFT"
                  ? "Saved draft"
                  : "Send progress"
                : "New announcement"}
            </h2>
            {drafted ? (
              <>
                <label className="block">
                  Announcement text
                  <textarea
                    className="mt-2 w-full rounded-lg border p-3"
                    rows={7}
                    maxLength={4000}
                    value={content}
                    disabled={busy || !!pending}
                    onChange={(e) => {
                      setContent(e.target.value);
                      setConfirmed(false);
                    }}
                  />
                </label>
                <p>
                  {content.length}/4,000 characters. Drafts and previews send
                  nothing.
                </p>
                <div className="flex flex-wrap gap-3">
                  <button
                    className="gc-button"
                    disabled={
                      disabled || !content.trim() || (!!row && !textDirty)
                    }
                    onClick={() => void act("save")}
                  >
                    Save draft
                  </button>
                  {row && (
                    <button
                      className="gc-button gc-button-quiet"
                      disabled={disabled}
                      onClick={() => void act("discard")}
                    >
                      Discard draft
                    </button>
                  )}
                </div>
                {row && (
                  <>
                    <h3 className="font-semibold">Select recipients</h3>
                    <p>
                      {selected.length} selected; up to 100 per send.
                      Eligibility and announcement preferences are checked again
                      before delivery.
                    </p>
                    <button
                      className="gc-button gc-button-quiet"
                      disabled={disabled}
                      onClick={() => void members()}
                    >
                      Refresh eligible members
                    </button>
                    {selected.length > 0 && (
                      <button
                        className="gc-button gc-button-quiet ml-2"
                        disabled={disabled}
                        onClick={() => {
                          setSelected([]);
                          setConfirmed(false);
                        }}
                      >
                        Clear selection
                      </button>
                    )}
                    <div className="max-h-64 space-y-2 overflow-y-auto">
                      {audience.map((member) => (
                        <label
                          key={member.id}
                          className="flex items-center gap-3 rounded border p-3"
                        >
                          <input
                            type="checkbox"
                            checked={selected.includes(member.id)}
                            disabled={
                              disabled ||
                              (!selected.includes(member.id) &&
                                selected.length >= 100)
                            }
                            onChange={(e) => {
                              setSelected((old) =>
                                e.target.checked
                                  ? [...old, member.id]
                                  : old.filter((id) => id !== member.id)
                              );
                              setConfirmed(false);
                            }}
                          />
                          {member.name}
                          {member.username ? ` (@${member.username})` : ""}
                        </label>
                      ))}
                    </div>
                    {audienceAfter && (
                      <button
                        className="gc-button gc-button-quiet"
                        disabled={disabled}
                        onClick={() => void members(audienceAfter)}
                      >
                        More eligible members
                      </button>
                    )}
                    <button
                      className="gc-button gc-button-quiet"
                      disabled={disabled || textDirty || !selected.length}
                      onClick={() => void act("preview")}
                    >
                      Preview selected recipients
                    </button>
                    {textDirty && (
                      <p>Save your revised text before preparing a preview.</p>
                    )}
                    {row.previewedAt && (
                      <section
                        aria-label="Announcement preview"
                        className="space-y-3 rounded-lg border bg-gc-subtle p-4"
                      >
                        <h3 className="font-semibold">Review before sending</h3>
                        <p className="whitespace-pre-wrap break-words">
                          {row.content}
                        </p>
                        <p>
                          Preview prepared {stamp(row.previewedAt)}. A send
                          requires a preview from the last 15 minutes.
                        </p>
                        <ul className="list-inside list-disc">
                          {row.recipients.map((r) => (
                            <li key={r.recipientId}>
                              {r.recipient.name}
                              {r.status === "SKIPPED"
                                ? " — no longer eligible"
                                : ""}
                            </li>
                          ))}
                        </ul>
                        {!previewReady && (
                          <p>
                            Prepare a fresh preview for your current text and
                            selection.
                          </p>
                        )}
                        <label className="flex gap-3">
                          <input
                            type="checkbox"
                            checked={confirmed}
                            disabled={disabled || !previewReady}
                            onChange={(e) => setConfirmed(e.target.checked)}
                          />
                          I reviewed this text and recipient list and want to
                          send this announcement.
                        </label>
                        <button
                          className="gc-button"
                          disabled={
                            disabled ||
                            !available ||
                            !previewReady ||
                            !confirmed
                          }
                          onClick={() => void act("send")}
                        >
                          Send reviewed announcement
                        </button>
                      </section>
                    )}
                  </>
                )}
              </>
            ) : (
              row && (
                <>
                  <p role="status">
                    {row.status === "SENDING"
                      ? "Sending"
                      : row.status === "COMPLETE"
                        ? "Finished"
                        : "Cancelled"}
                    : {row.sentCount} sent, {row.skippedCount} skipped,{" "}
                    {Math.max(
                      0,
                      row.selectedCount - row.sentCount - row.skippedCount
                    )}{" "}
                    remaining.
                  </p>
                  <p>
                    Sent means added to the member’s conversation. Phone
                    delivery depends on their settings and device. Unavailable
                    or opted-out members are skipped.
                  </p>
                  <button
                    className="gc-button gc-button-quiet"
                    disabled={busy}
                    onClick={() => void load(row.id)}
                  >
                    Refresh progress
                  </button>
                  <ul className="space-y-2">
                    {row.recipients.map((r) => (
                      <li key={r.recipientId}>
                        {r.recipient.name}: {r.status.toLowerCase()}
                        {r.href && (
                          <>
                            {" "}
                            —{" "}
                            <Link href={r.href} prefetch={false}>
                              Open sent conversation
                            </Link>
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                  {row.completedAt && (
                    <p>
                      Finished {stamp(row.completedAt)}. Individual delivery
                      details expire after 14 days; sent messages follow
                      conversation retention.
                    </p>
                  )}
                </>
              )
            )}
          </section>
          <section aria-label="Saved announcements" className="space-y-3">
            <h2 className="text-xl font-semibold">Saved announcements</h2>
            <div className="flex flex-wrap gap-3">
              <button
                className="gc-button gc-button-quiet"
                disabled={disabled || dirty}
                onClick={() => {
                  setRow(null);
                  setContent("");
                  setSelected([]);
                  setConfirmed(false);
                  setMessage("");
                }}
              >
                New draft
              </button>
              <button
                className="gc-button gc-button-quiet"
                disabled={disabled || dirty}
                onClick={() => void load(null)}
              >
                Refresh saved announcements
              </button>
            </div>
            <ul className="space-y-2">
              {list.map((item) => (
                <li key={item.id}>
                  <button
                    className="text-left underline"
                    disabled={disabled || dirty}
                    onClick={() => void load(item.id, true)}
                  >
                    {stamp(item.updatedAt)} — {item.status.toLowerCase()} ·{" "}
                    {item.sentCount}/{item.selectedCount} sent
                  </button>
                </li>
              ))}
            </ul>
            {after && (
              <button
                className="gc-button gc-button-quiet"
                disabled={disabled || dirty}
                onClick={() => void more()}
              >
                Older announcements
              </button>
            )}
          </section>
        </>
      )}
    </div>
  );
}
