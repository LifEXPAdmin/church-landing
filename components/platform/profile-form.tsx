"use client";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { accountInputClass } from "./account-form";
type Profile = {
  name: string;
  bio: string | null;
  location: string | null;
  website: string | null;
  interests: string[];
};
export function ProfileForm({ profile }: { profile: Profile }) {
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const feedback = useRef<HTMLParagraphElement>(null);
  return (
    <form
      id="account-profile-form"
      method="post"
      action="/api/platform/account"
      className="mx-auto max-w-3xl space-y-5 rounded-xl border border-gc-divider bg-gc-surface p-5 text-gc-text sm:p-8"
      aria-busy={pending}
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy.current) return;
        busy.current = true;
        setPending(true);
        setMessage("");
        const fields = Object.fromEntries(new FormData(event.currentTarget));
        try {
          const response = await fetch("/api/platform/account", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...fields, operation: "update-profile" })
          });
          const result = await response.json();
          if (
            response.ok &&
            typeof result.redirect === "string" &&
            result.redirect.startsWith("/platform/profile/")
          ) {
            window.location.replace(result.redirect);
            return;
          }
          setMessage(
            `${result.message ?? "Your changes were not confirmed."} Reference: ${response.headers.get("X-Account-Request-Id") ?? "unavailable"}`
          );
        } catch {
          setMessage(
            "We could not confirm the save. Check your connection and try again. Your edits are still here."
          );
        } finally {
          busy.current = false;
          setPending(false);
          requestAnimationFrame(() => feedback.current?.focus());
        }
      }}
    >
      <div>
        <h1 className="text-4xl text-gc-text sm:text-5xl">Edit your profile</h1>
        <p className="mt-3 text-gc-muted">
          Share only what you want others to see. These profile fields are
          public. Your account email and private church directory choices are
          separate.
        </p>
      </div>
      <div>
        <label htmlFor="profile-name">Name</label>
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
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="profile-location">Location (optional)</label>
          <input
            id="profile-location"
            name="location"
            maxLength={80}
            defaultValue={profile.location ?? ""}
            className={accountInputClass}
          />
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
            className={accountInputClass}
          />
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
        <p id="profile-interests-help" className="mt-2 text-sm text-gc-muted">
          Separate up to 8 interests with commas. Up to 40 characters each.
        </p>
      </div>
      <p
        ref={feedback}
        tabIndex={-1}
        role="alert"
        className="break-words text-sm text-gc-error"
      >
        {message}
      </p>
      <Button
        type="submit"
        disabled={pending}
        className="min-h-12 w-full rounded-full sm:w-auto"
      >
        {pending ? "Saving..." : "Save profile"}
      </Button>
    </form>
  );
}
