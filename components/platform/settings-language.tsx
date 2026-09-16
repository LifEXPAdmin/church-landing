import Link from "next/link";
import { RegionalSettings } from "./regional-settings";
import type { RegionalState } from "@/lib/platform/regional-preferences";

export function SettingsLanguage({ initial }: { initial: RegionalState }) {
  return (
    <section
      className="gc-settings space-y-5"
      aria-label="Language and location choices"
    >
      <dl className="space-y-5">
        <div>
          <dt className="font-semibold">Interface language</dt>
          <dd>English</dd>
          <dd className="mt-2 text-sm text-gc-muted">
            The website interface is currently available in English. Other
            interface translations and automatic content translation are not
            available yet.
          </dd>
        </div>
        <div>
          <dt className="font-semibold">Reading languages</dt>
          <dd>
            Choose languages for discovery posts without changing the interface.
            You can include posts whose authors have not selected a language.
            Filtering does not translate anyone&apos;s words.
          </dd>
        </div>
        <div>
          <dt className="font-semibold">Private discovery location</dt>
          <dd>
            Choose a country and find a town or area manually, then select an
            approximate radius in Discovery filters and interests. These choices
            stay private to your account and do not change your profile
            location, church membership or an event&apos;s location. No device
            location permission is needed.
          </dd>
          <dd className="mt-2 text-sm text-gc-muted">
            Location and reading-language filters apply to discovery feeds.
            Latest, Friends, Top This Week and Trending keep their existing
            ordering. Selecting a discovery feed makes its filters apply.
          </dd>
        </div>
        <div>
          <dt className="font-semibold">Location on your member profile</dt>
          <dd>
            Choose Only me or permitted signed-in members for your optional
            profile location. You can edit or clear it in your profile. Saving a
            discovery city never fills this field or changes its audience.
          </dd>
        </div>
        <div>
          <dt className="font-semibold">Dates and time zones</dt>
          <dd>
            Events keep their source time zone and show your device time zone
            where supported. Changing discovery location does not move an event.
            Your saved date and time formats change presentation without
            changing an event&apos;s time zone or scheduled time.
          </dd>
        </div>
      </dl>
      <RegionalSettings initial={initial} />
      <div className="flex flex-wrap gap-3">
        <Link
          className="gc-button"
          href="/platform/settings/feed/discovery"
          prefetch={false}
        >
          Choose discovery area and languages
        </Link>
        <Link
          className="gc-button gc-button-quiet"
          href="/platform/profile/me"
          prefetch={false}
        >
          Review profile location
        </Link>
        <Link
          className="gc-button gc-button-quiet"
          href="/platform/calendars"
          prefetch={false}
        >
          Open your calendars
        </Link>
      </div>
    </section>
  );
}
