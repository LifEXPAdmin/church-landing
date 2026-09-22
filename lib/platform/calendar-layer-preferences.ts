import type { CalendarLayerPreference } from "@prisma/client";
import { expected, PortalError } from "./portal-policy";
import {
  calendarId,
  calendarInclude,
  calendarVisible,
  type CalendarContext,
  type CalendarTx
} from "./calendar-access";
import { calendarLayerColor } from "./calendar-layer-options";
import { recordDiscoveryControl } from "./retention-controls";

export function projectCalendarLayer(row?: CalendarLayerPreference | null) {
  return {
    followed: row?.followed ?? true,
    visible: row?.visible ?? true,
    color: calendarLayerColor(row?.color ?? "DEFAULT")?.value ?? "DEFAULT",
    version: row?.version ?? 0,
    recoveryRequired: row?.recoveryRequired ?? false
  };
}

export async function saveCalendarLayer(
  tx: CalendarTx,
  context: CalendarContext,
  input: Record<string, unknown>
): Promise<{
  id: string;
  version: number;
  message: string;
  occurrenceId?: undefined;
}> {
  if (!context.actor)
    throw new PortalError(401, "Sign in to save calendar choices.");
  const allowed = [
    "operation",
    "calendarId",
    "followed",
    "visible",
    "color",
    "expectedVersion",
    "requestKey"
  ];
  if (Object.keys(input).some((key) => !allowed.includes(key)))
    throw new PortalError(
      400,
      "Use only your calendar layer choices for this save."
    );
  if (
    typeof input.followed !== "boolean" ||
    typeof input.visible !== "boolean" ||
    !calendarLayerColor(input.color)
  )
    throw new PortalError(
      400,
      "Choose whether to follow and show this calendar, and a supported color."
    );
  const ownerId = context.actor.id,
    id = calendarId(input.calendarId),
    requestKey = calendarId(input.requestKey);
  const calendar = await tx.platformCalendar.findUnique({
    where: { id },
    include: calendarInclude
  });
  // A retry also needs current access; a saved preference grants nothing.
  if (!calendar || !(await calendarVisible(tx, context, calendar)))
    throw new PortalError(
      404,
      "This calendar is not available. Refresh your calendars to check current access."
    );
  const prior = await tx.calendarLayerPreference.findUnique({
    where: { ownerId_calendarId: { ownerId, calendarId: id } }
  });
  const data = {
    followed: input.followed,
    visible: input.visible,
    color: calendarLayerColor(input.color)!.value,
    recoveryRequired: false,
    requestKey
  };
  const result = (version: number) => ({
    id,
    version,
    message:
      "Your calendar choices are saved. They do not change sharing or event responses."
  });
  if (
    prior?.requestKey === requestKey &&
    !prior.recoveryRequired &&
    typeof input.expectedVersion === "number" &&
    prior.version === input.expectedVersion + 1 &&
    prior.followed === data.followed &&
    prior.visible === data.visible &&
    prior.color === data.color
  )
    return result(prior.version);
  if (prior?.requestKey === requestKey)
    throw new PortalError(
      409,
      "This save key already belongs to a different choice. Refresh and review your saved choices."
    );
  expected(input.expectedVersion, prior?.version ?? 0);
  const row = await tx.calendarLayerPreference.upsert({
    where: { ownerId_calendarId: { ownerId, calendarId: id } },
    create: { ownerId, calendarId: id, ...data },
    update: { ...data, version: { increment: 1 } }
  });
  await recordDiscoveryControl(tx, "CALENDAR_LAYER", ownerId, id, row.version);
  return result(row.version);
}
