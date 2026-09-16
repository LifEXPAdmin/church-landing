import type { Metadata } from "next";
import { PlatformShell } from "@/components/platform/platform-shell";
import { GuestAccountPrompt } from "@/components/platform/guest-account-prompt";
import { ActivityWorkspace } from "@/components/platform/activity-workspace";
import { getCurrentPlatformUser } from "@/lib/platform/session";
import {
  activityCategories,
  type ActivityCategory
} from "@/lib/platform/activity-types";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Notifications",
  robots: { index: false, follow: false },
  referrer: "no-referrer"
};
export default async function ActivityPage({
  searchParams
}: {
  searchParams: Promise<{
    category?: string;
    cursor?: string;
    filter?: string;
  }>;
}) {
  const [user, query] = await Promise.all([
    getCurrentPlatformUser(),
    searchParams
  ]);
  const category = activityCategories.includes(
    query.category as ActivityCategory
  )
    ? (query.category as ActivityCategory)
    : undefined;
  const filter = query.filter === "unread" ? "unread" : "all";
  const returnQuery = new URLSearchParams({
    ...(category ? { category } : {}),
    ...(filter === "unread" ? { filter } : {})
  }).toString();
  const cursor =
    typeof query.cursor === "string" &&
    query.cursor.length <= 400 &&
    /^[A-Za-z0-9_-]+$/.test(query.cursor)
      ? query.cursor
      : undefined;
  return (
    <PlatformShell user={user}>
      {user ? (
        <div className="container-shell py-6">
          <ActivityWorkspace
            key={`${user.id}-${category ?? "all"}-${filter}-${cursor ?? "newest"}`}
            owner={user.id}
            category={category}
            cursor={cursor}
            filter={filter}
          />
        </div>
      ) : (
        <GuestAccountPrompt
          reason="account"
          next={"/platform/activity" + (returnQuery ? "?" + returnQuery : "")}
        />
      )}
    </PlatformShell>
  );
}
