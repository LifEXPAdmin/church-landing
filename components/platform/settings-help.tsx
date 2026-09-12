"use client";
import Link from "next/link";
import { useState } from "react";
import { searchSettingsHelp } from "@/lib/platform/settings-help";
import { LoadedVersion } from "./loaded-release";

export function SettingsHelp() {
  const [query, setQuery] = useState("");
  const topics = searchSettingsHelp(query);
  return (
    <section className="gc-settings space-y-5" aria-label="Settings help">
      <div className="flex flex-wrap gap-3">
        <Link className="gc-button gc-button-primary" href="/platform/help">
          Get help or find contacts
        </Link>
        <Link
          className="gc-button gc-button-quiet"
          href="/platform/help/requests"
        >
          My support requests
        </Link>
      </div>
      <p>
        The contact page explains the available routes. Private request intake
        requires its named recipient and current eligibility; sending an email
        through your own app is separate from an in-app request.
      </p>
      <label className="block" htmlFor="settings-help-search">
        Search settings help
        <input
          id="settings-help-search"
          className="gc-input mt-2 block w-full"
          type="search"
          maxLength={200}
          placeholder="Try audience, quiet hours or reset"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <p role="status">
        {topics.length
          ? `${topics.length} help ${topics.length === 1 ? "topic" : "topics"}.`
          : "No matching help. Try another word or open Help and contacts."}
      </p>
      <div className="space-y-3">
        {topics.map((topic) => (
          <details
            key={topic.id}
            className="rounded-lg border border-gc-divider p-4"
          >
            <summary className="cursor-pointer py-2 font-semibold">
              {topic.title}
            </summary>
            <p className="my-3">{topic.body}</p>
            <Link
              className="inline-flex min-h-11 items-center underline"
              href={topic.href}
            >
              {topic.action}
            </Link>
          </details>
        ))}
      </div>
      <div className="space-y-2 border-t border-gc-divider pt-4">
        <h2 className="text-2xl">Product information and policies</h2>
        <LoadedVersion />
        <p>
          What’s new describes released changes. Reading notes does not refresh
          this tab; the update notice protects unfinished work. Explore features
          explains current availability and includes installation guidance.
        </p>
        <p>
          Community expectations are in Terms. Privacy and Terms show their
          service-information dates on the linked pages. They are separate from
          the app version shown here.
        </p>
      </div>
    </section>
  );
}
