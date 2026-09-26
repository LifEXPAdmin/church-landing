import type { PrismaClient } from "@prisma/client";
import { scheduleCalendarReminders } from "./calendar-reminders";
import { requestSessionToken } from "./account-boundary";
import {
  socialError,
  socialHeaders,
  socialWriteInput
} from "./social-boundary";
import { PortalError } from "./portal-policy";
import {
  readNotificationPreferences,
  notificationPreferenceCommand
} from "./notification-preferences";
import {
  readPushSubscriptions,
  pushSubscriptionCommand
} from "./push-subscriptions";
import {
  requestTestNotification,
  readTestNotification
} from "./notification-test";
import { openNotification } from "./notification-outbox";
export async function handleNotificationRequest(
  db: PrismaClient,
  request: Request,
  afterTest?: (sourceId: string) => void,
  afterResponse?: (work: () => Promise<void>) => void
) {
  try {
    if (request.method === "GET") {
      const query = new URL(request.url).searchParams,
        view = query.get("view") ?? "preferences",
        token = requestSessionToken(request);
      if ([...query.keys()].some((key) => !["view", "id"].includes(key)))
        throw new PortalError(400, "Use a supported notification view.");
      const result =
        view === "preferences"
          ? await readNotificationPreferences(db, token)
          : view === "devices"
            ? await readPushSubscriptions(db, token)
            : view === "test"
              ? await readTestNotification(db, token, query.get("id"))
              : view === "open"
                ? await openNotification(db, token, query.get("id"))
                : null;
      if (!result)
        throw new PortalError(400, "Use a supported notification view.");
      return Response.json(result, { headers: socialHeaders });
    }
    const { input, token } = await socialWriteInput(
      db,
      request,
      "notifications"
    );
    const result =
      input.operation === "preferences"
        ? await notificationPreferenceCommand(db, token, input)
        : input.operation === "test"
          ? await requestTestNotification(db, token, input)
          : await pushSubscriptionCommand(db, token, input);
    if (input.operation === "test") afterTest?.(result.id);
    if (input.operation === "preferences")
      scheduleCalendarReminders(db, result.id, afterResponse);
    return Response.json(result, { headers: socialHeaders });
  } catch (error) {
    return socialError(error);
  }
}
