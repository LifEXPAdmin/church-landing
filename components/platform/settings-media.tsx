import Link from "next/link";
import { settingsRegistry } from "@/lib/platform/settings-registry";

/** Availability comes from the accepted capability map, never a saved off value. */
export function SettingsMedia() {
  return (
    <div className="space-y-5">
      {settingsRegistry
        .filter((entry) => entry.folder === "media")
        .map((entry) => (
          <section
            key={entry.id}
            className="gc-settings space-y-3"
            aria-labelledby={entry.id.replaceAll(".", "-")}
          >
            <h2 id={entry.id.replaceAll(".", "-")} className="text-2xl">
              {entry.label}
            </h2>
            <p>{entry.description}</p>
            {entry.id === "media.quality" && (
              <Link
                id="media-data-saver"
                className="gc-button gc-button-quiet"
                href="/platform/settings/display/reading"
              >
                Choose Data saver in Appearance and reading
              </Link>
            )}
          </section>
        ))}
    </div>
  );
}
