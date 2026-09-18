import { feedbackEmailAvailable } from "./feedback-email";
import { recordDiscoveryControl } from "./retention-controls";
import { protectDiscoveryRecovery } from "./discovery-recovery";
import { Temporal } from "@js-temporal/polyfill";
import type { Prisma, PrismaClient, SocialPreferences } from "@prisma/client";
import { withOwnedSession } from "./account-sessions";
import { eligibleWhere, expected, PortalError } from "./portal-policy";
import { calendarZone } from "./calendar-time";
import { socialCommand, socialInput } from "./social-operations";
import { pushAvailable } from "./push-config";

const legacyInAppCategories = [
  "messages",
  "requests",
  "reports",
  "founder"
] as const;
export const notificationCategories = [
  ...legacyInAppCategories,
  "replies",
  "mentions",
  "conversations",
  "prayer",
  "posts",
  "reactions",
  "church",
  "commitments",
  "feedback",
  "photos",
  "exchange",
  "handoffs",
  "needs",
  "assistance",
  "groups"
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
export function inAppNotificationEnabled(
  row: SocialPreferences | null,
  category: NotificationCategory
) {
  if (
    row?.notificationRecoveryRequired ||
    row?.mutedNotificationCategories.includes(category)
  )
    return false;
  return category === "messages"
    ? (row?.messageAlerts ?? true)
    : category === "requests"
      ? (row?.requestAlerts ?? true)
      : category === "reports"
        ? (row?.reportAlerts ?? true)
        : category === "founder"
          ? (row?.founderAnnouncements ?? true)
          : true;
}
export function notificationPushAllowed(
  row: SocialPreferences | null,
  category: NotificationCategory,
  sourceAt: Date
) {
  if (
    !row ||
    row.notificationRecoveryRequired ||
    !row.pushCategories.includes(category)
  )
    return false;
  const saved = row.notificationPushSince;
  const at =
    saved && typeof saved === "object" && !Array.isArray(saved)
      ? saved[category]
      : null;
  if (typeof at === "string")
    return (
      Number.isFinite(Date.parse(at)) && Date.parse(at) < sourceAt.getTime()
    );
  if (category === "conversations")
    return !!row.conversationPushSince && row.conversationPushSince < sourceAt;
  if (category === "prayer")
    return !!row.prayerPushSince && row.prayerPushSince < sourceAt;
  // Preserve already supported choices on older accounts. Newly supported
  // channels require a dated opt-in; a raw category name cannot backfill them.
  return ![
    "posts",
    "reactions",
    "church",
    "commitments",
    "feedback",
    "exchange",
    "handoffs",
    "needs",
    "assistance",
    "groups"
  ].includes(category);
}
export function notificationEmailAllowed(
  row: SocialPreferences | null,
  sourceAt: Date
) {
  return (
    !!row &&
    !row.notificationRecoveryRequired &&
    !!row.feedbackEmailSince &&
    row.feedbackEmailSince < sourceAt
  );
}
export function projectNotificationPreferences(row: SocialPreferences | null) {
  return {
    version: row?.version ?? 0,
    recoveryRequired: row?.notificationRecoveryRequired ?? false,
    feedbackEmail:
      !!row?.feedbackEmailSince && !row.notificationRecoveryRequired,
    inApp: Object.fromEntries(
      notificationCategories.map((category) => [
        category,
        inAppNotificationEnabled(row, category)
      ])
    ) as Record<NotificationCategory, boolean>,
    pushCategories: (row?.notificationRecoveryRequired
      ? []
      : (row?.pushCategories ?? [])) as NotificationCategory[],
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
      email:
        feedbackEmailAvailable() &&
        !!(await tx.platformUser.findFirst({
          where: { id: session.userId, ...eligibleWhere },
          select: { id: true }
        }))
    }
  }));
}
export async function notificationPreferenceCommand(
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
    "quietHours",
    "feedbackEmail"
  ]);
  if (input.operation !== "preferences")
    throw new PortalError(400, "Choose a supported notification control.");
  const result = await socialCommand(
    db,
    token,
    "notification",
    input,
    async (tx, ownerId) => {
      const prior = await tx.socialPreferences.findUnique({
        where: { ownerId }
      });
      const old = projectNotificationPreferences(prior);
      expected(input.expectedVersion, old.version);
      const categories = input.pushCategories;
      const choices = input.inApp as Record<string, unknown> | undefined;
      if (
        !choices ||
        ![
          [...legacyInAppCategories].sort().join(),
          notificationCategories
            .filter(
              (c) =>
                c !== "groups" &&
                c !== "assistance" &&
                c !== "needs" &&
                c !== "exchange" &&
                c !== "handoffs"
            )
            .sort()
            .join(),
          notificationCategories
            .filter(
              (c) =>
                c !== "groups" &&
                c !== "assistance" &&
                c !== "needs" &&
                c !== "exchange" &&
                c !== "feedback" &&
                c !== "handoffs"
            )
            .sort()
            .join(),
          notificationCategories
            .filter(
              (c) =>
                c !== "groups" &&
                c !== "assistance" &&
                c !== "needs" &&
                c !== "feedback" &&
                c !== "handoffs"
            )
            .sort()
            .join(),
          notificationCategories
            .filter(
              (c) =>
                c !== "groups" &&
                c !== "assistance" &&
                c !== "needs" &&
                c !== "handoffs"
            )
            .sort()
            .join(),
          notificationCategories
            .filter(
              (c) => c !== "groups" && c !== "assistance" && c !== "needs"
            )
            .sort()
            .join(),
          notificationCategories
            .filter((c) => c !== "groups" && c !== "assistance")
            .sort()
            .join(),
          notificationCategories
            .filter((c) => c !== "groups")
            .sort()
            .join(),
          [...notificationCategories].sort().join()
        ].includes(Object.keys(choices).sort().join()) ||
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
      if (
        input.feedbackEmail !== undefined &&
        typeof input.feedbackEmail !== "boolean"
      )
        throw new PortalError(400, "Review the feedback email choice.");
      const email =
        input.feedbackEmail === undefined
          ? old.feedbackEmail
          : input.feedbackEmail;
      if (
        email &&
        !old.feedbackEmail &&
        (!feedbackEmailAvailable() ||
          !(await tx.platformUser.findFirst({
            where: { id: ownerId, ...eligibleWhere },
            select: { id: true }
          })))
      )
        throw new PortalError(
          503,
          "Feedback email is not available yet. You can still turn it off."
        );
      const quiet = parseQuietHours(input.quietHours);
      if (
        Object.keys(choices).length !== notificationCategories.length &&
        old.recoveryRequired
      )
        throw new PortalError(
          409,
          "Reload the current notification settings to review recovered choices."
        );
      const now = new Date();
      const nextInApp = { ...old.inApp, ...choices } as Record<
        NotificationCategory,
        boolean
      >;
      // An older settings form cannot remove categories it never displayed.
      const nextPush = [
        ...new Set([
          ...categories,
          ...old.pushCategories.filter(
            (category) => !Object.hasOwn(choices, category)
          )
        ])
      ].sort();
      const beforeSince = prior?.notificationPushSince;
      const pushSince = Object.fromEntries(
        nextPush.map((category) => [
          category,
          !old.pushCategories.includes(category)
            ? now.toISOString()
            : beforeSince &&
                typeof beforeSince === "object" &&
                !Array.isArray(beforeSince) &&
                typeof beforeSince[category] === "string"
              ? beforeSince[category]
              : category === "conversations"
                ? (prior?.conversationPushSince?.toISOString() ??
                  now.toISOString())
                : category === "prayer"
                  ? (prior?.prayerPushSince?.toISOString() ?? now.toISOString())
                  : category === "exchange" ||
                      category === "handoffs" ||
                      category === "needs" ||
                      category === "assistance" ||
                      category === "groups"
                    ? now.toISOString()
                    : new Date(0).toISOString()
        ])
      );
      const data = {
        feedbackEmailSince: email
          ? old.feedbackEmail
            ? prior!.feedbackEmailSince
            : now
          : null,
        notificationVersion: (prior?.notificationVersion ?? 0) + 1,
        notificationRecoveryRequired: false,
        mutedNotificationCategories: notificationCategories.filter(
          (c) => !nextInApp[c]
        ),
        notificationPushSince: pushSince,

        messageAlerts: choices.messages as boolean,
        requestAlerts: choices.requests as boolean,
        reportAlerts: choices.reports as boolean,
        founderAnnouncements: choices.founder as boolean,
        pushCategories: nextPush,
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
      await recordDiscoveryControl(
        tx,
        "NOTIFICATION_PREFERENCES",
        ownerId,
        ownerId,
        row.notificationVersion
      );
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
  if (!(await protectDiscoveryRecovery(db, result.id)))
    throw new PortalError(
      503,
      "Your notification choices are saved; their protected recovery receipt needs confirmation. Retry the same change."
    );
  return result;
}
