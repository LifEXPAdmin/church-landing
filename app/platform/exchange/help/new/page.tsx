import { InterchurchHelpPage } from "@/components/platform/interchurch-help-page";
import { PlatformShell } from "@/components/platform/platform-shell";
import { getCurrentPlatformUser } from "@/lib/platform/session";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Ministry help",
  robots: { index: false, follow: false }
};
export default async function Page({
  params,
  searchParams
}: {
  params: Promise<{ id?: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentPlatformUser(),
    p = await params,
    q = await searchParams;
  const query = Object.fromEntries(
    Object.entries(q).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string"
    )
  );
  return (
    <PlatformShell user={user}>
      <InterchurchHelpPage
        owner={user?.id ?? null}
        view="new"
        id={p.id ?? query.id}
        query={query}
      />
    </PlatformShell>
  );
}
