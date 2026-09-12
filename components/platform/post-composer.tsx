"use client";
import { useEffect, useId, useRef, useState } from "react";
import type {
  PostComposerOptions,
  PostEventOptions
} from "@/lib/platform/post-editor";
import { portalInputClass, portalButtonClass } from "./portal-action-form";
import Link from "next/link";
import {
  ComposerDialog,
  ComposerFrame,
  ComposerCloseChoice
} from "./composer-shell";
import { ComposerPhotos } from "./composer-photos";
import { useDraftWorkspace } from "./draft-workspace-provider";
import {
  PostDraftFields,
  draftProblem,
  type PostDraft
} from "./post-draft-fields";

function EventChoice({
  churchId,
  value,
  change
}: {
  churchId: string;
  value: string;
  change: (id: string, privateEvent: boolean) => void;
}) {
  const id = useId(),
    [data, setData] = useState<PostEventOptions | null>(null),
    [error, setError] = useState(""),
    [pending, setPending] = useState(false);
  async function load(cursor?: string) {
    setPending(true);
    setError("");
    try {
      const response = await fetch(
        `/api/platform/posts?${new URLSearchParams({ view: "events", churchId, ...(cursor ? { cursor } : {}) })}`,
        { cache: "no-store", credentials: "same-origin" }
      );
      const result = await response.json();
      if (!response.ok) {
        setError(result.message ?? "Events could not be loaded.");
        return;
      }
      setData((previous) =>
        cursor && previous
          ? { ...result, events: [...previous.events, ...result.events] }
          : result
      );
    } catch {
      setError("Events could not be loaded. Your draft is still here.");
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="space-y-2">
      {value && !data && (
        <p>A saved event is linked. Load current events to review it.</p>
      )}
      {!data && (
        <button
          className={portalButtonClass}
          type="button"
          disabled={pending}
          onClick={() => void load()}
        >
          {pending ? "Loading events…" : "Choose an optional church event"}
        </button>
      )}
      {data && (
        <>
          <label htmlFor={id} className="block font-semibold">
            Linked church event
          </label>
          <select
            id={id}
            className={portalInputClass}
            value={value}
            onChange={(e) =>
              change(
                e.target.value,
                data.events.find((event) => event.id === e.target.value)
                  ?.visibility === "CHURCH"
              )
            }
          >
            <option value="">No linked event</option>
            {value && !data.events.some((event) => event.id === value) && (
              <option value={value}>
                Saved event · availability needs review
              </option>
            )}
            {data.events.map((event) => (
              <option
                key={event.id}
                value={event.id}
                disabled={event.hasDiscussion}
              >
                {event.title} · {event.startLocal.replace("T", " ")}{" "}
                {event.timeZone}
                {event.hasDiscussion ? " · already has a discussion" : ""}
              </option>
            ))}
          </select>
          {!data.events.length && (
            <p className="text-sm text-gc-muted">
              No upcoming published events are available.
            </p>
          )}
          {data.nextCursor && (
            <button
              type="button"
              disabled={pending}
              className={portalButtonClass}
              onClick={() => void load(data.nextCursor!)}
            >
              More events
            </button>
          )}
          <p className="text-sm text-gc-muted">
            An event has one discussion. Its current audience also limits who
            can read this post. Manage existing discussions from their posts.
          </p>
        </>
      )}
      {error && (
        <p role="status" className="text-sm text-gc-error">
          {error}
        </p>
      )}
    </div>
  );
}
function ComposerDraft({
  options,
  initialChurch = "",
  onSaved,
  onClose,
  closeChoice,
  cancelClose,
  recovery
}: {
  options: PostComposerOptions;
  initialChurch?: string;
  onSaved: () => void;
  onClose: () => void;
  closeChoice: boolean;
  cancelClose: () => void;
  recovery: React.ReactNode;
}) {
  const id = useId();
  const [problem, setProblem] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    formRef.current
      ?.querySelector<HTMLTextAreaElement>("textarea")
      ?.focus({ preventScroll: true });
  }, []);
  const { controller, state } = useDraftWorkspace();
  const draft = state.fields;
  const authorChurchId = draft.authorChurchId ?? "";
  const churchId = draft.audienceChurchId ?? "";
  const eventId = draft.eventOccurrenceId ?? "";
  const [privateEvent, setPrivateEvent] = useState(false);
  const setDraft: React.Dispatch<React.SetStateAction<PostDraft>> = (
    change
  ) => {
    const next =
      typeof change === "function"
        ? change(controller.getSnapshot().fields)
        : change;
    controller.change({
      ...controller.getSnapshot().fields,
      ...next,
      linkUrl: next.linkUrl ?? ""
    });
  };
  useEffect(() => {
    controller.start(
      options.churches.some((c) => c.id === initialChurch)
        ? initialChurch
        : null
    );
  }, [controller, options, initialChurch]);
  useEffect(() => {
    if (state.postId) onSaved();
  }, [state.postId, onSaved]);
  const selectedChurch = options.churches.find((c) => c.id === churchId);
  const changeChurch = (value: string, author = authorChurchId) => {
    setPrivateEvent(false);
    controller.change({
      ...draft,
      authorChurchId: author || null,
      audienceChurchId: value || null,
      eventOccurrenceId: null,
      audience: value ? "CHURCH" : "PUBLIC"
    });
  };
  if (state.hidden)
    return (
      <ComposerFrame
        title="Create a post"
        onClose={onClose}
        save={
          <button type="button" className="gc-button gc-button-quiet" disabled>
            Save draft
          </button>
        }
        footer={null}
      >
        <p role="status">
          Your draft is hidden until your sign-in is checked.{" "}
          {closeChoice &&
            "Check your sign-in before resolving unsent work and closing."}
        </p>
        <button
          type="button"
          className={portalButtonClass}
          onClick={() => void controller.verify()}
        >
          Check sign-in and connection
        </button>
      </ComposerFrame>
    );
  return (
    <form
      ref={formRef}
      onInvalid={(event) => {
        let parent = (event.target as HTMLElement).parentElement;
        while (parent && parent !== formRef.current) {
          if (parent instanceof HTMLDetailsElement) parent.open = true;
          parent = parent.parentElement;
        }
      }}
      aria-label="Publish post"
      className="min-h-0 flex-1"
      onSubmit={(e) => {
        e.preventDefault();
        const problem = draftProblem(draft);
        if (problem) {
          setProblem(problem);
          return;
        }
        setProblem("");
        void controller.publish();
      }}
    >
      <ComposerFrame
        title="Create a post"
        onClose={onClose}
        save={
          <button
            type="button"
            className="gc-button gc-button-quiet"
            disabled={
              state.saving ||
              state.publishing ||
              state.conflict ||
              state.retry ||
              !!state.postId ||
              !state.dirty
            }
            onClick={() => void controller.save()}
          >
            {state.saving ? "Saving…" : "Save draft"}
          </button>
        }
        footer={
          <button
            type="submit"
            className="gc-button gc-button-primary"
            disabled={
              state.hidden ||
              state.saving ||
              state.publishing ||
              state.conflict ||
              state.retry ||
              !!state.postId ||
              draft.replyAudience === null
            }
          >
            Post
          </button>
        }
      >
        {closeChoice && (
          <ComposerCloseChoice
            busy={state.saving || state.publishing}
            conflict={state.conflict}
            recover={
              state.retry ||
              state.hidden ||
              state.externalWork.dirty ||
              state.externalWork.saving ||
              state.externalWork.conflict
            }
            onCancel={cancelClose}
            onSave={() =>
              void controller.save().then((saved) => {
                if (saved && !controller.getSnapshot().dirty) onClose();
              })
            }
            onDiscard={() => {
              if (controller.discardChanges()) onClose();
            }}
          />
        )}
        {recovery}
        <fieldset
          className="min-w-0 space-y-4"
          disabled={state.publishing || !!state.postId}
        >
          <PostDraftFields draft={draft} change={setDraft} />
          <p className="text-sm text-gc-muted">
            {authorChurchId ? "Church identity" : "My personal profile"} ·{" "}
            {draft.audience === "CHURCH" ? "Church members" : "Public"} ·{" "}
            {draft.replyAudience === null
              ? "Reply choice required"
              : draft.replyAudience === "CHURCH_MEMBERS"
                ? "Church members may reply"
                : "Eligible viewers may reply"}
          </p>
          <details className="space-y-3">
            <summary className="cursor-pointer py-2 font-semibold">
              Author, audience and replies
            </summary>
            <div>
              <label className="block font-semibold" htmlFor={`${id}-author`}>
                Speaking as
              </label>
              <select
                id={`${id}-author`}
                name="authorChurchId"
                className={portalInputClass}
                value={authorChurchId}
                onChange={(e) => {
                  changeChurch(e.target.value, e.target.value);
                }}
              >
                <option value="">Me</option>
                {authorChurchId &&
                  !options.churches.some(
                    (c) => c.id === authorChurchId && c.canPublish
                  ) && (
                    <option value={authorChurchId}>
                      Saved church author · access needs review
                    </option>
                  )}
                {options.churches
                  .filter((c) => c.canPublish)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </div>
            {!authorChurchId && (
              <div>
                <label className="block font-semibold" htmlFor={`${id}-church`}>
                  Also share on a church page
                </label>
                <select
                  id={`${id}-church`}
                  name="audienceChurchId"
                  value={churchId}
                  className={portalInputClass}
                  onChange={(e) => changeChurch(e.target.value)}
                >
                  <option value="">Do not share with a church</option>
                  {churchId && !selectedChurch && (
                    <option value={churchId}>
                      Saved church · access needs review
                    </option>
                  )}
                  {options.churches.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                {churchId && (
                  <label className="flex min-h-11 items-center gap-2">
                    <input key={churchId} type="checkbox" required />
                    Share my personal post on {selectedChurch?.name}&apos;s
                    page.
                  </label>
                )}
              </div>
            )}
            <div>
              <label className="block font-semibold" htmlFor={`${id}-audience`}>
                Who can read this post?
              </label>
              <select
                id={`${id}-audience`}
                name="audience"
                className={portalInputClass}
                value={draft.audience}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    audience: e.target.value as PostDraft["audience"]
                  })
                }
              >
                <option value="PUBLIC">
                  Public · everyone, including guests
                </option>
                {churchId && (
                  <option value="CHURCH">
                    Approved members of {selectedChurch?.name}
                  </option>
                )}
              </select>
            </div>

            {churchId && (
              <EventChoice
                key={churchId}
                churchId={churchId}
                value={eventId}
                change={(value, restricted) => {
                  controller.change({
                    ...draft,
                    eventOccurrenceId: value || null
                  });
                  setPrivateEvent(restricted);
                }}
              />
            )}
            <div>
              <label className="block font-semibold" htmlFor={`${id}-replies`}>
                Who may reply?
              </label>
              <select
                id={`${id}-replies`}
                name="replyAudience"
                className={portalInputClass}
                value={draft.replyAudience ?? ""}
                onChange={(e) =>
                  controller.change({
                    ...draft,
                    replyAudience: (e.target.value ||
                      null) as typeof draft.replyAudience
                  })
                }
              >
                <option value="" disabled>
                  Choose who may reply
                </option>
                <option value="VIEWERS">
                  Eligible viewers with an account
                </option>
                <option value="CHURCH_MEMBERS">
                  Approved church members only
                </option>
              </select>
            </div>
            <p className="rounded-xl bg-gc-canvas p-3 text-sm">
              Publishing as{" "}
              <strong>{authorChurchId ? selectedChurch?.name : "Me"}</strong>.{" "}
              {draft.audience === "CHURCH" || privateEvent
                ? `Only approved members of ${selectedChurch?.name} can read this post.`
                : "Everyone, including guests, can read this post."}{" "}
              {churchId &&
                `It will also appear on ${selectedChurch?.name}'s page for eligible readers.`}{" "}
              You can edit or remove your post and manage its discussion after
              publishing.
            </p>
          </details>
          <details className="space-y-3">
            <summary className="cursor-pointer py-2 font-semibold">
              Photos ({draft.photos?.length ?? 0})
            </summary>
            <ComposerPhotos enabled={options.photoLibraryEnabled} />
          </details>
        </fieldset>
        <p role="status">
          {problem ||
            (state.failed ? "Couldn’t save. " : "") +
              (state.message ||
                (state.dirty
                  ? "Not saved yet."
                  : "Your draft will save privately after you make changes."))}
        </p>
        {draft.replyAudience === null && (
          <p>
            Choose who may reply and save before publishing this older draft.
          </p>
        )}
        {!state.postId && (
          <div className="flex flex-wrap gap-2">
            {state.retry && (
              <button
                type="button"
                className={portalButtonClass}
                disabled={state.saving || state.conflict}
                onClick={() => void controller.retry()}
              >
                Retry same request
              </button>
            )}
            <Link className={portalButtonClass} href="/platform/drafts">
              Your drafts
            </Link>
          </div>
        )}
        {state.conflict && (
          <section
            aria-label="Draft conflict"
            className="space-y-3 border-t border-gc-divider pt-3"
          >
            <p>
              This draft changed or was removed elsewhere. Your unsent entries
              are still above.
            </p>
            <button
              type="button"
              className={portalButtonClass}
              disabled={state.saving}
              onClick={() => void controller.loadLatest()}
            >
              Load saved copy for review
            </button>
            {state.latestLoaded && (
              <div>
                <p>
                  {state.latest ? "Saved copy:" : "No saved copy is available."}
                </p>
                {state.latest && (
                  <>
                    <p className="whitespace-pre-wrap break-words">
                      {state.latest.payload.content}
                    </p>
                    <p>
                      Replies:{" "}
                      {state.latest.payload.replyAudience ?? "Choice required"}
                    </p>
                    <button
                      type="button"
                      className={portalButtonClass}
                      onClick={controller.useLatest}
                    >
                      Replace my entries with saved copy
                    </button>
                  </>
                )}
              </div>
            )}
            <button
              type="button"
              className={portalButtonClass}
              disabled={state.saving}
              onClick={controller.saveAsNew}
            >
              Save my entries as a new draft
            </button>
          </section>
        )}
        {!state.postId && (
          <aside
            className="space-y-2 rounded-xl border border-gc-divider p-4"
            aria-label="Add a poll"
          >
            <h3 className="font-semibold">Ask your community with a poll</h3>
            <p className="text-sm text-gc-muted">
              Publish your post, then choose Add a poll below to set its
              question, choices and closing time. Poll setup happens on the
              published post; your private draft saves the post, without poll
              settings.
            </p>
          </aside>
        )}
        {state.postId && (
          <div className="flex flex-wrap gap-3">
            <Link
              className={portalButtonClass}
              href={`/platform/posts/${state.postId}`}
            >
              View published post
            </Link>
            <Link
              className={portalButtonClass}
              href={`/platform/posts/${state.postId}#poll-create`}
            >
              Add a poll
            </Link>
          </div>
        )}
      </ComposerFrame>
    </form>
  );
}
function OpenPostComposer({
  initialChurch,
  resumeId,
  dismiss
}: {
  initialChurch?: string;
  resumeId?: string;
  dismiss: () => void;
}) {
  const { controller, state } = useDraftWorkspace();
  const [closeChoice, setCloseChoice] = useState(false);
  const close = () => {
    const s = controller.getSnapshot();
    if (
      s.dirty ||
      s.saving ||
      s.publishing ||
      s.retry ||
      s.conflict ||
      s.externalWork.dirty ||
      s.externalWork.saving ||
      s.externalWork.conflict
    )
      setCloseChoice(true);
    else dismiss();
  };
  const [optionsOwner, setOptionsOwner] = useState<string | null>(null);
  const [options, setOptions] = useState<PostComposerOptions | null>(null),
    [error, setError] = useState(""),
    [attempt, setAttempt] = useState(0),
    [draftNumber, setDraftNumber] = useState(0);
  const [finished, setFinished] = useState(false);
  const requested = useRef("");
  useEffect(() => {
    if (
      !resumeId ||
      !state.ownerId ||
      state.hidden ||
      requested.current === `${state.ownerId}:${resumeId}`
    )
      return;
    requested.current = `${state.ownerId}:${resumeId}`;
    void controller.resume(resumeId);
  }, [controller, resumeId, state.ownerId, state.hidden]);

  useEffect(() => {
    setOptions(null);
    if (!state.ownerId) return;
    const controller = new AbortController();
    fetch("/api/platform/posts?view=composer", {
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal
    })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok)
          throw new Error(
            result.message ?? "Your publishing choices could not be loaded."
          );
        if (controller.signal.aborted) return;
        setOptionsOwner(state.ownerId);
        setOptions(result);
        setError("");
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setError(
            error instanceof Error
              ? error.message
              : "Your publishing choices could not be loaded."
          );
      });
    return () => controller.abort();
  }, [attempt, state.ownerId]);
  const recovery = (
    <>
      {state.resumeId && !state.hidden && (
        <section aria-label="Replace current draft" className="space-y-3">
          <p>
            You have current work in this tab. Keep it, or replace it with the
            selected saved draft?
          </p>
          <button
            type="button"
            className={portalButtonClass}
            onClick={controller.cancelResume}
          >
            Keep current draft
          </button>
          <button
            type="button"
            className={portalButtonClass}
            onClick={() => void controller.resume(state.resumeId!, true)}
          >
            Replace with selected draft
          </button>
        </section>
      )}
      {resumeId && !state.resumeId && !state.hidden && (
        <button
          type="button"
          className={portalButtonClass}
          disabled={state.saving || state.publishing}
          onClick={() => void controller.resume(resumeId)}
        >
          Open selected draft again
        </button>
      )}
      {finished && state.postId && (
        <button
          type="button"
          className={portalButtonClass}
          onClick={() => {
            setFinished(false);
            controller.newDraft();
            setDraftNumber((v) => v + 1);
          }}
        >
          Write another post
        </button>
      )}
      <noscript>
        Enable JavaScript to use the publishing form. Public posts remain
        readable.
      </noscript>
    </>
  );
  return (
    <ComposerDialog title="Create a post" onClose={close}>
      <section
        aria-label="Create a post"
        className="flex h-full min-h-0 flex-col"
      >
        {options && optionsOwner === state.ownerId ? (
          <ComposerDraft
            key={`${draftNumber}:${state.id}:${state.loadNumber}`}
            options={options}
            initialChurch={initialChurch}
            onSaved={() => setFinished(true)}
            onClose={close}
            closeChoice={closeChoice}
            cancelClose={() => setCloseChoice(false)}
            recovery={recovery}
          />
        ) : (
          <div className="p-4">
            <button
              type="button"
              className="gc-button gc-button-quiet"
              onClick={close}
            >
              Close composer
            </button>
            <p role="status">{error || "Loading your publishing choices…"}</p>
          </div>
        )}
        {error && (
          <button
            type="button"
            className={portalButtonClass}
            onClick={() => setAttempt((v) => v + 1)}
          >
            Retry publishing choices
          </button>
        )}
      </section>
    </ComposerDialog>
  );
}

export function PostComposer({
  initialChurch,
  resumeId,
  id,
  label = "Share what's on your heart"
}: {
  initialChurch?: string;
  resumeId?: string;
  id?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(!!resumeId);
  return (
    <>
      <button
        id={id}
        type="button"
        className="gc-button gc-button-quiet w-full justify-start"
        onClick={() => setOpen(true)}
      >
        {resumeId ? "Open selected draft" : label}
      </button>
      {open && (
        <OpenPostComposer
          initialChurch={initialChurch}
          resumeId={resumeId}
          dismiss={() => setOpen(false)}
        />
      )}
    </>
  );
}
