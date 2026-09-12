import Link from "next/link";
import { PlatformShell } from "@/components/platform/platform-shell";
import { LoadedVersion } from "@/components/platform/loaded-release";
import { releases } from "@/lib/platform/release-content";
import { getCurrentPlatformUser } from "@/lib/platform/session";
export const metadata = { title: "What's new" };
export default async function Page() {
  return (
    <PlatformShell user={await getCurrentPlatformUser()}>
      <section className="container-shell max-w-3xl space-y-6 py-8">
        <h1 className="text-4xl">What’s new</h1>
        <LoadedVersion />
        <p>
          Release notes describe changes. Reading them does not refresh this
          tab.
        </p>
        {releases.map((r) => (
          <article
            key={r.id}
            className="space-y-2 rounded-xl border border-gc-divider p-5"
          >
            <h2 className="text-2xl">
              <Link className="underline" href={`/platform/releases/${r.id}`}>
                Version {r.version}
              </Link>
            </h2>
            <time dateTime={r.date}>{r.date}</time>
            <p>{r.summary}</p>
          </article>
        ))}
        <Link className="gc-button gc-button-quiet" href="/platform/features">
          Explore features
        </Link>
      </section>
    </PlatformShell>
  );
}
