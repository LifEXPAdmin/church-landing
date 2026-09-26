import type { Prisma, SocialPreferences } from "@prisma/client";

export function calendarReminderMinutes(
  row: Pick<
    SocialPreferences,
    | "calendarReminderMinutes"
    | "calendarReminderSince"
    | "notificationRecoveryRequired"
  > | null
) {
  return row &&
    !row.notificationRecoveryRequired &&
    row.calendarReminderSince &&
    [15, 60].includes(row.calendarReminderMinutes)
    ? row.calendarReminderMinutes
    : 0;
}

export function volunteerReminderMinutes(
  row: Pick<
    SocialPreferences,
    | "volunteerReminderMinutes"
    | "volunteerReminderSince"
    | "notificationRecoveryRequired"
  > | null
) {
  return row &&
    !row.notificationRecoveryRequired &&
    row.volunteerReminderSince &&
    [15, 60].includes(row.volunteerReminderMinutes)
    ? row.volunteerReminderMinutes
    : 0;
}

/** Called under the existing permission/consent writer lock; this never sends. */
export async function wakeCalendarReminders(
  tx: Prisma.TransactionClient,
  ownerId: string,
  reset = false,
  now = new Date()
) {
  const preferences = await tx.socialPreferences.findUnique({
    where: { ownerId },
    select: {
      calendarReminderMinutes: true,
      calendarReminderSince: true,
      volunteerReminderMinutes: true,
      volunteerReminderSince: true,
      notificationRecoveryRequired: true
    }
  });
  if (
    !calendarReminderMinutes(preferences) &&
    !volunteerReminderMinutes(preferences)
  ) {
    if (reset) await tx.calendarReminderJob.deleteMany({ where: { ownerId } });
    return;
  }
  await tx.calendarReminderJob.upsert({
    where: { ownerId },
    create: { ownerId, wakeAt: now, throughAt: now },
    update: {
      version: { increment: 1 },
      wakeAt: now,
      dispatchedAt: null,
      dispatchClaimedAt: null
    }
  });
}
