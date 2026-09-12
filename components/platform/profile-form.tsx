"use client";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { accountInputClass } from "./account-form";
import type { ProfileEditorView } from "@/lib/platform/profiles";
import {
  PROFILE_BACKGROUNDS,
  PROFILE_ORDERS,
  PROFILE_PALETTES
} from "@/lib/platform/profile-style";
export function ProfileForm({
  profile,
  imagesPending,
  onDirty,
  onBusy,
  onSaved
}: {
  profile: ProfileEditorView;
  imagesPending: boolean;
  onDirty: (dirty: boolean) => void;
  onBusy: (busy: boolean) => void;
  onSaved: () => void;
}) {
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const feedback = useRef<HTMLParagraphElement>(null);
  const latestHeading = useRef<HTMLHeadingElement>(null);
  const [version, setVersion] = useState(profile.presentation.version);
  const [palette, setPalette] = useState(profile.presentation.palette),
    [background, setBackground] = useState(profile.presentation.background);
  const [conflict, setConflict] = useState(false),
    [latest, setLatest] = useState<ProfileEditorView | null>(null);
  async function reviewSaved() {
    setPending(true);
    onBusy(true);
    try {
      const response = await fetch("/api/platform/profile", {
        cache: "no-store"
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          result.message ?? "The saved profile could not be loaded."
        );
      setLatest(result);
      requestAnimationFrame(() => latestHeading.current?.focus());
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The saved profile could not be loaded."
      );
    } finally {
      setPending(false);
      onBusy(false);
    }
  }
  return (
    <form
      id="account-profile-form"
      method="post"
      action="/api/platform/account"
      className="mx-auto max-w-3xl space-y-5 rounded-xl border border-gc-divider bg-gc-surface p-5 text-gc-text sm:p-8"
      aria-busy={pending}
      onChangeCapture={() => onDirty(true)}
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy.current || imagesPending) return;
        busy.current = true;
        setPending(true);
        onBusy(true);
        setMessage("");
        setConflict(false);
        setLatest(null);
        const fields = Object.fromEntries(new FormData(event.currentTarget));
        try {
          const response = await fetch("/api/platform/account", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...fields,
              expectedVersion: version,
              operation: "update-profile"
            })
          });
          const result = await response.json();
          if (
            response.ok &&
            typeof result.redirect === "string" &&
            result.redirect.startsWith("/platform/profile/")
          ) {
            onSaved();
            onDirty(false);
            window.location.replace(result.redirect);
            return;
          }
          setMessage(
            `${result.message ?? "Your changes were not confirmed."} Reference: ${response.headers.get("X-Account-Request-Id") ?? "unavailable"}`
          );
          setConflict(response.status === 409);
        } catch {
          setMessage(
            "We could not confirm the save. Check your connection and try again. Your edits are still here."
          );
        } finally {
          busy.current = false;
          setPending(false);
          onBusy(false);
          requestAnimationFrame(() => feedback.current?.focus());
        }
      }}
    >
      <fieldset disabled={pending} className="min-w-0 space-y-5">
        <legend className="sr-only">Profile details and appearance</legend>
        <div>
          <h2 className="text-3xl text-gc-text">
            Profile details and appearance
          </h2>
          <p className="mt-3 text-gc-muted">
            Share only what you want other members to see. Your name and
            username identify public posts and comments; viewing your other
            profile details requires sign-in. Your account email and church
            directory choices are separate.
          </p>
        </div>
        <input type="hidden" name="expectedVersion" value={version} />
        <fieldset className="min-w-0 space-y-4">
          <legend className="text-2xl">Identity</legend>
          <p className="text-sm text-gc-muted">
            Name is the only required profile field. Use 2 to 100 characters.
            Your username is @{profile.username}; it cannot be changed here.
          </p>
          <div>
            <label htmlFor="profile-name">Name (required)</label>
            <input
              id="profile-name"
              name="name"
              required
              minLength={2}
              maxLength={100}
              autoComplete="name"
              defaultValue={profile.name}
              className={accountInputClass}
            />
          </div>
        </fieldset>
        <fieldset className="min-w-0 space-y-4">
          <legend className="text-2xl">Introduction and about you</legend>
          <p className="text-sm text-gc-muted">
            Everything in this section is optional and visible to permitted
            signed-in members. Leave any field empty if you prefer.
          </p>
          <div>
            <label htmlFor="profile-bio">Bio (optional)</label>
            <textarea
              id="profile-bio"
              name="bio"
              rows={5}
              maxLength={500}
              defaultValue={profile.bio ?? ""}
              className={accountInputClass}
            />
            <p className="mt-2 text-sm text-gc-muted">
              Up to 500 characters. A little about you, in your own words.
            </p>
          </div>
          <label className="block" htmlFor="profile-introduction">
            Pinned introduction (optional)
            <textarea
              id="profile-introduction"
              name="introduction"
              rows={4}
              maxLength={1000}
              className={accountInputClass}
              defaultValue={profile.presentation.introduction}
              aria-describedby="profile-introduction-help"
            />
          </label>
          <p id="profile-introduction-help" className="text-sm text-gc-muted">
            A welcome above your About and Posts sections. Up to 1,000
            characters.
          </p>
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="profile-location">Location (optional)</label>
              <input
                id="profile-location"
                name="location"
                maxLength={80}
                defaultValue={profile.location ?? ""}
                aria-describedby="profile-location-help"
                className={accountInputClass}
              />
              <p
                id="profile-location-help"
                className="mt-2 text-sm text-gc-muted"
              >
                A general place, such as your city. Up to 80 characters. Avoid
                sharing your home address here.
              </p>
            </div>
            <div>
              <label htmlFor="profile-website">Website (optional)</label>
              <input
                id="profile-website"
                name="website"
                type="url"
                maxLength={120}
                placeholder="https://"
                defaultValue={profile.website ?? ""}
                aria-describedby="profile-website-help"
                className={accountInputClass}
              />
              <p
                id="profile-website-help"
                className="mt-2 text-sm text-gc-muted"
              >
                A full http:// or https:// link, up to 120 characters.
              </p>
            </div>
          </div>
          <div>
            <label htmlFor="profile-interests">Interests (optional)</label>
            <input
              id="profile-interests"
              name="interests"
              maxLength={334}
              defaultValue={profile.interests.join(", ")}
              aria-describedby="profile-interests-help"
              className={accountInputClass}
            />
            <p
              id="profile-interests-help"
              className="mt-2 text-sm text-gc-muted"
            >
              Separate up to 8 interests with commas. Up to 40 characters each.
            </p>
          </div>
        </fieldset>
        <p
          ref={feedback}
          tabIndex={-1}
          role="alert"
          className="break-words text-sm text-gc-error"
        >
          {message}
        </p>
        <fieldset className="space-y-4" disabled={pending}>
          <legend className="text-2xl">Make it yours</legend>
          <p className="text-sm text-gc-muted">
            These presets keep text readable and respect each reader’s light or
            dark appearance.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <label htmlFor="profile-palette">
              Accent palette
              <select
                id="profile-palette"
                name="palette"
                className={accountInputClass}
                value={palette}
                onChange={(e) => setPalette(e.target.value)}
              >
                {PROFILE_PALETTES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <label htmlFor="profile-background">
              Cover background
              <select
                id="profile-background"
                name="background"
                className={accountInputClass}
                value={background}
                onChange={(e) => setBackground(e.target.value)}
              >
                {PROFILE_BACKGROUNDS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div
            className="gc-profile-style-swatch"
            data-profile-background={background}
            data-profile-palette={palette}
          >
            A welcoming place for your story
          </div>
          <label className="block" htmlFor="profile-order">
            Section order
            <select
              id="profile-order"
              name="sectionOrder"
              className={accountInputClass}
              defaultValue={profile.presentation.sectionOrder}
            >
              {PROFILE_ORDERS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
        </fieldset>
        {conflict && (
          <div className="gc-profile-confirm">
            <p>Your entries have been preserved.</p>
            <button
              type="button"
              className="gc-profile-text-button"
              disabled={pending}
              onClick={() => void reviewSaved()}
            >
              Review latest saved profile
            </button>
          </div>
        )}
        {latest && (
          <section
            className="gc-profile-confirm"
            aria-labelledby="latest-profile-heading"
          >
            <h3
              id="latest-profile-heading"
              ref={latestHeading}
              tabIndex={-1}
              className="text-xl"
            >
              Latest saved version
            </h3>
            <dl className="space-y-2 break-words">
              <div>
                <dt>Name</dt>
                <dd>{latest.name}</dd>
              </div>
              <div>
                <dt>Bio</dt>
                <dd>{latest.bio || "Empty"}</dd>
              </div>
              <div>
                <dt>Location / website</dt>
                <dd>
                  {latest.location || "Empty"} · {latest.website || "Empty"}
                </dd>
              </div>
              <div>
                <dt>Interests</dt>
                <dd>{latest.interests.join(", ") || "Empty"}</dd>
              </div>
              <div>
                <dt>Appearance / order</dt>
                <dd>
                  {latest.presentation.palette},{" "}
                  {latest.presentation.background},{" "}
                  {latest.presentation.sectionOrder}
                </dd>
              </div>
              <div>
                <dt>Introduction</dt>
                <dd>{latest.presentation.introduction || "Empty"}</dd>
              </div>
            </dl>
            <button
              type="button"
              className="gc-profile-text-button"
              onClick={() => {
                setVersion(latest.presentation.version);
                setLatest(null);
                setConflict(false);
                setMessage(
                  "Your entries are retained. Save profile to apply them over the version you just reviewed."
                );
                requestAnimationFrame(() => feedback.current?.focus());
              }}
            >
              Keep my edits and use this version
            </button>
          </section>
        )}
        {imagesPending && (
          <p role="status" className="text-sm">
            Save or discard your selected photos before saving the profile
            details.
          </p>
        )}
        <Button
          type="submit"
          disabled={pending || imagesPending}
          className="min-h-12 w-full rounded-full sm:w-auto"
        >
          {pending ? "Saving..." : "Save profile"}
        </Button>
      </fieldset>
    </form>
  );
}
