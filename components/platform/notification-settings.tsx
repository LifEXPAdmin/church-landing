"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { socialRequest, SocialClientError } from "@/lib/platform/social-client";
import type {
  readNotificationPreferences,
  NotificationCategory
} from "@/lib/platform/notification-preferences";
import type { readPushSubscriptions } from "@/lib/platform/push-subscriptions";
import {
  browserPushSupport,
  savedBrowserDevice,
  rememberBrowserDevice,
  newBrowserBinding,
  subscribeBrowser,
  forgetBrowserPush
} from "@/lib/platform/push-browser";
import { InstallationHelp } from "./installation-help";
import { useUnsavedSocialWork } from "./use-unsaved-social-work";
type View = Awaited<ReturnType<typeof readNotificationPreferences>>;
type Devices = Awaited<ReturnType<typeof readPushSubscriptions>>;
type Choices = View["preferences"];
const labels: Record<NotificationCategory, string> = {
  messages: "Personal messages and replies",
  requests: "Contact requests and acceptances",
  reports: "Reports, reconsideration and your content decisions",
  founder: "Founder announcements",
  replies: "Replies to your posts and comments",
  mentions: "Mentions in comments",
  conversations: "Replies in conversations you follow"
};
const categories = Object.keys(labels) as NotificationCategory[];
const endpoint = "/api/platform/notifications";
const time = (v: number) =>
  `${Math.floor(v / 60)
    .toString()
    .padStart(2, "0")}:${(v % 60).toString().padStart(2, "0")}`;
const minutes = (v: string) => {
  const [h, m] = v.split(":").map(Number);
  return Number.isFinite(h + m) ? h * 60 + m : 0;
};
export function NotificationSettings({ owner }: { owner: string }) {
  const router = useRouter();
  const [view, setView] = useState<View | null>(null),
    [fields, setFields] = useState<Choices | null>(null),
    [devices, setDevices] = useState<Devices | null>(null);
  const [testId, setTestId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false),
    [pending, setPending] = useState<string | null>(null),
    [conflict, setConflict] = useState(false),
    [message, setMessage] = useState("");
  const [support, setSupport] = useState({
      available: false,
      reason: "Checking this browser."
    }),
    [currentId, setCurrentId] = useState<string | null>(null);
  const dirty =
    !!fields && JSON.stringify(fields) !== JSON.stringify(view?.preferences);
  const current = useRef({ dirty, fields, pending });
  current.current = { dirty, fields, pending };
  const generation = useRef(0),
    inFlight = useRef(false);
  useUnsavedSocialWork(
    { dirty, saving: busy || !!pending, conflict },
    () => setMessage("Save or resolve notification changes before leaving."),
    true
  );
  const load = useCallback(
    async (replace = false) => {
      const seq = ++generation.current;
      try {
        const data = (await socialRequest<View>(endpoint, undefined, owner))
          .data;
        if (seq !== generation.current) return;
        setView(data);
        if (replace || (!current.current.dirty && !current.current.pending)) {
          setFields(data.preferences);
          setConflict(false);
        } else if (
          current.current.fields?.version !== data.preferences.version &&
          !current.current.pending
        )
          setConflict(true);
        setSupport(browserPushSupport());
        if (data.channels.push) {
          const found = (
            await socialRequest<Devices>(
              endpoint + "?view=devices",
              undefined,
              owner
            )
          ).data;
          if (seq !== generation.current) return;
          setDevices(found);
          const saved = savedBrowserDevice();
          setCurrentId(
            saved?.owner === owner &&
              found.devices.some((d) => d.id === saved.id)
              ? saved.id!
              : null
          );
        } else {
          setDevices(null);
          setCurrentId(null);
        }
      } catch (error) {
        if (seq !== generation.current) return;
        setMessage(
          error instanceof Error
            ? error.message
            : "Notification settings could not be loaded."
        );
        if (error instanceof SocialClientError && error.status === 401) {
          setView(null);
          setFields(null);
          setDevices(null);
          setPending(null);
          router.refresh();
        }
      }
    },
    [owner, router]
  );
  useEffect(() => {
    void load();
    const refresh = () => {
      if (document.visibilityState !== "hidden" && !inFlight.current)
        void load();
    };
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    return () => {
      // Request generation counter, not a DOM ref.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      generation.current++;
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
    };
  }, [load]);
  async function act(makeBody: () => string | Promise<string>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setMessage("");
    let body: string | null = pending;
    try {
      body ??= await makeBody();
      setPending(body);
      const input = JSON.parse(body),
        { data } = await socialRequest<{
          id: string;
          version: number;
          message: string;
        }>(endpoint, body, owner);
      // A server acknowledgement ends the exact-body retry even if local device
      // storage becomes unavailable afterward.
      setPending(null);
      if (input.operation === "test") setTestId(data.id);
      if (input.operation === "subscribe") {
        try {
          rememberBrowserDevice({
            owner,
            binding: input.binding,
            id: data.id,
            version: data.version
          });
        } catch {
          setMessage(
            "This device was enabled, but this browser could not remember its local association. You can remove it from the device list below."
          );
          await load(true);
          return;
        }
      }
      if (
        input.operation === "unsubscribe" &&
        savedBrowserDevice()?.id === input.id
      )
        await forgetBrowserPush();
      setMessage(data.message);
      await load(true);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "This change could not be confirmed. Retry the same request."
      );
      if (
        error instanceof SocialClientError &&
        [400, 401, 403, 404, 409, 429].includes(error.status)
      ) {
        setPending(null);
        if (error.status === 401) {
          setView(null);
          setFields(null);
          setDevices(null);
          router.refresh();
        } else if (error.status === 409) {
          setConflict(
            body ? JSON.parse(body).operation === "preferences" : false
          );
          await load();
        }
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  const serialize = (operation: string, extra: object = {}) =>
    JSON.stringify({
      operation,
      ownerId: owner,
      mutationId: crypto.randomUUID(),
      ...extra
    });
  const change = (next: Choices) => {
    setFields(next);
    setMessage("");
  };
  return (
    <div className="gc-settings space-y-6" aria-busy={busy}>
      <p role="status">
        {message ||
          (!view
            ? "Loading notification choices…"
            : "Your choices are private to your account.")}
      </p>
      {!view && (
        <button type="button" className="gc-button" onClick={() => void load()}>
          Retry notification settings
        </button>
      )}
      {pending && (
        <div>
          <p>
            The last request needs confirmation. Its exact contents are
            preserved in this tab.
          </p>
          <button
            type="button"
            className="gc-button"
            disabled={busy}
            onClick={() => void act(() => pending)}
          >
            Retry last notification action
          </button>
        </div>
      )}
      {view && fields && (
        <>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void act(() =>
                serialize("preferences", {
                  expectedVersion: fields.version,
                  inApp: fields.inApp,
                  pushCategories: fields.pushCategories,
                  quietHours: fields.quietHours
                })
              );
            }}
          >
            <fieldset
              disabled={busy || !!pending || conflict}
              className="space-y-5"
            >
              <legend className="text-xl">Categories and channels</legend>
              {categories.map((category) => (
                <fieldset
                  key={category}
                  className="rounded-lg border border-gc-divider p-3"
                >
                  <legend>{labels[category]}</legend>
                  {category !== "replies" &&
                  category !== "mentions" &&
                  category !== "conversations" ? (
                    <label className="flex min-h-11 items-center gap-3">
                      <input
                        type="checkbox"
                        checked={fields.inApp[category]}
                        onChange={(event) =>
                          change({
                            ...fields,
                            inApp: {
                              ...fields.inApp,
                              [category]: event.target.checked
                            }
                          })
                        }
                      />
                      {category === "founder"
                        ? "Receive founder announcements"
                        : "In-app alerts"}
                    </label>
                  ) : (
                    <p className="text-sm text-gc-muted">
                      {category === "conversations"
                        ? "Follow a conversation on its post to receive new replies in Activity. Phone alerts are optional and start after you enable this choice."
                        : "Comments remain available on their post."}{" "}
                      Mute a conversation there to stop its Activity and phone
                      alerts.
                    </p>
                  )}
                  <label className="flex min-h-11 items-center gap-3">
                    <input
                      type="checkbox"
                      checked={fields.pushCategories.includes(category)}
                      disabled={
                        !view.channels.push &&
                        !fields.pushCategories.includes(category)
                      }
                      onChange={(event) =>
                        change({
                          ...fields,
                          pushCategories: event.target.checked
                            ? [...fields.pushCategories, category]
                            : fields.pushCategories.filter(
                                (c) => c !== category
                              )
                        })
                      }
                    />
                    Phone alerts
                    {!view.channels.push && " — currently unavailable"}
                  </label>
                  {category === "founder" && (
                    <p className="text-sm text-gc-muted">
                      Turning these off keeps personal messages and replies
                      enabled. The initial welcome is separate.
                    </p>
                  )}
                  {category === "reports" && (
                    <p className="text-sm text-gc-muted">
                      Only an appointed reviewer receives report alerts.
                    </p>
                  )}
                </fieldset>
              ))}
              <p>
                Email and SMS social alerts are unavailable. Account
                verification and recovery emails stay separate. Following
                someone does not enable phone alerts.
              </p>
              <fieldset className="space-y-3">
                <legend className="text-xl">Quiet hours</legend>
                <label className="flex min-h-11 items-center gap-3">
                  <input
                    type="checkbox"
                    checked={!!fields.quietHours}
                    onChange={(event) =>
                      change({
                        ...fields,
                        quietHours: event.target.checked
                          ? {
                              start: 1320,
                              end: 420,
                              timeZone:
                                Intl.DateTimeFormat().resolvedOptions().timeZone
                            }
                          : null
                      })
                    }
                  />
                  Pause phone alerts during quiet hours
                </label>
                {fields.quietHours && (
                  <>
                    <label className="block">
                      Start
                      <input
                        className="block"
                        type="time"
                        required
                        value={time(fields.quietHours.start)}
                        onChange={(event) =>
                          change({
                            ...fields,
                            quietHours: {
                              ...fields.quietHours!,
                              start: minutes(event.target.value)
                            }
                          })
                        }
                      />
                    </label>
                    <label className="block">
                      End
                      <input
                        className="block"
                        type="time"
                        required
                        value={time(fields.quietHours.end)}
                        onChange={(event) =>
                          change({
                            ...fields,
                            quietHours: {
                              ...fields.quietHours!,
                              end: minutes(event.target.value)
                            }
                          })
                        }
                      />
                    </label>
                    <label className="block">
                      Time zone
                      <input
                        className="block w-full"
                        required
                        maxLength={100}
                        value={fields.quietHours.timeZone}
                        placeholder="America/Chicago"
                        onChange={(event) =>
                          change({
                            ...fields,
                            quietHours: {
                              ...fields.quietHours!,
                              timeZone: event.target.value
                            }
                          })
                        }
                      />
                    </label>
                    <p aria-live="polite">
                      Phone alerts pause from {time(fields.quietHours.start)} to{" "}
                      {time(fields.quietHours.end)}
                      {fields.quietHours.end < fields.quietHours.start
                        ? " the next day"
                        : " the same day"}{" "}
                      in {fields.quietHours.timeZone || "your chosen time zone"}
                      .
                      {fields.quietHours.start === fields.quietHours.end &&
                        " Choose different start and end times."}{" "}
                      These hours apply to every phone-alert category.
                    </p>
                  </>
                )}
                <p className="text-sm text-gc-muted">
                  Use an IANA zone such as America/Chicago. Daylight-saving
                  changes are handled in that zone. In-app messages remain
                  available.
                </p>
              </fieldset>
              <button type="submit" className="gc-button" disabled={!dirty}>
                Save notification choices
              </button>
            </fieldset>
          </form>
          {conflict && (
            <div>
              <p>
                These choices changed elsewhere. Your selections are preserved.
              </p>
              <button
                type="button"
                className="gc-button"
                onClick={() => {
                  setFields({ ...fields, version: view.preferences.version });
                  setConflict(false);
                }}
              >
                Keep my selections using the current version
              </button>
            </div>
          )}
          {dirty && !pending && (
            <button
              type="button"
              className="gc-button gc-button-quiet"
              disabled={busy}
              onClick={() => void load(true)}
            >
              Discard unsaved notification choices
            </button>
          )}
          <section aria-label="Phone notifications" className="space-y-3">
            <h2 className="text-xl">This phone or browser</h2>
            <p>
              {view.channels.push
                ? support.reason
                : "Phone delivery is unavailable for this account right now. Email verification and adult setup are required, and the service must be enabled."}
            </p>
            <p>
              Enable notifications adds phone alerts for personal messages and
              contact requests on this device. Lock-screen text is generic. Save
              any edited choices first; you can adjust the categories afterward.
            </p>
            <button
              type="button"
              className="gc-button"
              disabled={
                !view.channels.push ||
                !support.available ||
                busy ||
                !!pending ||
                dirty ||
                conflict
              }
              onClick={() =>
                void act(async () => {
                  if (!devices?.publicKey)
                    throw Error("Check notification availability again.");
                  const binding =
                    savedBrowserDevice()?.owner === owner
                      ? savedBrowserDevice()!.binding
                      : newBrowserBinding();
                  rememberBrowserDevice({ owner, binding });
                  const subscription = await subscribeBrowser(
                    devices.publicKey
                  );
                  return serialize("subscribe", {
                    binding,
                    subscription,
                    label: /iPhone/.test(navigator.userAgent)
                      ? "iPhone"
                      : /Android/.test(navigator.userAgent)
                        ? "Android phone"
                        : "Web browser",
                    enableMessages: true,
                    expectedNotificationVersion: view.preferences.version
                  });
                })
              }
            >
              {currentId ? "Renew this device" : "Enable notifications"}
            </button>
            <button
              type="button"
              className="gc-button gc-button-quiet"
              disabled={busy}
              onClick={() => void load()}
            >
              Check browser and service
            </button>
            {currentId && (
              <button
                type="button"
                className="gc-button"
                disabled={busy || !!pending || dirty}
                onClick={() =>
                  void act(() =>
                    serialize("test", {
                      id: currentId,
                      expectedVersion: devices!.devices.find(
                        (d) => d.id === currentId
                      )!.version
                    })
                  )
                }
              >
                Send me a test notification
              </button>
            )}
            {testId && (
              <button
                type="button"
                className="gc-button gc-button-quiet"
                disabled={busy}
                onClick={async () => {
                  try {
                    const result = await socialRequest<{ message: string }>(
                      endpoint + "?view=test&id=" + encodeURIComponent(testId),
                      undefined,
                      owner
                    );
                    setMessage(result.data.message);
                  } catch (error) {
                    setMessage(
                      error instanceof Error
                        ? error.message
                        : "Test status could not be checked."
                    );
                  }
                }}
              >
                Check test delivery status
              </button>
            )}
            <InstallationHelp compact />
            <p className="text-sm text-gc-muted">
              On Android, use a current supported browser such as Chrome. On
              iPhone, open the Home Screen web app before enabling
              notifications. Phone Focus settings, quiet hours, muted
              conversations and connection state can delay or suppress an alert.
            </p>
            {devices?.devices.length ? (
              <ul>
                {devices.devices.map((device) => (
                  <li
                    key={device.id}
                    className="flex flex-wrap items-center gap-3 py-2"
                  >
                    <span>
                      {device.label}
                      {device.id === currentId ? " — this browser" : ""}
                    </span>
                    <button
                      type="button"
                      className="gc-button gc-button-quiet"
                      disabled={busy || !!pending || dirty}
                      onClick={() =>
                        void act(() =>
                          serialize("unsubscribe", {
                            id: device.id,
                            expectedVersion: device.version
                          })
                        )
                      }
                    >
                      Remove {device.label}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p>No enabled device is confirmed for this sign-in.</p>
            )}
            <p>
              Removing a device stops future sends and removes its stored
              notification keys. Logging out removes this session’s device
              associations.
            </p>
          </section>
          <p>
            <Link className="underline" href="/platform/messages">
              Open messages and conversation mute controls
            </Link>
          </p>
        </>
      )}
    </div>
  );
}
