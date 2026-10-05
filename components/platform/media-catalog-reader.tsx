"use client";
import { useEffect, useRef, useState } from "react";
import { socialRequest } from "@/lib/platform/social-client";
import type { MediaPublic } from "@/lib/platform/media-catalog-reads";
import { MediaTopicLinks } from "./media-topic-links";
import { SavePostControl } from "./save-post-control";
import {
  scriptureLabel,
  type ScriptureRange
} from "@/lib/platform/media-scripture";
import {
  MediaNavigation,
  MediaReadNotice,
  useMediaRead
} from "./media-catalog-library";
import {
  mediaFormatNames,
  mediaAudienceNames
} from "@/lib/platform/media-catalog-options";
export function MediaReader({
  id,
  owner
}: {
  id: string;
  owner: string | null;
}) {
  const url = `/api/platform/media-catalog?view=detail&id=${encodeURIComponent(id)}`;
  const { data, error, reload } = useMediaRead<{ item: MediaPublic }>(
      url,
      owner
    ),
    [opening, setOpening] = useState(false),
    [notice, setNotice] = useState("");
  const item = data?.item,
    launchGeneration = useRef(0);
  useEffect(() => {
    const cancel = () => {
      launchGeneration.current++;
    };
    window.addEventListener("blur", cancel);
    window.addEventListener("pagehide", cancel);
    window.addEventListener("offline", cancel);
    return () => {
      cancel();
      window.removeEventListener("blur", cancel);
      window.removeEventListener("pagehide", cancel);
      window.removeEventListener("offline", cancel);
    };
  }, []);
  useEffect(() => {
    launchGeneration.current++;
  }, [item]);
  return (
    <article className="space-y-5">
      <MediaNavigation />
      {!item ? (
        <MediaReadNotice error={error} reload={reload} />
      ) : (
        <>
          <header>
            <p>
              {mediaFormatNames[item.format as keyof typeof mediaFormatNames]}
            </p>
            <h1 className="mt-2 text-3xl font-semibold">{item.title}</h1>
            <p className="mt-2">
              Published by{" "}
              {item.ownerChurch?.name ?? item.owner?.name ?? "Publisher"}
            </p>
          </header>
          <SavePostControl
            key={`${owner ?? "guest"}:${item.id}`}
            postId={item.id}
            resourceKind="mediaCatalogItem"
            accountId={owner}
          />
          <p className="whitespace-pre-wrap">{item.description}</p>
          {Array.isArray(item.scriptureRanges) &&
            item.scriptureRanges.length > 0 && (
              <section aria-label="Scripture passages">
                <h2 className="text-lg font-semibold">Scripture passages</h2>
                <p className="text-sm">
                  Publisher-supplied tags; numbering systems are not
                  automatically converted.
                </p>
                <ul className="mt-2 list-disc pl-5">
                  {(item.scriptureRanges as unknown as ScriptureRange[]).map(
                    (r, i) => (
                      <li key={i}>{scriptureLabel(r)}</li>
                    )
                  )}
                </ul>
              </section>
            )}
          <dl className="grid gap-3 sm:grid-cols-2">
            {[
              [
                "Catalog audience",
                mediaAudienceNames[
                  item.audience as keyof typeof mediaAudienceNames
                ]
              ],
              ["Presentation", item.presentation?.toLowerCase()],
              ["Speakers (publisher supplied)", item.speakers.join(", ")],
              ["Church credit (publisher supplied)", item.churchCredit],
              ["Series", item.series],
              ["Sequence", item.sequence],
              ["Recorded", item.recordedOn],
              [
                "Duration",
                item.durationSeconds
                  ? `${item.durationSeconds} seconds`
                  : "Unknown"
              ],
              ["Languages", item.languageIds.join(", ")],
              ["Attribution", item.attribution],
              ...Object.entries(
                (item.details ?? {}) as Record<string, string | number | null>
              ).map(([key, value]) => [
                (
                  {
                    preachedOn: "Preached on",
                    season: "Season",
                    episode: "Episode",
                    episodeKind: "Episode kind",
                    subject: "Testimony subject",
                    lessonNumber: "Lesson number"
                  } as Record<string, string>
                )[key] ?? key,
                value
              ])
            ]
              .filter(([, v]) => v)
              .map(([label, value]) => (
                <div key={label}>
                  <dt className="text-sm font-semibold">{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
          </dl>
          {item.topics.length > 0 && (
            <section aria-label="Publisher topics" className="space-y-2">
              <h2 className="text-lg font-semibold">
                Publisher-selected topics
              </h2>
              <p>
                These labels describe the recording. Choose a topic to browse
                related media.
              </p>
              <MediaTopicLinks topics={item.topics} />
            </section>
          )}
          <div className="rounded-xl border p-[16px]">
            <h2 className="text-lg font-semibold">
              Open on {item.sourceProvider}
            </h2>
            <p className="mt-2">
              Playback happens on the external provider, with its own privacy
              and playback rules. Opening this source contacts that provider.
              Its public link can be shared independently of this catalog
              audience.
            </p>
            <button
              className="gc-button mt-4 !px-[12px]"
              disabled={opening}
              onClick={async () => {
                setOpening(true);
                setNotice("");
                const generation = ++launchGeneration.current;
                try {
                  const current = await socialRequest<{ item: MediaPublic }>(
                    url,
                    undefined,
                    owner
                  );
                  if (
                    generation !== launchGeneration.current ||
                    !document.hasFocus() ||
                    document.visibilityState === "hidden" ||
                    !navigator.onLine
                  )
                    throw Error(
                      "Return to this item and open the source again."
                    );
                  if (
                    current.data.item.version !== item.version ||
                    current.data.item.sourceUrl !== item.sourceUrl
                  )
                    throw Error(
                      "This item changed. Check its current details before opening."
                    );
                  const link = document.createElement("a");
                  link.href = current.data.item.sourceUrl!;
                  link.target = "_blank";
                  link.rel = "noopener noreferrer";
                  link.click();
                } catch (e) {
                  setNotice(
                    e instanceof Error ? e.message : "Source unavailable."
                  );
                  reload();
                } finally {
                  setOpening(false);
                }
              }}
            >
              {opening ? "Checking source…" : "Open source"}
            </button>
            <p role="status">{notice}</p>
          </div>
        </>
      )}
    </article>
  );
}
