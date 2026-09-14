import { Temporal } from "@js-temporal/polyfill";
import type { Prisma, PrismaClient, SocialPreferences } from "@prisma/client";
import { withOwnedSession } from "./account-sessions";
import { eligibleWhere, expected, PortalError } from "./portal-policy";
import { calendarZone } from "./calendar-time";
import { socialCommand, socialInput } from "./social-operations";
import { pushAvailable } from "./push-config";

const inAppCategories = ["messages", "requests", "reports", "founder"] as const;
export const notificationCategories = [
  ...inAppCategories,
  "replies",
  "mentions",
  "conversations",
  "prayer"
] as const;
export type NotificationCategory = (typeof notificationCategories)[number];
export type QuietHours = {
  start: number;
  end: number;
  timeZone: string;
} | null;
export function parseQuietHours(value: unknown): QuietHours {
  if (value === null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new PortalError(
      400,
      "Choose a quiet-hours window or turn quiet hours off."
    );
  const v = value as Record<string, unknown>;
  if (
    Object.keys(v).sort().join() !== "end,start,timeZone" ||
    ![v.start, v.end].every(
      (x) => typeof x === "number" && Number.isInteger(x) && x >= 0 && x < 1440
    ) ||
    v.start === v.end
  )
    throw new PortalError(
      400,
      "Choose different start and end times for quiet hours."
    );
  return {
    start: v.start as number,
    end: v.end as number,
    timeZone: calendarZone(v.timeZone)
  };
}
export function quietHoursEnd(quiet: QuietHours, now: Date): Date | null {
  if (!quiet) return null;
  const local = Temporal.Instant.fromEpochMilliseconds(
    now.getTime()
  ).toZonedDateTimeISO(quiet.timeZone);
  const overnight = quiet.start > quiet.end;
  // A skipped end time moves forward through the gap; a repeated end uses its
  // later occurrence, even after the first occurrence's wall time has passed.
  // A repeated start uses the earlier occurrence. Compare instants, not clocks.
  for (const days of [-1, 0]) {
    const day = local.toPlainDate().add({ days });
    const start = day
      .toPlainDateTime({
        hour: Math.floor(quiet.start / 60),
        minute: quiet.start % 60
      })
      .toZonedDateTime(quiet.timeZone, { disambiguation: "compatible" });
    const end = day
      .add({ days: overnight ? 1 : 0 })
      .toPlainDateTime({
        hour: Math.floor(quiet.end / 60),
        minute: quiet.end % 60
      })
      .toZonedDateTime(quiet.timeZone, { disambiguation: "later" });
    if (
      now.getTime() >= start.epochMilliseconds &&
      now.getTime() < end.epochMilliseconds
    )
      return new Date(end.epochMilliseconds);
  }
  return null;
}
export function projectNotificationPreferences(row: SocialPreferences | null) {
  return {
    version: row?.version ?? 0,
    inApp: {
      messages: row?.messageAlerts ?? true,
      requests: row?.requestAlerts ?? true,
      reports: row?.reportAlerts ?? true,
      founder: row?.founderAnnouncements ?? true
    },
    pushCategories: (row?.pushCategories ?? []) as NotificationCategory[],
    quietHours:
      row?.quietStart != null && row.quietEnd != null && row.quietTimeZone
        ? {
            start: row.quietStart,
            end: row.quietEnd,
            timeZone: row.quietTimeZone
          }
        : null
  };
}
export async function notificationPreferencesIn(
  tx: Prisma.TransactionClient,
  ownerId: string
) {
  return projectNotificationPreferences(
    await tx.socialPreferences.findUnique({ where: { ownerId } })
  );
}
export function readNotificationPreferences(db: PrismaClient, token: unknown) {
  return withOwnedSession(db, token, async (tx, session) => ({
    ownerId: session.userId,
    preferences: await notificationPreferencesIn(tx, session.userId),
    channels: {
      inApp: true,
      push:
        pushAvailable() &&
        !!(await tx.platformUser.findFirst({
          where: { id: session.userId, ...eligibleWhere },
          select: { id: true }
        })),
      email: false
    }
  }));
}
export function notificationPreferenceCommand(
  db: PrismaClient,
  token: unknown,
  input: Record<string, unknown>
) {
  socialInput(input, [
    "mutationId",
    "operation",
    "ownerId",
    "expectedVersion",
    "inApp",
    "pushCategories",
    "quietHours"
  ]);
  if (input.operation !== "preferences")
    throw new PortalError(400, "Choose a supported notification control.");
  return socialCommand(
    db,
    token,
    "notification",
    input,
    async (tx, ownerId) => {
      const old = await notificationPreferencesIn(tx, ownerId);
      expected(input.expectedVersion, old.version);
      const categories = input.pushCategories;
      const choices = input.inApp as Record<string, unknown> | undefined;
      if (
        !choices ||
        Object.keys(choices).sort().join() !==
          [...inAppCategories].sort().join() ||
        Object.values(choices).some((v) => typeof v !== "boolean") ||
        !Array.isArray(categories) ||
        categories.length > notificationCategories.length ||
        new Set(categories).size !== categories.length ||
        categories.some((v) => !notificationCategories.includes(v))
      )
        throw new PortalError(
          400,
          "Use the supported notification categories and channels."
        );
      if (
        categories.some((c) => !old.pushCategories.includes(c)) &&
        !(await tx.platformUser.findFirst({
          where: { id: ownerId, ...eligibleWhere },
          select: { id: true }
        }))
      )
        throw new PortalError(
          403,
          "Verify your email and complete adult account setup before enabling phone notifications."
        );
      if (
        !pushAvailable() &&
        categories.some((c) => !old.pushCategories.includes(c))
      )
        throw new PortalError(
          503,
          "Phone notifications are not available yet. You can still turn existing choices off."
        );
      const quiet = parseQuietHours(input.quietHours);
      const data = {
        messageAlerts: choices.messages as boolean,
        requestAlerts: choices.requests as boolean,
        reportAlerts: choices.reports as boolean,
        founderAnnouncements: choices.founder as boolean,
        pushCategories: [...categories].sort(),
        conversationPushSince: !categories.includes("conversations")
          ? null
          : old.pushCategories.includes("conversations")
            ? undefined
            : new Date(),
        prayerPushSince: !categories.includes("prayer")
          ? null
          : old.pushCategories.includes("prayer")
            ? undefined
            : new Date(),
        quietStart: quiet?.start ?? null,
        quietEnd: quiet?.end ?? null,
        quietTimeZone: quiet?.timeZone ?? null
      };
      const row = await tx.socialPreferences.upsert({
        where: { ownerId },
        create: { ownerId, ...data },
        update: { ...data, version: { increment: 1 } }
      });
      return {
        id: ownerId,
        version: row.version,
        message: "Your notification choices are saved."
      };
    },
    async (_tx, ownerId) => {
      if (input.ownerId !== ownerId)
        throw new PortalError(
          401,
          "Your sign-in changed. Reload before changing notifications."
        );
    }
  );
}
