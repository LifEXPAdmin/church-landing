"use client";
import Link from "next/link";

export function SettingsSafety() {
  return (
    <section className="gc-settings space-y-5" aria-label="Safety choices">
      <h2 className="text-2xl">Choose the right safety control</h2>
      <dl className="space-y-4">
        <div>
          <dt className="font-semibold">Block a personal account</dt>
          <dd>
            Stop direct personal social interactions and hide each other’s
            personal content while signed in. Following, favorites and
            friendship are removed. Public material can still be viewed while
            signed out; church-authored posts and church duties are separate.
          </dd>
        </div>
        <div>
          <dt className="font-semibold">Mute or snooze</dt>
          <dd>
            Hide an account’s or church’s posts from your feed and discovery.
            You can still open content you’re allowed to view. Snooze has an
            expiry; membership and commitments stay in place.
          </dd>
        </div>
        <div>
          <dt className="font-semibold">Mention and reply choices</dt>
          <dd>
            Choose who may mention you in an eligible conversation. Each post’s
            reply permissions are selected separately in the composer and
            preserved in saved drafts.
          </dd>
        </div>
        <div>
          <dt className="font-semibold">Reporting a concern</dt>
          <dd>
            Reporting from a post or reply and a personal report-history screen
            are unavailable. For current help routes, open Help and support.
            Blocking or muting does not submit a report.
          </dd>
        </div>
      </dl>
      <div className="flex flex-wrap gap-3">
        <Link
          className="gc-button gc-button-quiet"
          href="/platform/settings/privacy/relationships"
        >
          Review mention choices
        </Link>
        <Link className="gc-button gc-button-quiet" href="/platform/help">
          Help and support
        </Link>
      </div>
    </section>
  );
}
