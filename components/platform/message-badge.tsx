"use client";
import { socialRequest } from "@/lib/platform/social-client";
import type { AdultMessageView } from "@/lib/platform/adult-message-types";

import { useNavigationCount } from "./use-navigation-count";
async function readMessageCount(owner: string) {
  const { data } = await socialRequest<AdultMessageView>(
    "/api/platform/messages?view=activity",
    undefined,
    owner
  );
  return data.activity
    ? data.activity.requestAlerts + data.activity.messageAlerts
    : null;
}
/** Only scalar authorized counts; the navigation never preloads message text. */
export function MessageBadge({ owner }: { owner?: string }) {
  const { count } = useNavigationCount(owner, readMessageCount);
  return count ? (
    <span
      className="gc-message-count"
      aria-label={`${count} unread message or request alerts`}
    >
      {count > 99 ? "99+" : count}
    </span>
  ) : null;
}
