"use client";
import { useEffect, useId, useState } from "react";
import type {
  PostComposerOptions,
  PostEventOptions
} from "@/lib/platform/post-editor";
import { portalInputClass, portalButtonClass } from "./portal-action-form";
import { PostActionForm } from "./post-action-form";
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
  onSaved
}: {
  options: PostComposerOptions;
  initialChurch?: string;
  onSaved: () => void;
}) {
  const id = useId();
  const [requestKey] = useState(() => crypto.randomUUID());
  const [authorChurchId, setAuthor] = useState("");
  const [churchId, setChurch] = useState(
    options.churches.some((c) => c.id === initialChurch) ? initialChurch : ""
  );
  const [eventId, setEvent] = useState(""),
    [privateEvent, setPrivateEvent] = useState(false);
  const [draft, setDraft] = useState<PostDraft>({
    content: "",
    scripture: "",
    type: "UPDATE",
    topics: [],
    audience: churchId ? "CHURCH" : "PUBLIC"
  });
  const selectedChurch = options.churches.find((c) => c.id === churchId);
  const changeChurch = (value: string) => {
    setChurch(value);
    setEvent("");
    setPrivateEvent(false);
    setDraft((d) => ({ ...d, audience: value ? "CHURCH" : "PUBLIC" }));
  };
  return (
    <PostActionForm
      payload={{ operation: "create", requestKey }}
      label="Publish post"
      validate={() => draftProblem(draft)}
      onSuccess={onSaved}
      fields={(data) => ({
        ...draft,
        authorChurchId: authorChurchId || null,
        audienceChurchId: churchId || null,
        eventOccurrenceId: eventId || null,
        replyAudience: data.get("replyAudience") ?? "VIEWERS"
      })}
    >
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
            setAuthor(e.target.value);
            changeChurch(e.target.value);
          }}
        >
          <option value="">Me</option>
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
            {options.churches.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {churchId && (
            <label className="flex min-h-11 items-center gap-2">
              <input key={churchId} type="checkbox" required />
              Share my personal post on {selectedChurch?.name}&apos;s page.
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
          <option value="PUBLIC">Public · everyone, including guests</option>
          {churchId && (
            <option value="CHURCH">
              Approved members of {selectedChurch?.name}
            </option>
          )}
        </select>
      </div>
      <PostDraftFields draft={draft} change={setDraft} />
      {churchId && (
        <EventChoice
          key={churchId}
          churchId={churchId}
          value={eventId}
          change={(value, restricted) => {
            setEvent(value);
            setPrivateEvent(restricted);
          }}
        />
      )}
      <div>
        <label className="block font-semibold" htmlFor={`${id}-replies`}>
          Who may reply?
        </label>
        <select
          key={churchId}
          id={`${id}-replies`}
          name="replyAudience"
          className={portalInputClass}
          defaultValue="VIEWERS"
        >
          <option value="VIEWERS">Eligible viewers with an account</option>
          {churchId && (
            <option value="CHURCH_MEMBERS">Approved church members only</option>
          )}
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
    </PostActionForm>
  );
}
export function PostComposer({ initialChurch }: { initialChurch?: string }) {
  const [options, setOptions] = useState<PostComposerOptions | null>(null),
    [error, setError] = useState(""),
    [attempt, setAttempt] = useState(0),
    [draftNumber, setDraftNumber] = useState(0);
  const [finished, setFinished] = useState(false);
  useEffect(() => {
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
  }, [attempt]);
  return (
    <section
      aria-label="Create a post"
      className="space-y-4 rounded-xl border border-gc-divider bg-gc-surface p-5"
    >
      <h2 className="text-3xl">What is God doing?</h2>
      {options ? (
        <ComposerDraft
          key={draftNumber}
          options={options}
          initialChurch={initialChurch}
          onSaved={() => setFinished(true)}
        />
      ) : (
        <p role="status">{error || "Loading your publishing choices…"}</p>
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
      {finished && (
        <button
          type="button"
          className={portalButtonClass}
          onClick={() => {
            setFinished(false);
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
    </section>
  );
}
