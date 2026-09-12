"use client";
import Link from "next/link";
import type { SettingsContext } from "@/lib/platform/settings-context";

const mentionLabels = {
  EVERYONE: "Any eligible member who can view the conversation",
  FOLLOWED: "People you follow who can view the conversation",
  NOBODY: "No one"
};

export function SettingsPrivacy({ data }: { data: SettingsContext }) {
  return (
    <section
      className="gc-settings space-y-5"
      aria-label="Current privacy choices"
    >
      <h2 className="text-2xl">Your current privacy</h2>
      <dl className="space-y-5">
        <div>
          <dt className="font-semibold">Who may mention you</dt>
          <dd>{mentionLabels[data.privacy.mentions]}</dd>
        </div>
        <div>
          <dt className="font-semibold">Following and follower counts</dt>
          <dd>
            {data.privacy.showRelationships
              ? "Visible to permitted signed-in members"
              : "Hidden from other members"}
          </dd>
          <dd className="mt-2 text-sm text-gc-muted">
            You can still review your own relationships. This choice does not
            change your friendships, follows or anyone’s access to your posts.
          </dd>
        </div>
        <div>
          <dt className="font-semibold">Profile discovery</dt>
          <dd>
            Your name and username can appear in search and identify public
            contributions. Member profile details require sign-in.
          </dd>
          <dd className="mt-2 text-sm text-gc-muted">
            Search uses current account, block and mute rules. Search opt-out
            and email or phone lookup are unavailable.
          </dd>
        </div>
        <div>
          <dt className="font-semibold">Profile details and contacts</dt>
          <dd>
            Profile details and photos require permitted signed-in access.
            Directory email and phone have separate church sharing choices; your
            sign-in email stays private.
          </dd>
        </div>
        <div>
          <dt className="font-semibold">Posts, replies and activity</dt>
          <dd>
            Each post keeps its selected audience and reply permissions. Check
            these in the composer before publishing. Saved drafts keep their own
            choices.
          </dd>
          <dd className="mt-2 text-sm text-gc-muted">
            Church-private content still requires current church access. A saved
            default for future posts and a separate activity-visibility control
            are unavailable; these settings do not relabel existing posts.
          </dd>
        </div>
      </dl>
      <p className="text-sm text-gc-muted">
        Family-managed and QR-only account controls are not available yet. No
        child account or parent-managed permission is enabled by these settings.
      </p>
      <div className="flex flex-wrap gap-3">
        <Link
          className="gc-button gc-button-quiet"
          href="/platform/settings/privacy/relationships"
        >
          Edit mention and relationship choices
        </Link>
        <Link
          className="gc-button gc-button-quiet"
          href="/platform/settings/profile"
        >
          Review profile and optional contacts
        </Link>
        <Link
          className="gc-button gc-button-quiet"
          href="/platform/relationships"
        >
          Review relationships and blocked accounts
        </Link>
      </div>
    </section>
  );
}
