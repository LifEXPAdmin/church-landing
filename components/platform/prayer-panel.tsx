"use client";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState
} from "react";
import { socialRequest, SocialClientError } from "@/lib/platform/social-client";
import {
  prayerGuide,
  prayerUpdateKinds,
  prayerUpdateLabels,
  type PrayerTargetState,
  type PrayerUpdatePage,
  type PrayerUpdateKind
} from "@/lib/platform/prayer-types";
import { useUnsavedSocialWork } from "./use-unsaved-social-work";

export default function PrayerPanel({
  owner,
  postId,
  commentId,
  onClose
}: {
  owner: string;
  postId: string;
  commentId?: string | null;
  onClose: () => void;
}) {
  const title = useId(),
    dialog = useRef<HTMLDialogElement>(null),
    sequence = useRef(0),
    flight = useRef(false);
  const restoreView = useRef<{ scroll: number; focusId: string | null } | null>(
    null
  );
  const [state, setState] = useState<PrayerTargetState | null>(null),
    [updates, setUpdates] = useState<PrayerUpdatePage | null>(null);
  const [busy, setBusy] = useState(false),
    [pending, setPending] = useState<string | null>(null),
    [message, setMessage] = useState("Checking current prayer access…");
  const [accepted, setAccepted] = useState(false),
    [content, setContent] = useState(""),
    [kind, setKind] = useState<PrayerUpdateKind>("UPDATE");
  const [signedOut, setSignedOut] = useState(false),
    [published, setPublished] = useState<string | null>(null);
  const block = () =>
    setMessage(
      pending
        ? "Confirm your pending prayer action before leaving. Retry uses the same request."
        : "Publish or discard your unsent prayer update before leaving."
    );
  useUnsavedSocialWork(
    { dirty: !!content, saving: !!pending, conflict: false },
    block,
    true
  );
  const path = `/api/platform/prayers?${new URLSearchParams({ postId, ...(commentId ? { commentId } : {}) })}`;
  const failed = useCallback((error: unknown) => {
    const status = error instanceof SocialClientError ? error.status : 503;
    if (status === 401) {
      setContent("");
      setPending(null);
      setPublished(null);
      setSignedOut(true);
    }
    setMessage(
      error instanceof SocialClientError
        ? error.message
        : "Your prayer choices could not be checked. Reconnect and try again."
    );
    return status;
  }, []);
  const refresh = useCallback(async () => {
    const seq = ++sequence.current;
    if (dialog.current)
      restoreView.current = {
        scroll: dialog.current.scrollTop,
        focusId: dialog.current.contains(document.activeElement)
          ? (document.activeElement?.id ?? null)
          : null
      };
    setState(null);
    setUpdates(null);
    try {
      const result = await socialRequest<PrayerTargetState>(
        path,
        undefined,
        owner
      );
      if (sequence.current !== seq) return;
      setState(result.data);
      setMessage("Your current prayer choices are ready.");
    } catch (error) {
      if (sequence.current === seq) failed(error);
    }
  }, [path, owner, failed]);
  useLayoutEffect(() => {
    if (!state || !restoreView.current || !dialog.current) return;
    const restore = restoreView.current;
    restoreView.current = null;
    if (restore.focusId)
      document.getElementById(restore.focusId)?.focus({ preventScroll: true });
    dialog.current.scrollTop = restore.scroll;
  }, [state]);
  useEffect(() => {
    const node = dialog.current!;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    node.showModal();
    return () => {
      node.close();
      document.body.style.overflow = previous;
    };
  }, []);
  useEffect(() => {
    const counter = sequence;
    const check = () => {
      if (!flight.current && document.visibilityState !== "hidden")
        void refresh();
    };
    const conceal = () => {
      sequence.current++;
      setState(null);
      setUpdates(null);
    };
    const visibility = () => {
      if (document.visibilityState === "hidden") conceal();
      else check();
    };
    check();
    window.addEventListener("focus", check);
    window.addEventListener("blur", conceal);
    window.addEventListener("online", check);
    window.addEventListener("pageshow", check);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      counter.current++;
      window.removeEventListener("focus", check);
      window.removeEventListener("blur", conceal);
      window.removeEventListener("online", check);
      window.removeEventListener("pageshow", check);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [refresh]);
  async function send(body: string) {
    if (flight.current) return;
    flight.current = true;
    setBusy(true);
    setPending(body);
    setPublished(null);
    try {
      const result = await socialRequest<{ id: string; message: string }>(
        "/api/platform/prayers",
        body,
        owner
      );
      // Once the write is confirmed, a failed status read must never leave a
      // resend prompt for the already-published update.
      setPending(null);
      const operation = JSON.parse(body).operation;
      if (operation === "update") {
        setContent("");
        setPublished(`/platform/posts/${postId}?comment=${result.data.id}`);
      }
      if (operation === "guide") setAccepted(false);
      await refresh();
      setMessage(result.data.message);
      window.dispatchEvent(new Event("gc-prayers-changed"));
    } catch (error) {
      const status = failed(error);
      if ([400, 401, 403, 404, 409, 429].includes(status)) setPending(null);
      setState(null);
      setUpdates(null);
    } finally {
      flight.current = false;
      setBusy(false);
    }
  }
  function command(operation: string, values: Record<string, unknown>) {
    if (!state || pending || busy) return;
    void send(
      JSON.stringify({
        operation,
        mutationId: crypto.randomUUID(),
        ...(operation === "guide"
          ? {}
          : { postId: state.postId, commentId: state.commentId }),
        ...values
      })
    );
  }
  async function loadUpdates(after?: string) {
    if (flight.current) return;
    flight.current = true;
    setBusy(true);
    const seq = ++sequence.current;
    try {
      const result = await socialRequest<PrayerUpdatePage>(
        `${path}&view=updates${after ? `&after=${encodeURIComponent(after)}` : ""}`,
        undefined,
        owner
      );
      if (sequence.current !== seq) return;
      setUpdates((previous) => ({
        ...result.data,
        items: [
          ...new Map(
            [
              ...(after ? (previous?.items ?? []) : []),
              ...result.data.items
            ].map((row) => [row.id, row])
          ).values()
        ]
      }));
    } catch (error) {
      if (sequence.current === seq) {
        setState(null);
        setUpdates(null);
        failed(error);
      }
    } finally {
      flight.current = false;
      setBusy(false);
    }
  }
  function close() {
    if (content || pending) block();
    else onClose();
  }
  const disabled = busy || !!pending;
  return (
    <dialog
      ref={dialog}
      aria-labelledby={title}
      className="gc-prayer-dialog"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-3">
          <h2 id={title} className="text-2xl">
            Prayer and follow-up
          </h2>
          <button
            type="button"
            className="gc-button gc-button-quiet"
            onClick={close}
          >
            Close prayer
          </button>
        </div>
        <p role="status">{busy ? "Checking your prayer action…" : message}</p>
        {!busy && pending && (
          <button
            type="button"
            className="gc-button"
            onClick={() => void send(pending)}
          >
            Retry same prayer action
          </button>
        )}
        {!busy && !pending && !signedOut && (
          <button
            type="button"
            className="gc-profile-text-button"
            onClick={() => void refresh()}
          >
            Refresh prayer choices
          </button>
        )}
        {signedOut && (
          <Link href="/platform/login" className="underline">
            Sign in again
          </Link>
        )}
        {state && !signedOut && (
          <>
            <p className="text-sm">
              These choices belong to this{" "}
              {state.commentId ? "comment" : "post"}. Prayer is a personal
              response, not a measure of faith.
            </p>
            {!state.guide.accepted ? (
              <fieldset className="space-y-3" disabled={disabled}>
                <legend className="text-xl">Before choosing I prayed</legend>
                <ol className="list-decimal space-y-2 pl-5">
                  {prayerGuide.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ol>
                <label className="flex min-h-11 items-center gap-3">
                  <input
                    type="checkbox"
                    checked={accepted}
                    onChange={(event) => setAccepted(event.target.checked)}
                  />
                  I have read this prayer guide
                </label>
                <button
                  type="button"
                  className="gc-button"
                  disabled={!accepted}
                  onClick={() =>
                    command("guide", {
                      guideVersion: state.guide.required,
                      expectedVersion: state.guide.version
                    })
                  }
                >
                  Accept prayer guide
                </button>
              </fieldset>
            ) : null}
            <section className="space-y-3" aria-label="Prayer acknowledgment">
              <button
                type="button"
                className="gc-button"
                aria-pressed={state.choice.acknowledged}
                disabled={
                  disabled ||
                  ((!state.canAcknowledge || !state.guide.accepted) &&
                    !state.choice.acknowledged)
                }
                onClick={() =>
                  command("acknowledge", {
                    desired: !state.choice.acknowledged,
                    shareName: false,
                    guideVersion: state.guide.required,
                    expectedVersion: state.choice.version
                  })
                }
              >
                {state.choice.acknowledged ? "Undo I prayed" : "I prayed"}
              </button>
              {!state.canAcknowledge && (
                <p className="text-sm">
                  New acknowledgments are closed or limited to approved church
                  members.
                </p>
              )}
              <label className="flex min-h-11 items-center gap-3">
                <input
                  type="checkbox"
                  checked={state.choice.shareName}
                  disabled={
                    disabled ||
                    !state.choice.acknowledged ||
                    ((!state.canAcknowledge || !state.guide.accepted) &&
                      !state.choice.shareName)
                  }
                  onChange={(event) =>
                    command("acknowledge", {
                      desired: true,
                      shareName: event.target.checked,
                      guideVersion: state.guide.required,
                      expectedVersion: state.choice.version
                    })
                  }
                />
                Show my name to people who can read this content
              </label>
              <p className="text-sm">
                Names are hidden by default. Undo removes your acknowledgment
                and name; it leaves your private save unchanged.
              </p>
            </section>
            <section className="space-y-2" aria-label="Prayer participants">
              <p className="gc-reaction-count">
                {state.count} {state.count === 1 ? "person has" : "people have"}{" "}
                chosen I prayed.
              </p>
              <p className="text-sm">
                People who chose to share their names:{" "}
                {state.names.length
                  ? state.names.map((person) => person.name).join(", ")
                  : "No names shared."}
                {state.moreNames
                  ? " More names are shared; this view shows up to 30."
                  : ""}
              </p>
            </section>
            <fieldset disabled={disabled} className="space-y-2">
              <legend className="text-xl">Private follow-up</legend>
              <label className="flex min-h-11 items-center gap-3">
                <input
                  type="checkbox"
                  checked={state.choice.saved}
                  onChange={(event) =>
                    command("followup", {
                      desired: event.target.checked,
                      updates: event.target.checked && state.choice.updates,
                      expectedVersion: state.choice.version
                    })
                  }
                />
                Save to my private prayer list
              </label>
              <label className="flex min-h-11 items-center gap-3">
                <input
                  type="checkbox"
                  checked={state.choice.updates}
                  disabled={!state.choice.saved}
                  onChange={(event) =>
                    command("followup", {
                      desired: true,
                      updates: event.target.checked,
                      expectedVersion: state.choice.version
                    })
                  }
                />
                Receive future author updates in Activity
              </label>
              <p className="text-sm">
                Saving does not say you prayed or share your name. Phone alerts
                require your separate choice in{" "}
                <Link
                  href="/platform/settings/notifications/availability"
                  className="underline"
                >
                  Notifications
                </Link>{" "}
                and an enabled device. A muted conversation stays quiet.
              </p>
            </fieldset>
            <section className="space-y-3" aria-label="Author prayer updates">
              <h3 className="text-xl">Author updates</h3>
              {!updates && (
                <button
                  type="button"
                  className="gc-button gc-button-quiet"
                  disabled={disabled}
                  onClick={() => void loadUpdates()}
                >
                  Read prayer updates
                </button>
              )}
              {updates && !updates.items.length && (
                <p>No prayer updates yet.</p>
              )}
              {updates?.items.map((update) => (
                <article
                  key={update.id}
                  className="rounded-xl border border-gc-border p-3"
                >
                  <h4>
                    {prayerUpdateLabels[update.kind]}
                    {update.edited ? " · Edited" : ""}
                  </h4>
                  <p className="whitespace-pre-wrap break-words">
                    {update.content}
                  </p>
                  <Link
                    href={update.href}
                    className="inline-flex min-h-11 items-center underline"
                  >
                    Open update in discussion
                  </Link>
                </article>
              ))}
              {updates?.nextCursor && (
                <button
                  type="button"
                  className="gc-button gc-button-quiet"
                  disabled={disabled}
                  onClick={() => void loadUpdates(updates.nextCursor!)}
                >
                  More prayer updates
                </button>
              )}
              {state.canUpdate && (
                <fieldset disabled={disabled} className="space-y-3">
                  <legend className="text-xl">Add your author update</legend>
                  <p className="text-sm">
                    This publishes a comment in the same discussion, visible to
                    its existing audience. You can edit or delete it there.
                  </p>
                  <div>
                    <label htmlFor={`${title}-kind`} className="block">
                      Update kind
                    </label>
                    <select
                      id={`${title}-kind`}
                      value={kind}
                      onChange={(event) =>
                        setKind(event.target.value as PrayerUpdateKind)
                      }
                      className="mt-1 block w-full"
                    >
                      {prayerUpdateKinds.map((value) => (
                        <option key={value} value={value}>
                          {prayerUpdateLabels[value]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor={`${title}-update`} className="block">
                      Your prayer update
                    </label>
                    <textarea
                      id={`${title}-update`}
                      value={content}
                      maxLength={1500}
                      rows={5}
                      onChange={(event) => setContent(event.target.value)}
                      className="mt-1 block w-full"
                    />
                  </div>
                  <p className="text-sm">
                    {content.length}/1500 characters. Unsent text stays only in
                    this open page.
                  </p>
                  <button
                    type="button"
                    className="gc-button"
                    disabled={!content.trim()}
                    onClick={() => command("update", { kind, content })}
                  >
                    Publish prayer update
                  </button>
                </fieldset>
              )}
            </section>
            <Link
              href="/platform/prayers"
              className="inline-flex min-h-11 items-center underline"
            >
              My private prayer list
            </Link>
          </>
        )}
        {published && (
          <Link
            href={published}
            className="inline-flex min-h-11 items-center underline"
          >
            View your published prayer update
          </Link>
        )}
        {!state && !!content && !signedOut && (
          <section className="space-y-2">
            <h3>Your unsent prayer update</h3>
            <p>
              Only your own unsent text is kept here while current access is
              unavailable. Reconnect to check access before publishing.
            </p>
            <textarea
              aria-label="Preserved unsent prayer update"
              readOnly
              value={content}
              rows={5}
              className="w-full"
            />
          </section>
        )}
        {!!content && !pending && (
          <button
            type="button"
            className="gc-button gc-button-quiet"
            onClick={() => {
              if (window.confirm("Discard your unsent prayer update?")) {
                setContent("");
                setMessage("Unsent prayer update discarded.");
              }
            }}
          >
            Discard unsent prayer update
          </button>
        )}
      </div>
    </dialog>
  );
}
