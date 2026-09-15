"use client";
import Link from "next/link";
import { useState } from "react";
import type { ChurchWelcomeHostView } from "@/lib/platform/church-welcome-host";
import { useWelcomeView } from "./use-welcome-view";
import { useUnsavedSocialWork } from "./use-unsaved-social-work";
import {
  welcomePurposes,
  type WelcomePurpose
} from "@/lib/platform/onboarding-options";
const button = "gc-button gc-button-quiet";
export function ChurchWelcomeHost({
  ownerId,
  churchId
}: {
  ownerId: string;
  churchId: string;
}) {
  const [query, setQuery] = useState(""),
    [choice, setChoice] = useState<string | null>(null),
    [address, setAddress] = useState(""),
    [baseVersion, setBaseVersion] = useState<number | null>(null),
    [formMessage, setFormMessage] = useState("");
  const state = useWelcomeView<ChurchWelcomeHostView>(
    "/api/platform/church-tools?view=welcome&churchId=" +
      encodeURIComponent(churchId) +
      query,
    ownerId
  );
  const { data, message, saving, save, refresh, unconfirmed, retry } = state;
  useUnsavedSocialWork(
    {
      dirty: baseVersion !== null,
      saving: false,
      conflict:
        !!data && baseVersion !== null && baseVersion !== data.welcomeVersion
    },
    () =>
      setFormMessage(
        "Save, retry or discard your local welcome choice before leaving."
      ),
    true
  );
  return (
    <div className="space-y-6">
      <h1>Church welcome and follow-up</h1>
      {message && <p role="status">{message}</p>}
      {formMessage && <p role="status">{formMessage}</p>}
      {baseVersion !== null && !unconfirmed && !saving && (
        <button
          type="button"
          className={button}
          onClick={() => {
            setBaseVersion(null);
            setChoice(null);
            setAddress("");
            setFormMessage("");
          }}
        >
          Discard local welcome choice
        </button>
      )}
      {unconfirmed && (
        <button
          className={button}
          disabled={saving}
          onClick={() =>
            void retry().then((ok) => {
              if (ok) {
                setBaseVersion(null);
                setChoice(null);
                setAddress("");
              }
            })
          }
        >
          Retry unconfirmed change
        </button>
      )}
      {!data ? (
        <div>
          <p>
            Current church tools are unavailable until your access is confirmed.
          </p>
          <button className={button} onClick={() => void refresh()}>
            Check current access
          </button>
        </div>
      ) : (
        <>
          <p className="text-xl">{data.church.name}</p>
          {data.canPublish && (
            <section className="space-y-3" aria-label="Approved church welcome">
              <h2 className="text-2xl">Start here post</h2>
              <p>
                Choose an existing published post speaking as this church. Its
                current audience still applies. Withdrawing or restricting the
                source removes it from ineligible Home views.
              </p>
              {data.welcome ? (
                <p>
                  Current:{" "}
                  <Link className="underline" href={data.welcome.href}>
                    {data.welcome.label}
                  </Link>
                </p>
              ) : (
                <p>No currently available welcome post is selected.</p>
              )}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  let postId = choice ?? data.welcome?.id ?? "";
                  if (address.trim()) {
                    try {
                      const url = new URL(address.trim());
                      const match =
                        /^\/platform\/posts\/([A-Za-z0-9_-]{1,100})\/?$/.exec(
                          url.pathname
                        );
                      if (
                        url.origin !== location.origin ||
                        !match ||
                        url.search ||
                        url.hash
                      )
                        throw Error();
                      postId = match[1];
                    } catch {
                      setFormMessage(
                        "Use a church post address from this website. The current welcome is unchanged."
                      );
                      return;
                    }
                  }
                  setFormMessage("");
                  void save({
                    operation: "welcome",
                    churchId,
                    postId: postId || null,
                    expectedVersion: baseVersion ?? data.welcomeVersion
                  }).then((ok) => {
                    if (ok) {
                      setBaseVersion(null);
                      setChoice(null);
                      setAddress("");
                    }
                  });
                }}
                className="space-y-3"
              >
                <label className="block font-semibold">
                  Choose a recent church post
                  <select
                    value={choice ?? data.welcome?.id ?? ""}
                    onChange={(e) => {
                      setChoice(e.target.value);
                      setAddress("");
                      setBaseVersion((v) => v ?? data.welcomeVersion);
                    }}
                    className="w-full rounded-lg border border-gc-divider p-3"
                    disabled={saving}
                  >
                    <option value="">No pinned welcome</option>
                    {data.welcome &&
                      !data.choices.some((p) => p.id === data.welcome!.id) && (
                        <option value={data.welcome.id}>
                          {data.welcome.label}
                        </option>
                      )}
                    {data.choices.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  Or enter an older church post’s address
                  <input
                    type="url"
                    className="mt-1 w-full rounded-lg border border-gc-divider p-3"
                    disabled={saving}
                    placeholder="https://godschurches.com/platform/posts/…"
                    value={address}
                    onChange={(e) => {
                      setAddress(e.target.value);
                      setBaseVersion((v) => v ?? data.welcomeVersion);
                    }}
                  />
                </label>

                {baseVersion !== null &&
                  baseVersion !== data.welcomeVersion && (
                    <div role="status">
                      <p>
                        The current welcome changed while you were choosing.
                        Review it above before applying your choice.
                      </p>
                      <button
                        type="button"
                        className={button}
                        disabled={saving}
                        onClick={() => setBaseVersion(data.welcomeVersion)}
                      >
                        I reviewed the current welcome
                      </button>
                    </div>
                  )}
                <button disabled={saving} className="gc-button" type="submit">
                  Save Start here post
                </button>
              </form>
              <Link
                className={button}
                href={"/platform/churches/" + churchId + "#church-posts"}
              >
                Write or review church posts
              </Link>
            </section>
          )}
          {data.host && (
            <>
              <section
                className="space-y-3"
                aria-label="Welcome follow-up queue"
              >
                <h2 className="text-2xl">Introductions and questions</h2>
                <p>
                  Only deliberately labeled, currently readable church posts
                  appear. Unanswered means no visible reply from another person
                  or church. Handled is a private operating note, not a public
                  score or a message.
                </p>
                <div className="flex gap-2">
                  <button
                    disabled={saving}
                    aria-pressed={data.queue === "unanswered"}
                    className={button}
                    onClick={() =>
                      setQuery(
                        "&queue=unanswered&from=" +
                          data.from +
                          "&until=" +
                          data.until
                      )
                    }
                  >
                    Unanswered
                  </button>
                  <button
                    disabled={saving}
                    aria-pressed={data.queue === "handled"}
                    className={button}
                    onClick={() =>
                      setQuery(
                        "&queue=handled&from=" +
                          data.from +
                          "&until=" +
                          data.until
                      )
                    }
                  >
                    Handled
                  </button>
                </div>
                {data.threads.length ? (
                  <ul className="space-y-4">
                    {data.threads.map((t) => (
                      <li
                        key={t.id}
                        className="rounded-lg border border-gc-divider p-3"
                      >
                        <p className="font-semibold">
                          {welcomePurposes[t.purpose as WelcomePurpose]}
                        </p>
                        <Link
                          className="inline-block min-h-11 py-2 underline"
                          href={t.href}
                        >
                          {t.label}
                        </Link>
                        <div>
                          <button
                            disabled={saving}
                            className={button}
                            onClick={() =>
                              void save({
                                operation: "handled",
                                churchId,
                                postId: t.id,
                                handled: !t.handled,
                                expectedVersion: t.version
                              })
                            }
                          >
                            {t.handled
                              ? "Reopen follow-up"
                              : "Mark follow-up handled"}
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>No {data.queue} threads on this page.</p>
                )}
                {data.nextCursor && (
                  <button
                    disabled={saving}
                    className={button}
                    onClick={() =>
                      setQuery(
                        "&queue=" +
                          data.queue +
                          "&from=" +
                          data.from +
                          "&until=" +
                          data.until +
                          "&after=" +
                          data.nextCursor
                      )
                    }
                  >
                    More threads
                  </button>
                )}
              </section>
              <section
                className="space-y-3"
                aria-label="Church participation totals"
              >
                <h2 className="text-2xl">Participation totals</h2>
                <form
                  className="flex flex-wrap items-end gap-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const fields = new FormData(e.currentTarget);
                    setQuery(
                      "&queue=" +
                        data.queue +
                        "&from=" +
                        fields.get("from") +
                        "&until=" +
                        fields.get("until")
                    );
                  }}
                >
                  <label>
                    From (UTC)
                    <input
                      required
                      disabled={saving}
                      type="date"
                      name="from"
                      defaultValue={data.from}
                      className="block max-w-full rounded-lg border border-gc-divider p-3"
                    />
                  </label>
                  <label>
                    Until, exclusive (UTC)
                    <input
                      required
                      disabled={saving}
                      type="date"
                      name="until"
                      defaultValue={data.until}
                      className="block max-w-full rounded-lg border border-gc-divider p-3"
                    />
                  </label>
                  <button className={button} disabled={saving}>
                    Apply dates
                  </button>
                </form>
                <p className="text-sm text-gc-muted">
                  Current visible posts published and replies created in this
                  range; current member ballots last saved in this range. RSVP
                  and volunteer totals cover currently published church events
                  starting in this range. Canceled events are excluded.
                  Confirmed volunteer reservations use the same active slots as
                  the existing participation tools. No reading, contact-list or
                  prayer-participant tracking.
                </p>
                {data.totals && (
                  <dl className="grid grid-cols-2 gap-3">
                    <dt>Posts</dt>
                    <dd>{data.totals.posts}</dd>
                    <dt>Replies</dt>
                    <dd>{data.totals.replies}</dd>
                    <dt>Current member poll ballots</dt>
                    <dd>{data.totals.ballots}</dd>
                    {data.totals.responses.map((r) => (
                      <div key={r.state} className="contents">
                        <dt>Member RSVPs · {r.state.toLowerCase()}</dt>
                        <dd>{r.count}</dd>
                      </div>
                    ))}
                    <dt>Confirmed volunteer places</dt>
                    <dd>{data.totals.confirmedVolunteers}</dd>
                    <dt>Open volunteer places</dt>
                    <dd>{data.totals.openVolunteerPlaces}</dd>
                  </dl>
                )}
              </section>
            </>
          )}
        </>
      )}
      <Link className={button} href={"/platform/churches/" + churchId}>
        Back to church
      </Link>
    </div>
  );
}
