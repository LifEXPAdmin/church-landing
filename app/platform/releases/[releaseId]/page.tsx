import { notFound } from "next/navigation";
import Link from "next/link";
import { PlatformShell } from "@/components/platform/platform-shell";
import { ReleaseDetails } from "@/components/platform/release-details";
import { releaseEntry } from "@/lib/platform/release-content";
import { getCurrentPlatformUser } from "@/lib/platform/session";
export const metadata = { title: "Release notes" };
export default async function Page({
  params
}: {
  params: Promise<{ releaseId: string }>;
}) {
  const entry = releaseEntry((await params).releaseId);
  if (!entry) notFound();
  return (
    <PlatformShell user={await getCurrentPlatformUser()}>
      <section className="container-shell max-w-3xl space-y-6 py-8">
        <h1 className="text-4xl">Release notes</h1>
        <ReleaseDetails entry={entry} />
        <Link className="gc-button gc-button-quiet" href="/platform/releases">
          All release notes
        </Link>
        <Link className="gc-button gc-button-quiet" href="/platform/features">
          Explore features
        </Link>
      </section>
    </PlatformShell>
  );
}
