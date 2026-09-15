"use client";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
  currentSocialOwner,
  socialRequest,
  SocialClientError
} from "@/lib/platform/social-client";
import {
  discoveryMode,
  DISCOVERY_RADII,
  DISCOVERY_TYPES,
  discoveryLanguages,
  GUEST_DISCOVERY_COOKIE,
  guestDiscoveryPreferences,
  parseDiscoveryPreferences,
  type DiscoveryPreferences
} from "@/lib/platform/discovery-options";
import {
  FEED_MODES,
  GUEST_FEED_COOKIE,
  feedChoices,
  feedMode,
  type FeedMode
} from "@/lib/platform/feed-options";
import { POST_TOPICS } from "@/lib/platform/post-options";
import { PortalError } from "@/lib/platform/portal-policy";
import type { getDiscoveryPreferences } from "@/lib/platform/discovery-preferences";
import {
  PrivateSnapshotGuard,
  usePrivateRecovery
} from "./private-snapshot-guard";
import { useUnsavedSocialWork } from "./use-unsaved-social-work";
import { settlePhotoNavigation } from "./use-photo-back-guard";
import { DiscoveryPlacePicker } from "./discovery-place-picker";
import { portalInputClass } from "./portal-action-form";

type SettingsData = Awaited<ReturnType<typeof getDiscoveryPreferences>>;
const cookie = (name: string) =>
  document.cookie
    .split("; ")
    .find((entry) => entry.startsWith(name + "="))
    ?.slice(name.length + 1);
export function DiscoverySettings({
  owner,
  initialMode,
  onSaved
}: {
  owner: string | null;
  initialMode?: FeedMode;
  onSaved?: (mode: FeedMode) => void;
}) {
  const [snapshot, setSnapshot] = useState<{
      data: SettingsData;
      checksum: string;
    } | null>(null),
    [error, setError] = useState(""),
    [unreadableGuest, setUnreadableGuest] = useState(false),
    [guestVisible, setGuestVisible] = useState(false);
  const generation = useRef(0);
  const load = useCallback(async () => {
    const seq = ++generation.current;
    setError("");
    setUnreadableGuest(false);
    try {
      let data: SettingsData;
      if (owner)
        data = (
          await socialRequest<SettingsData>(
            "/api/platform/discovery",
            undefined,
            owner
          )
        ).data;
      else {
        if ((await currentSocialOwner()) !== null)
          throw new SocialClientError(
            401,
            "Your sign-in changed. Reload before using guest choices."
          );
        data = {
          ownerId: "",
          preferences: guestDiscoveryPreferences(
            cookie(GUEST_DISCOVERY_COOKIE)
          ),
          version: 0,
          mode: feedMode(cookie(GUEST_FEED_COOKIE)) ?? "latest",
          feedVersion: 0,
          recoveryRequired: false,
          churches: [],
          place: null
        };
      }
      if (owner && data.ownerId !== owner)
        throw Error(
          "These choices belong to a different sign-in. Reload settings."
        );
      const hash = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(JSON.stringify(data))
      );
      if (seq === generation.current) {
        setSnapshot({
          data,
          checksum: Array.from(new Uint8Array(hash), (b) =>
            b.toString(16).padStart(2, "0")
          ).join("")
        });
        setGuestVisible(true);
      }
    } catch (e) {
      if (
        seq === generation.current &&
        !owner &&
        e instanceof PortalError &&
        e.status === 409
      )
        setUnreadableGuest(true);
      if (seq === generation.current)
        setError(
          e instanceof Error
            ? e.message
            : "Discovery settings could not be loaded."
        );
    }
  }, [owner]);
  useEffect(() => {
    void load();
    return () => {
      // Request generation counter, not a DOM ref.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      generation.current++;
    };
  }, [load]);
  useEffect(() => {
    if (owner) return;
    let active = true,
      seq = 0;
    const hide = () => {
      seq++;
      setGuestVisible(false);
    };
    const check = async () => {
      const n = ++seq;
      try {
        const current = await currentSocialOwner();
        if (active && n === seq) {
          setGuestVisible(current === null);
          if (current)
            setError(
              "Your sign-in changed. Reload before using these browser-only guest choices."
            );
        }
      } catch {
        if (active && n === seq) {
          setGuestVisible(false);
          setError(
            "Reconnect to check whether these guest choices still apply."
          );
        }
      }
    };
    const visible = () =>
      document.visibilityState === "hidden" ? hide() : void check();
    window.addEventListener("blur", hide);
    window.addEventListener("focus", check);
    window.addEventListener("online", check);
    window.addEventListener("offline", hide);
    document.addEventListener("visibilitychange", visible);
    return () => {
      active = false;
      window.removeEventListener("blur", hide);
      window.removeEventListener("focus", check);
      window.removeEventListener("online", check);
      window.removeEventListener("offline", hide);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [owner]);
  const form = snapshot && (
    <DiscoverySettingsForm
      key={snapshot.checksum}
      owner={owner}
      data={snapshot.data}
      initialMode={initialMode}
      onSaved={async (mode) => {
        if (onSaved) onSaved(mode);
        else await load();
      }}
    />
  );
  return (
    <section
      aria-label="Feed settings"
      className="my-4 rounded-xl border border-gc-border p-4 sm:p-5"
    >
      <h2 className="text-xl font-semibold">Feed settings</h2>
      {error && (
        <div className="my-3 space-y-2">
          <p role="status">{error}</p>
          {!snapshot && (
            <button
              type="button"
              className="gc-button gc-button-quiet"
              onClick={() => void load()}
            >
              Retry feed settings
            </button>
          )}
          {unreadableGuest && !owner && (
            <button
              type="button"
              className="gc-button gc-button-quiet"
              onClick={async () => {
                try {
                  if ((await currentSocialOwner()) !== null)
                    throw Error(
                      "Your sign-in changed. Reload before clearing guest choices."
                    );
                  document.cookie = `${GUEST_DISCOVERY_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax; Secure`;
                  if (cookie(GUEST_DISCOVERY_COOKIE))
                    throw Error(
                      "The browser did not clear these choices. Check cookie access and try again."
                    );
                  await load();
                } catch (e) {
                  setError(
                    e instanceof Error
                      ? e.message
                      : "Guest choices could not be cleared."
                  );
                }
              }}
            >
              Clear unreadable guest choices
            </button>
          )}
          {snapshot && !owner && (
            <button
              type="button"
              className="gc-button gc-button-quiet"
              onClick={async () => {
                flushSync(() => setSnapshot(null));
                await settlePhotoNavigation();
                location.reload();
              }}
            >
              Discard guest entries and reload
            </button>
          )}
        </div>
      )}
      {!snapshot && !error && (
        <p role="status">Loading your discovery choices…</p>
      )}
      {snapshot &&
        (owner ? (
          <PrivateSnapshotGuard
            owner={owner}
            url="/api/platform/discovery"
            checksum={snapshot.checksum}
            label="feed settings"
          >
            {form}
          </PrivateSnapshotGuard>
        ) : (
          <div hidden={!guestVisible} inert={!guestVisible ? true : undefined}>
            {form}
          </div>
        ))}
    </section>
  );
}
function TopicChoices({
  title,
  value,
  onChange
}: {
  title: string;
  value: string[];
  onChange: (value: string[]) => void;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="font-semibold">{title}</legend>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {POST_TOPICS.map((topic) => (
          <label key={topic} className="flex min-h-11 items-center gap-2">
            <input
              type="checkbox"
              checked={value.includes(topic)}
              onChange={(e) =>
                onChange(
                  e.target.checked
                    ? [...value, topic]
                    : value.filter((t) => t !== topic)
                )
              }
            />
            {topic}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
function DiscoverySettingsForm({
  owner,
  data,
  initialMode,
  onSaved
}: {
  owner: string | null;
  data: SettingsData;
  initialMode?: FeedMode;
  onSaved: (mode: FeedMode) => void | Promise<void>;
}) {
  const id = useId(),
    form = useRef<HTMLFormElement>(null),
    flight = useRef(false);
  const [prefs, setPrefs] = useState(data.preferences),
    [mode, setMode] = useState(initialMode ?? data.mode),
    [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false),
    [pending, setPending] = useState<string | null>(null),
    [conflict, setConflict] = useState(false),
    [message, setMessage] = useState(""),
    [presetName, setPresetName] = useState("");
  const [denominations, setDenominations] = useState(
      prefs.filters.denominations.join("\n")
    ),
    [hiddenWords, setHiddenWords] = useState(prefs.hiddenWords.join("\n"));
  const blocked = () =>
    setMessage(
      "Save, retry or discard your local feed choices before leaving."
    );
  useUnsavedSocialWork(
    { dirty, saving: busy || !!pending, conflict },
    blocked,
    true
  );
  const retry = useCallback(() => form.current?.requestSubmit(), []);
  usePrivateRecovery(id, !!pending, busy, retry);
  const change = (next: DiscoveryPreferences) => {
    setPrefs(next);
    setDirty(true);
  };
  const filters = (next: Partial<DiscoveryPreferences["filters"]>) =>
    change({ ...prefs, filters: { ...prefs.filters, ...next } });
  const lines = (value: string) =>
    value
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  function currentPreferences() {
    return parseDiscoveryPreferences({
      ...prefs,
      hiddenWords: lines(hiddenWords),
      filters: { ...prefs.filters, denominations: lines(denominations) }
    });
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (flight.current || conflict) return;
    flight.current = true;
    setBusy(true);
    setMessage("");
    try {
      const body =
        pending ??
        JSON.stringify({
          operation: "save",
          preferences: currentPreferences(),
          mode,
          expectedVersion: data.version,
          expectedFeedVersion: data.feedVersion,
          mutationId: crypto.randomUUID()
        });
      const request = JSON.parse(body);
      setPending(body);
      if (owner) {
        const { data: receipt } = await socialRequest<{
          id: string;
          version: number;
          message: string;
        }>("/api/platform/discovery", body, owner);
        if (receipt.id !== owner || !Number.isSafeInteger(receipt.version))
          throw new SocialClientError(
            503,
            "Your save was not confirmed. Retry the same choices."
          );
        setMessage(receipt.message);
      } else {
        if ((await currentSocialOwner()) !== null)
          throw new SocialClientError(
            401,
            "Your sign-in changed. Reload before saving guest choices."
          );
        const encoded = encodeURIComponent(JSON.stringify(request.preferences));
        if (encoded.length > 3500)
          throw new PortalError(
            400,
            "These guest choices exceed this browser cookie's space. Remove some presets or hidden phrases, or sign in to save fuller preferences."
          );
        document.cookie = `${GUEST_DISCOVERY_COOKIE}=${encoded}; Path=/; Max-Age=31536000; SameSite=Lax; Secure`;
        document.cookie = `${GUEST_FEED_COOKIE}=${request.mode}; Path=/; Max-Age=31536000; SameSite=Lax; Secure`;
        if (
          cookie(GUEST_DISCOVERY_COOKIE) !== encoded ||
          cookie(GUEST_FEED_COOKIE) !== request.mode
        )
          throw new SocialClientError(
            503,
            "This browser did not confirm saving your choices. Allow site cookies, then retry."
          );
        setMessage("Guest choices saved on this browser.");
      }
      flushSync(() => {
        setDirty(false);
        setPending(null);
        setBusy(false);
      });
      await settlePhotoNavigation();
      await onSaved(request.mode);
    } catch (error) {
      if (
        (error instanceof SocialClientError || error instanceof PortalError) &&
        [400, 403, 404, 409, 429].includes(error.status)
      ) {
        setPending(null);
        if ([403, 404, 409].includes(error.status)) setConflict(true);
      }
      setMessage(
        error instanceof Error
          ? error.message
          : "Your choices could not be confirmed. Retry the same save."
      );
    } finally {
      flight.current = false;
      setBusy(false);
    }
  }
  const advanced = discoveryMode(mode);
  return (
    <form
      ref={form}
      aria-label="Save feed settings"
      className="mt-4 space-y-4"
      onSubmit={(e) => void submit(e)}
      data-reader-dirty={dirty || !!pending}
      data-reader-busy={busy}
    >
      {data.recoveryRequired && (
        <p role="status">
          Newer saved choices were missing during recovery. Review this complete
          form and save before reopening a feed.
        </p>
      )}
      <p className="text-sm text-gc-muted">
        {owner
          ? "These reading preferences are private to your account."
          : "Guest choices stay on this browser and are not copied into a signed-in account."}{" "}
        Following and Favorites use your existing relationship choices; Your
        Church requires a current approved connection.
      </p>
      <fieldset
        disabled={busy || !!pending || conflict}
        className="min-w-0 space-y-4"
      >
        <label className="block font-semibold" htmlFor={`${id}-mode`}>
          Saved feed
        </label>
        <select
          id={`${id}-mode`}
          className={portalInputClass}
          value={mode}
          onChange={(e) => {
            setMode(e.target.value as FeedMode);
            setDirty(true);
          }}
        >
          {FEED_MODES.map((value) => (
            <option key={value} value={value}>
              {feedChoices[value].label}
            </option>
          ))}
        </select>
        <details open={!!advanced} className="space-y-4">
          <summary className="min-h-11 cursor-pointer py-2 font-semibold">
            Discovery filters and interests
          </summary>
          <p className="text-sm text-gc-muted">
            These advanced filters apply to For You, Following, Your Church,
            Churches, Local, Public and Favorites. Latest, Friends, Top This
            Week and Trending keep their existing ordering. Hidden words and
            topics below apply to all Home feeds.
          </p>
          <label className="block font-semibold" htmlFor={`${id}-church`}>
            Your selected approved church
          </label>
          <select
            id={`${id}-church`}
            className={portalInputClass}
            value={prefs.filters.homeChurchId ?? ""}
            onChange={(e) => filters({ homeChurchId: e.target.value || null })}
          >
            <option value="">No church selected</option>
            {prefs.filters.homeChurchId &&
              !data.churches.some(
                (church) => church.id === prefs.filters.homeChurchId
              ) && (
                <option value={prefs.filters.homeChurchId}>
                  Previous connection unavailable — choose again
                </option>
              )}
            {data.churches.map((church) => (
              <option key={church.id} value={church.id}>
                {church.name}
              </option>
            ))}
          </select>
          <label className="block font-semibold" htmlFor={`${id}-sort`}>
            Public discovery sort
          </label>
          <select
            id={`${id}-sort`}
            className={portalInputClass}
            value={prefs.filters.sort}
            onChange={(e) =>
              filters({ sort: e.target.value as typeof prefs.filters.sort })
            }
          >
            <option value="newest">Newest</option>
            <option value="relevant">Relevant to explicit interests</option>
            <option value="popular">
              Popular · posts and eligible Likes in the last 7 days
            </option>
          </select>
          <p className="text-sm text-gc-muted">
            For You uses Relevant. Following, Your Church and Favorites use
            Newest. Popular does not rank prayer posts or private engagement.
          </p>
          <label className="block font-semibold" htmlFor={`${id}-geography`}>
            Geographic scope
          </label>
          <select
            id={`${id}-geography`}
            className={portalInputClass}
            value={mode === "local" ? "local" : prefs.filters.geography}
            disabled={mode === "local"}
            onChange={(e) =>
              filters({
                geography: e.target.value as typeof prefs.filters.geography
              })
            }
          >
            <option value="worldwide">Worldwide</option>
            <option value="country">Selected country only</option>
            <option value="local">Around a selected town or area</option>
          </select>
          <DiscoveryPlacePicker
            country={prefs.filters.country}
            placeId={prefs.filters.placeId}
            onCountry={(country) => filters({ country, placeId: null })}
            onPlace={(placeId) => filters({ placeId })}
          />
          <label className="block font-semibold" htmlFor={`${id}-radius`}>
            Approximate distance between town centers
          </label>
          <select
            id={`${id}-radius`}
            className={portalInputClass}
            value={prefs.filters.radiusKm}
            onChange={(e) =>
              filters({
                radiusKm: Number(
                  e.target.value
                ) as typeof prefs.filters.radiusKm
              })
            }
          >
            {DISCOVERY_RADII.map((km) => (
              <option key={km} value={km}>
                {km} km · about {Math.round(km * 0.621371)} miles
              </option>
            ))}
          </select>
          <label className="flex min-h-11 items-start gap-2">
            <input
              type="checkbox"
              checked={prefs.filters.expand}
              onChange={(e) => filters({ expand: e.target.checked })}
            />
            <span>
              Allow geographic expansion: wider region, national, then
              worldwide. Keep every denomination, language, topic, type and
              hidden choice.
            </span>
          </label>
          <p className="text-sm text-gc-muted">
            Leave this off for strict / Only matching. Expansion never infers or
            adds a related tradition. Discovery places nearer stages first;
            Following, Your Church and Favorites stay newest first, with each
            geographic stage labeled.
          </p>
          <label className="block font-semibold" htmlFor={`${id}-traditions`}>
            Exactly these self-declared denominations or traditions
          </label>
          <textarea
            id={`${id}-traditions`}
            rows={3}
            className={portalInputClass}
            value={denominations}
            onChange={(e) => {
              setDenominations(e.target.value);
              setDirty(true);
            }}
          />
          <p className="text-sm text-gc-muted">
            One per line, up to ten. Leave blank for All. A selected tradition
            excludes unclassified posts. Only case, spacing and
            “non-denominational” spelling variants are normalized.
          </p>
          <label className="block font-semibold" htmlFor={`${id}-languages`}>
            Reading languages
          </label>
          <select
            id={`${id}-languages`}
            multiple
            size={5}
            className={portalInputClass}
            value={prefs.filters.languages}
            onChange={(e) =>
              filters({
                languages: Array.from(
                  e.target.selectedOptions,
                  (option) => option.value
                )
              })
            }
          >
            {discoveryLanguages.map((language) => (
              <option key={language.id} value={language.id}>
                {language.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="min-h-11 underline"
            onClick={() => filters({ languages: [] })}
          >
            Use all languages
          </button>
          <p className="text-sm text-gc-muted">
            Select up to ten. No selected language means All; language does not
            change your country or tradition filters.
          </p>
          <label className="flex min-h-11 items-center gap-2">
            <input
              type="checkbox"
              checked={prefs.filters.includeUnknownLanguage}
              onChange={(e) =>
                filters({ includeUnknownLanguage: e.target.checked })
              }
            />
            Include posts with unclassified language
          </label>
          <TopicChoices
            title="Only posts with these author-selected topics (none means All)"
            value={prefs.filters.topics}
            onChange={(topics) => filters({ topics })}
          />
          <fieldset>
            <legend className="font-semibold">
              Post types (none means All)
            </legend>
            <div className="flex flex-wrap gap-x-4">
              {DISCOVERY_TYPES.map((type) => (
                <label key={type} className="flex min-h-11 items-center gap-2">
                  <input
                    type="checkbox"
                    checked={prefs.filters.types.includes(type)}
                    onChange={(e) =>
                      filters({
                        types: e.target.checked
                          ? [...prefs.filters.types, type]
                          : prefs.filters.types.filter((item) => item !== type)
                      })
                    }
                  />
                  {
                    {
                      TESTIMONY: "Testimony",
                      PRAYER: "Prayer",
                      TEACHING: "Teaching",
                      UPDATE: "Updates",
                      NEED: "Serving / needs",
                      EVENT: "Events"
                    }[type]
                  }
                </label>
              ))}
            </div>
          </fieldset>
          <TopicChoices
            title="Interests for Relevant and For You (these add weight, not a hard filter)"
            value={prefs.interests}
            onChange={(interests) => change({ ...prefs, interests })}
          />
        </details>
        <details className="space-y-4">
          <summary className="min-h-11 cursor-pointer py-2 font-semibold">
            Hidden words, hidden topics and recommendation feedback
          </summary>
          <label className="block font-semibold" htmlFor={`${id}-hidden`}>
            Hidden words or phrases
          </label>
          <textarea
            id={`${id}-hidden`}
            rows={4}
            className={portalInputClass}
            value={hiddenWords}
            onChange={(e) => {
              setHiddenWords(e.target.value);
              setDirty(true);
            }}
          />
          <p className="text-sm text-gc-muted">
            Up to twenty literal entries, one per line. Matching ignores letter
            case in post text, visible captions, link text and author-selected
            tags. It does not infer synonyms or read text inside images. These
            are feed convenience filters; direct links and access permissions
            are separate.
          </p>
          <TopicChoices
            title="Hidden topics"
            value={prefs.hiddenTopics}
            onChange={(hiddenTopics) => change({ ...prefs, hiddenTopics })}
          />
          <p>
            Recommendation feedback:{" "}
            {Object.entries(prefs.feedback).length
              ? Object.entries(prefs.feedback)
                  .map(
                    ([topic, weight]) =>
                      `${weight === 1 ? "more" : "less"} ${topic}`
                  )
                  .join(", ")
              : "No More/Less choices saved."}
          </p>
          <button
            type="button"
            className="gc-button gc-button-quiet"
            onClick={() => change({ ...prefs, feedback: {} })}
          >
            Reset recommendation feedback
          </button>
          <p className="text-sm text-gc-muted">
            Save to apply this reset. It clears only More/Less weights; it keeps
            your filters, follows, favorites, blocks, bookmarks and church
            membership.
          </p>
        </details>
        <details className="space-y-3">
          <summary className="min-h-11 cursor-pointer py-2 font-semibold">
            Saved strict or expanded presets
          </summary>
          {prefs.presets.map((preset) => (
            <div
              key={preset.id}
              className="space-y-2 rounded-lg border border-gc-border p-3"
            >
              <label className="block text-sm">
                Preset name
                <input
                  className={portalInputClass}
                  value={preset.name}
                  onChange={(e) =>
                    change({
                      ...prefs,
                      presets: prefs.presets.map((p) =>
                        p.id === preset.id ? { ...p, name: e.target.value } : p
                      )
                    })
                  }
                />
              </label>
              <p className="text-sm">
                {feedChoices[preset.mode].label} ·{" "}
                {preset.filters.expand
                  ? "Explicit geographic expansion"
                  : "Strict / Only"}
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="gc-button gc-button-quiet"
                  onClick={() => {
                    setMode(preset.mode);
                    setDenominations(preset.filters.denominations.join("\n"));
                    change({
                      ...prefs,
                      filters: structuredClone(preset.filters)
                    });
                  }}
                >
                  Use this preset
                </button>
                <button
                  type="button"
                  className="min-h-11 underline"
                  onClick={() =>
                    change({
                      ...prefs,
                      presets: prefs.presets.filter((p) => p.id !== preset.id)
                    })
                  }
                >
                  Remove preset
                </button>
              </div>
            </div>
          ))}
          <label className="block font-semibold" htmlFor={`${id}-preset`}>
            Name the current discovery choices
          </label>
          <input
            id={`${id}-preset`}
            className={portalInputClass}
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
          />
          <button
            type="button"
            className="gc-button gc-button-quiet"
            onClick={() => {
              try {
                const current = currentPreferences(),
                  selected = discoveryMode(mode);
                if (!selected)
                  throw Error(
                    "Choose a discovery feed before making a preset."
                  );
                if (!presetName.trim() || current.presets.length >= 6)
                  throw Error("Name this preset and keep up to six presets.");
                change({
                  ...current,
                  presets: [
                    ...current.presets,
                    {
                      id: crypto.randomUUID(),
                      name: presetName.trim(),
                      mode: selected,
                      filters: structuredClone(current.filters)
                    }
                  ]
                });
                setPresetName("");
              } catch (e) {
                setMessage(
                  e instanceof Error ? e.message : "Check this preset."
                );
              }
            }}
          >
            Add current choices as preset
          </button>
          <p className="text-sm text-gc-muted">
            Use a preset to fill this form, then Save. Changing or removing a
            preset does not change your follows, favorites or membership.
          </p>
        </details>
      </fieldset>
      <p role="status">{busy ? "Confirming your feed choices…" : message}</p>
      <div className="flex flex-wrap gap-2">
        <button type="submit" className="gc-button" disabled={busy || conflict}>
          {pending ? "Retry the same feed settings" : "Save feed settings"}
        </button>
        {(dirty || conflict) && !pending && !busy && (
          <button
            type="button"
            className="gc-button gc-button-quiet"
            onClick={async () => {
              flushSync(() => {
                setDirty(false);
                setConflict(false);
              });
              await settlePhotoNavigation();
              location.reload();
            }}
          >
            Discard local choices and reload
          </button>
        )}
      </div>
      <a
        href="/platform"
        className="inline-flex min-h-11 items-center underline"
      >
        Open your saved feed
      </a>
    </form>
  );
}
