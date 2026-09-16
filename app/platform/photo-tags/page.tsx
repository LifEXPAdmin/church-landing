import type { Metadata } from "next";
import { safeAccountReturn } from "@/lib/platform/account-entry";
import { PlatformShell } from "@/components/platform/platform-shell";
import { GuestAccountPrompt } from "@/components/platform/guest-account-prompt";
import { PhotoTagWorkspace } from "@/components/platform/photo-tag-workspace";
import { getCurrentPlatformUser } from "@/lib/platform/session";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Photo tags",
  robots: { index: false, follow: false },
  referrer: "no-referrer"
};
export default async function PhotoTags({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [user, input] = await Promise.all([
    getCurrentPlatformUser(),
    searchParams
  ]);
  const query = new URLSearchParams();
  const id = (v: unknown): v is string =>
    typeof v === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(v);
  if (input.view === "preferences") query.set("view", "preferences");
  else if (id(input.tag)) query.set("id", input.tag);
  else if (id(input.photo)) {
    query.set("view", "asset");
    query.set("assetId", input.photo);
  } else if (id(input.profile)) {
    query.set("view", "profile");
    query.set("profileId", input.profile);
  } else if (input.scope === "sent") query.set("scope", "sent");
  if (
    !query.has("id") &&
    query.get("view") !== "asset" &&
    query.get("view") !== "preferences" &&
    id(input.after)
  )
    query.set("after", input.after);
  const returnQuery = new URLSearchParams();
  for (const key of ["view", "tag", "photo", "profile", "scope"])
    if (id(input[key])) returnQuery.set(key, input[key]);
  const next = safeAccountReturn(
    "/platform/photo-tags" + (returnQuery.size ? "?" + returnQuery : "")
  );
  return (
    <PlatformShell user={user} signInReturnTo={next}>
      {user ? (
        <div className="container-shell py-6">
          <PhotoTagWorkspace
            key={`${user.id}-${query}`}
            owner={user.id}
            query={query.toString()}
          />
        </div>
      ) : (
        <GuestAccountPrompt reason="account" next={next} />
      )}
    </PlatformShell>
  );
}
