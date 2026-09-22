import type { ReactNode } from "react";
import {
  settingsRegistry,
  type SettingRegistration
} from "@/lib/platform/settings-registry";

/** Navigation reuses each existing owner; this folder has no saved values. */
export function SettingsCalendar({
  rows
}: {
  rows: (entries: readonly SettingRegistration[]) => ReactNode;
}) {
  const entries = (...ids: string[]) =>
    rows(settingsRegistry.filter((entry) => ids.includes(entry.id)));
  return (
    <div className="space-y-5">
      <section
        className="gc-settings space-y-3"
        aria-labelledby="calendar-display"
      >
        <h2 id="calendar-display" className="text-2xl">
          Display
        </h2>
        <p>
          These are personal viewing choices. They do not change event times,
          publish a calendar or change anyone’s access.
        </p>
        {entries("calendar.formats", "calendar.view")}
        <p className="text-sm text-gc-muted">
          Saved defaults apply when you open a calendar. View controls can
          temporarily choose another month, view or time zone. Following the
          device and using a fixed time zone are separate saved choices.
        </p>
      </section>
      <section
        className="gc-settings space-y-3"
        aria-labelledby="calendar-reminders"
      >
        <h2 id="calendar-reminders" className="text-2xl">
          Reminders and alerts
        </h2>
        <p>
          Review event Activity and phone choices in Notifications. Phone alerts
          also need a current device. Timed calendar reminders are not available
          yet.
        </p>
        {entries("calendar.alerts")}
      </section>
      <section
        className="gc-settings space-y-3"
        aria-labelledby="calendar-subscriptions"
      >
        <h2 id="calendar-subscriptions" className="text-2xl">
          Calendars and subscriptions
        </h2>
        <p>
          Save which available calendars you follow, show and color in My calendars.
          Hiding or unfollowing does not leave a church, cancel an RSVP or remove
          a volunteer commitment.
        </p>
        {entries("calendar.layers", "calendar.commitments")}
        <p className="text-sm text-gc-muted">
          Private subscription links and connections to external calendars are not available yet.
        </p>
      </section>
      <section
        className="gc-settings space-y-3"
        aria-labelledby="calendar-audience"
      >
        <h2 id="calendar-audience" className="text-2xl">
          Schedule sharing
        </h2>
        <p>
          Personal calendars start private. Review each calendar or event for
          its current audience. You can deliberately share busy-only
          availability or full event details with approved members of your
          church.
        </p>
        <p>
          Whole-calendar sharing includes current and future events. Calendar
          and event-series shares are independent. Ending one leaves the other
          active; an active full-detail share can still reveal event details.
        </p>
        {entries("calendar.sharing", "calendar.details")}
        <p className="text-sm text-gc-muted">
          Your RSVPs stay private. A selected event on your profile keeps its
          original audience and does not share your whole schedule. Church
          publication requires current assigned duties in My church; personal
          settings never grant them.
        </p>
        {entries("calendar.church")}
      </section>
    </div>
  );
}
