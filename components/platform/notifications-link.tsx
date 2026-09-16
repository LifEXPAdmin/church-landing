"use client";
import Link from "next/link";
import { Bell } from "lucide-react";
import { socialRequest, SocialClientError } from "@/lib/platform/social-client";
import { useNavigationCount } from "./use-navigation-count";

async function readCount(owner: string) {
  const { data } = await socialRequest<{ ownerId: string; unread: number }>(
    "/api/platform/activity?view=summary",
    undefined,
    owner
  );
  if (
    data.ownerId !== owner ||
    !Number.isSafeInteger(data.unread) ||
    data.unread < 0
  )
    throw new SocialClientError(401, "Reload notifications.");
  return data.unread;
}
export function NotificationsLink({ owner }: { owner: string }) {
  const { count, unavailable } = useNavigationCount(owner, readCount);
  return (
    <Link
      href="/platform/activity"
      prefetch={false}
      className="gc-utility gc-notifications-link"
    >
      <Bell aria-hidden="true" />
      <span className="gc-notifications-label">Notifications</span>
      {count !== null && count > 0 ? (
        <span
          className="gc-message-count"
          aria-label={`${count} unread notifications`}
        >
          {count > 99 ? "99+" : count}
        </span>
      ) : (
        <span className="sr-only">
          {unavailable
            ? "Unread count unavailable. Open to retry."
            : count === 0
              ? "No unread notifications"
              : "Checking unread notifications"}
        </span>
      )}
    </Link>
  );
}
