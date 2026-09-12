import Link from "next/link";
import { features, type ReleaseEntry } from "@/lib/platform/release-content";
export function ReleaseDetails({ entry }: { entry: ReleaseEntry }) {
  return (
    <article className="space-y-4">
      <h2 className="text-2xl">Version {entry.version}</h2>
      <time dateTime={entry.date}>{entry.date}</time>
      <p>{entry.summary}</p>
      {(["added", "improved", "fixed"] as const).map(
        (group) =>
          entry[group].length > 0 && (
            <section key={group}>
              <h3 className="text-xl capitalize">{group}</h3>
              <ul className="list-disc space-y-2 pl-5">
                {entry[group].map((text) => (
                  <li key={text}>{text}</li>
                ))}
              </ul>
            </section>
          )
      )}
      <p>Explore these features:</p>
      <ul>
        {entry.featureIds.map((id) => (
          <li key={id}>
            <Link className="underline" href={`/platform/features#${id}`}>
              {features.find((f) => f.id === id)?.name ??
                "Learn more about this feature"}
            </Link>
          </li>
        ))}
      </ul>
    </article>
  );
}
