"use client";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { ArrowLeft, MessageCircle, Plus } from "lucide-react";
import type {
  AdultMessageItem,
  AdultConversationSummary
} from "@/lib/platform/adult-message-types";
import { reportEntryHref } from "@/lib/platform/community-report-types";
import { AuthorAvatar } from "./author-avatar";
import { MoreActions } from "./action-popover";
import { RelationshipControls } from "./relationship-controls";
import { useMessageWorkspace } from "./use-message-workspace";

const inboxHref = (archived: boolean, after?: string) =>
  "/platform/messages" +
  (archived || after
    ? "?" +
      new URLSearchParams({
        ...(archived ? { archived: "true" } : {}),
        ...(after ? { after } : {})
      })
    : "");
const time = (value: string) =>
  new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });

function MessageRow({
  message,
  name,
  selected
}: {
  message: AdultMessageItem;
  name: string;
  selected: boolean;
}) {
  return (
    <article
      id={`message-${message.id}`}
      aria-label={`Message from ${message.mine ? "you" : name}`}
      className={`gc-message-bubble ${message.mine ? "gc-message-mine" : ""} ${selected ? "gc-message-selected" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-semibold">
          {message.mine ? "You" : name}
        </span>
        <MoreActions label="Message options">
          <Link prefetch={false} href={reportEntryHref("MESSAGE", message.id)}>
            Report this message
          </Link>
        </MoreActions>
      </div>
      <p className="whitespace-pre-wrap break-words">{message.content}</p>
      <time
        className="mt-2 block text-xs text-gc-muted"
        dateTime={message.createdAt}
      >
        {time(message.createdAt)}
      </time>
      <span
        data-message-end={message.id}
        className="block h-px"
        aria-hidden="true"
      />
    </article>
  );
}
function ConversationLink({
  row,
  owner,
  selected,
  returnQuery,
  onOpen
}: {
  row: AdultConversationSummary;
  owner: string;
  selected?: string;
  returnQuery: string;
  onOpen: () => void;
}) {
  return (
    <Link
      prefetch={false}
      href={`/platform/messages/${row.id}${returnQuery}`}
      onClick={onOpen}
      aria-current={selected === row.id ? "page" : undefined}
      className="gc-conversation-link"
    >
      {row.person ? (
        <AuthorAvatar id={row.person.id} name={row.person.name} owner={owner} />
      ) : (
        <span className="gc-avatar" aria-hidden="true">
          ?
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">
          {row.person?.name ?? "Unavailable account"}
        </span>
        <span className="block truncate text-sm text-gc-muted">
          {row.latest
            ? `${row.latest.mine ? "You: " : ""}${row.latest.content}`
            : "Accepted contact — no messages yet"}
        </span>
        <time className="text-xs text-gc-muted" dateTime={row.updatedAt}>
          {time(row.updatedAt)}
        </time>
        {row.preferences.muted && <span className="ml-2 text-xs">Muted</span>}
      </span>
      {row.unread > 0 && (
        <span
          className="gc-message-count"
          aria-label={`${row.unread} unread messages`}
        >
          {row.unread > 99 ? "99+" : row.unread}
        </span>
      )}
    </Link>
  );
}
export function MessageWorkspace({
  owner,
  conversationId,
  archived = false,
  after,
  selected
}: {
  owner: string;
  conversationId?: string;
  archived?: boolean;
  after?: string;
  selected?: string;
}) {
  const {
    state: s,
    setState,
    load,
    send,
    act,
    discard,
    markVisible,
    atBottom
  } = useMessageWorkspace(owner, conversationId, archived, after, selected);
  const history = useRef<HTMLDivElement>(null),
    list = useRef<HTMLDivElement>(null),
    restored = useRef(false),
    lastConversation = useRef<string | undefined>(undefined);
  const conversation = s.data?.conversation,
    busy = s.busy || !!s.pending || !!s.waitingUntil;
  const back = inboxHref(archived, after),
    positionKey = `gc-message-position:${owner}:${back}`;
  const savePosition = () => {
    try {
      sessionStorage.setItem(
        positionKey,
        JSON.stringify({
          page: window.scrollY,
          list: list.current?.scrollTop ?? 0
        })
      );
    } catch {
      /* Position restoration is optional storage, never private content. */
    }
  };
  useEffect(() => {
    if (s.hidden || !s.data) return;
    if (!conversationId && !restored.current) {
      restored.current = true;
      try {
        const p = JSON.parse(sessionStorage.getItem(positionKey) ?? "null");
        if (p && Number.isFinite(p.page) && Number.isFinite(p.list)) {
          window.scrollTo(0, Math.max(0, Math.min(p.page, 100000)));
          if (list.current)
            list.current.scrollTop = Math.max(0, Math.min(p.list, 100000));
        }
      } catch {
        /* Use the top if storage is unavailable. */
      }
    }
    if (history.current && conversationId) {
      const first = lastConversation.current !== conversationId;
      lastConversation.current = conversationId;
      if (first && selected)
        document
          .getElementById(`message-${selected}`)
          ?.scrollIntoView({ block: "center" });
      else if (atBottom.current && !s.data.newer)
        history.current.scrollTop = history.current.scrollHeight;
    }
  }, [s.data, s.hidden, conversationId, positionKey, selected, atBottom]);
  useEffect(() => {
    if (s.hidden || !history.current || !s.data?.messages) return;
    const messages = new Map(s.data.messages.map((m) => [m.id, m]));
    let observer: IntersectionObserver;
    const observe = () => {
      observer?.disconnect();
      const nav = document.getElementById("platform-navigation"),
        viewport = window.visualViewport;
      const navHeight =
        nav && getComputedStyle(nav).position === "fixed"
          ? nav.getBoundingClientRect().height
          : 0;
      const covered = Math.max(
        navHeight,
        viewport ? innerHeight - viewport.height - viewport.offsetTop : 0
      );
      observer = new IntersectionObserver(
        (entries) => {
          if (document.visibilityState === "hidden" || !document.hasFocus())
            return;
          for (const entry of entries)
            if (entry.isIntersecting) {
              const message = messages.get(
                (entry.target as HTMLElement).dataset.messageEnd!
              );
              if (message) markVisible(message);
            }
        },
        { threshold: 1, rootMargin: `0px 0px -${Math.ceil(covered)}px 0px` }
      );
      history.current
        ?.querySelectorAll("[data-message-end]")
        .forEach((el) => observer.observe(el));
    };
    observe();
    window.addEventListener("resize", observe);
    window.visualViewport?.addEventListener("resize", observe);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", observe);
      window.visualViewport?.removeEventListener("resize", observe);
    };
  }, [s.hidden, s.data?.messages, markVisible]);
  const pager = (direction: "before" | "after", id: string) => {
    atBottom.current = false;
    void load({ [direction]: id }).then(() => {
      if (history.current) history.current.scrollTop = 0;
    });
  };
  return (
    <section
      className={`gc-messages ${conversationId ? "gc-messages-thread-view" : ""}`}
      aria-label="Private messages"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 pb-4">
        <h1 className="text-3xl">Messages</h1>
        <div className="flex flex-wrap gap-2">
          <Link
            prefetch={false}
            className="gc-button gc-button-primary"
            href="/platform/search?kind=people"
          >
            <Plus aria-hidden="true" size={18} />
            New message
          </Link>
          <Link
            prefetch={false}
            className="gc-button gc-button-quiet"
            href="/platform/messages/requests"
          >
            Requests
            {!s.hidden && s.data?.activity
              ? ` (${s.data.activity.pendingRequests})`
              : ""}
          </Link>
        </div>
      </header>
      <p className="gc-message-intro mb-3 text-sm text-gc-muted">
        Private conversations between eligible adults who accept contact. Start
        from a person’s profile. New contact defaults to off in{" "}
        <Link
          prefetch={false}
          className="underline"
          href="/platform/settings/privacy/messages"
        >
          Contact preferences
        </Link>
        .
      </p>
      <p role="status" aria-live="polite" className="mb-2">
        {s.hidden
          ? "Sign in with the original account and refresh to view these messages."
          : s.readError || s.notice}
      </p>
      <div className="mb-4 flex flex-wrap gap-2">
        <button
          className="gc-button gc-button-quiet"
          type="button"
          disabled={s.loading || s.busy}
          onClick={() => void load()}
        >
          Refresh messages
        </button>
        {s.pending && !s.hidden && (
          <button
            type="button"
            className="gc-button gc-button-primary"
            disabled={s.busy || !!s.waitingUntil}
            onClick={() => void send(s.pending!)}
          >
            Retry same action
          </button>
        )}
        {s.conflict && !s.pending && !s.hidden && s.data && (
          <button
            type="button"
            className="gc-button gc-button-quiet"
            disabled={s.busy}
            onClick={() =>
              setState((v) => ({
                ...v,
                conflict: false,
                notice:
                  "Current access loaded. Your unsent text is kept; review it before sending."
              }))
            }
          >
            Use current access
          </button>
        )}
        {(s.text || s.pending || s.conflict) && !s.hidden && (
          <button
            type="button"
            className="gc-button gc-button-quiet"
            disabled={s.busy}
            onClick={discard}
          >
            {s.pending ? "Clear local retry" : "Discard unsent text"}
          </button>
        )}
      </div>
      {!s.hidden && s.waitingUntil > 0 && (
        <p>
          Try again after {new Date(s.waitingUntil).toLocaleString()}. Your text
          is kept.
        </p>
      )}
      {!s.hidden && s.data && (
        <>
          {!s.data.available && (
            <p className="mb-4 rounded border p-3">
              New contact and sending are unavailable while reporting operations
              are being prepared. Existing history and your personal controls
              remain available.
            </p>
          )}
          <div
            className={`gc-message-columns ${conversationId ? "gc-message-open" : ""}`}
          >
            <aside className="gc-message-inbox" aria-label="Conversation inbox">
              <nav
                className="flex flex-wrap gap-4 border-b p-3"
                aria-label="Inbox views"
              >
                <Link
                  prefetch={false}
                  href="/platform/messages"
                  aria-current={!archived ? "page" : undefined}
                >
                  Recent
                </Link>
                <Link
                  prefetch={false}
                  href="/platform/messages?archived=true"
                  aria-current={archived ? "page" : undefined}
                >
                  Archived
                </Link>
              </nav>
              <div ref={list} className="gc-message-list">
                {s.data.conversations?.length ? (
                  s.data.conversations.map((row) => (
                    <ConversationLink
                      key={row.id}
                      row={row}
                      owner={owner}
                      selected={conversationId}
                      returnQuery={
                        back.includes("?") ? back.slice(back.indexOf("?")) : ""
                      }
                      onOpen={savePosition}
                    />
                  ))
                ) : (
                  <div className="p-5">
                    <MessageCircle aria-hidden="true" />
                    <h2 className="mt-2 text-xl">
                      {archived
                        ? "No archived conversations"
                        : "No conversations yet"}
                    </h2>
                    <p className="mt-2">
                      Review Requests, or open a person’s profile and choose
                      Message. Acceptance is required.
                    </p>
                  </div>
                )}
                {s.data.after && (
                  <Link
                    prefetch={false}
                    className="gc-button gc-button-quiet m-3"
                    href={inboxHref(archived, s.data.after)}
                  >
                    Older conversations
                  </Link>
                )}
              </div>
              {s.data.activity && (
                <details className="border-t p-3">
                  <summary>In-app alert choices</summary>
                  <p className="my-2 text-sm">
                    These choices affect your badges. They do not allow new
                    contacts, enable email or push, or hide pending decisions.
                  </p>
                  {(["requests", "messages"] as const).map((field) => (
                    <label key={field} className="my-3 flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={s.data!.activity!.preferences[field]}
                        disabled={busy || s.conflict}
                        onChange={(e) =>
                          act("alerts", {
                            requests: s.data!.activity!.preferences.requests,
                            messages: s.data!.activity!.preferences.messages,
                            [field]: e.target.checked,
                            expectedVersion:
                              s.data!.activity!.preferences.version
                          })
                        }
                      />
                      {field === "requests"
                        ? "Contact request alerts"
                        : "Message alerts"}
                    </label>
                  ))}
                </details>
              )}
            </aside>
            <div className="gc-message-thread" aria-label="Conversation">
              {conversation ? (
                <>
                  <header className="flex flex-wrap items-center justify-between gap-2 border-b p-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <Link
                        prefetch={false}
                        scroll={false}
                        href={back}
                        className="gc-icon-button"
                        aria-label="Back to Messages"
                      >
                        <ArrowLeft aria-hidden="true" />
                      </Link>
                      {conversation.person && (
                        <AuthorAvatar
                          id={conversation.person.id}
                          name={conversation.person.name}
                          owner={owner}
                        />
                      )}
                      <h2 className="text-xl">
                        {conversation.person ? (
                          <Link
                            prefetch={false}
                            href={`/platform/profile/${conversation.person.username}`}
                          >
                            {conversation.person.name}
                          </Link>
                        ) : (
                          "Unavailable account"
                        )}
                      </h2>
                    </div>
                    <div className="flex items-center gap-1">
                      {conversation.person && (
                        <RelationshipControls
                          compact
                          kind="person"
                          targetId={conversation.person.id}
                          name={conversation.person.name}
                          menuLabel="Contact options"
                        />
                      )}
                      <MoreActions label="Conversation options">
                        <button
                          disabled={busy || s.conflict}
                          onClick={() =>
                            act("mute", {
                              expectedVersion: conversation.preferences.version,
                              value: !conversation.preferences.muted
                            })
                          }
                        >
                          {conversation.preferences.muted
                            ? "Unmute conversation"
                            : "Mute conversation"}
                        </button>
                        <button
                          disabled={busy || s.conflict}
                          onClick={() =>
                            act("archive", {
                              expectedVersion: conversation.preferences.version,
                              value: !conversation.preferences.archived
                            })
                          }
                        >
                          {conversation.preferences.archived
                            ? "Return to inbox"
                            : "Archive conversation"}
                        </button>
                        <button
                          disabled={
                            busy || s.conflict || !s.data.messages?.length
                          }
                          onClick={() => {
                            const through = s.data?.messages?.at(-1);
                            if (
                              through &&
                              confirm(
                                "Hide messages through the last item on this page from your view? This does not erase the other person’s history or retract sent messages."
                              )
                            )
                              act("clear", {
                                expectedVersion:
                                  conversation.preferences.version,
                                through: through.id
                              });
                          }}
                        >
                          Clear this history for me
                        </button>
                      </MoreActions>
                    </div>
                  </header>
                  <div
                    ref={history}
                    className="gc-message-history"
                    onScroll={(e) => {
                      const el = e.currentTarget;
                      atBottom.current =
                        el.scrollHeight - el.scrollTop - el.clientHeight < 48;
                    }}
                  >
                    {s.data.context && (
                      <details className="mb-4 rounded border p-3">
                        <summary>Accepted contact purpose</summary>
                        <p className="mt-2 whitespace-pre-wrap break-words">
                          {s.data.context.purpose}
                        </p>
                        <Link
                          prefetch={false}
                          className="text-sm underline"
                          href={`/platform/messages/requests?id=${s.data.context.id}`}
                        >
                          View original request
                        </Link>
                      </details>
                    )}
                    {s.data.older && (
                      <button
                        type="button"
                        className="gc-button gc-button-quiet mb-3"
                        disabled={s.loading}
                        onClick={() => pager("before", s.data!.older!)}
                      >
                        Older messages
                      </button>
                    )}
                    {!s.data.messages?.length && (
                      <p className="p-3">
                        No messages in this view. Your accepted contact purpose
                        is kept above.
                      </p>
                    )}
                    {s.data.messages?.map((message) => (
                      <MessageRow
                        key={message.id}
                        message={message}
                        name={
                          conversation.person?.name ?? "the other participant"
                        }
                        selected={message.id === selected}
                      />
                    ))}
                    {s.data.newer && (
                      <button
                        type="button"
                        className="gc-button gc-button-primary my-3"
                        disabled={s.loading}
                        onClick={() => pager("after", s.data!.newer!)}
                      >
                        Newer messages
                      </button>
                    )}
                  </div>
                  <form
                    className="gc-message-composer"
                    aria-label="Send a message"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (
                        !busy &&
                        !s.conflict &&
                        conversation.sendingAllowed &&
                        s.text.trim()
                      ) {
                        atBottom.current = true;
                        act("send", {
                          expectedVersion: conversation.version,
                          content: s.text
                        });
                      }
                    }}
                  >
                    {!conversation.sendingAllowed && (
                      <p className="mb-2">
                        Sending is unavailable for this conversation. Your
                        unsent text is kept.{" "}
                        {s.data.available && conversation.person && (
                          <Link
                            prefetch={false}
                            className="underline"
                            href={`/platform/messages/requests?recipientId=${conversation.person.id}`}
                          >
                            Check current contact options
                          </Link>
                        )}
                      </p>
                    )}
                    <label className="block">
                      Your message
                      <textarea
                        aria-label="Your message"
                        className="mt-1 block w-full rounded border p-3"
                        value={s.text}
                        rows={3}
                        maxLength={4000}
                        disabled={busy}
                        onChange={(e) =>
                          setState((v) => ({
                            ...v,
                            text: e.target.value,
                            notice: "Message not sent."
                          }))
                        }
                      />
                    </label>
                    <div className="mt-2 flex items-center justify-between gap-3">
                      <p className="text-xs text-gc-muted">
                        {conversation.preferences.muted
                          ? "Conversation alerts muted. "
                          : ""}
                        Sent means saved here. Delivery and read receipts are
                        unavailable.
                      </p>
                      <button
                        className="gc-button gc-button-primary"
                        disabled={
                          busy ||
                          s.conflict ||
                          !conversation.sendingAllowed ||
                          !s.text.trim()
                        }
                      >
                        Send message
                      </button>
                    </div>
                  </form>
                </>
              ) : (
                <div className="gc-message-placeholder">
                  <MessageCircle size={36} aria-hidden="true" />
                  <h2 className="mt-3 text-2xl">Your conversations</h2>
                  <p className="mt-2">
                    Choose a conversation to read your previous messages.
                  </p>
                </div>
              )}
            </div>
          </div>
        </>
      )}
      {!s.hidden && !s.data && s.text && (
        <label className="block">
          Retained unsent message
          <textarea
            aria-label="Retained unsent message"
            className="mt-1 block w-full rounded border p-3"
            value={s.text}
            disabled={busy}
            onChange={(e) => setState((v) => ({ ...v, text: e.target.value }))}
          />
        </label>
      )}
    </section>
  );
}
