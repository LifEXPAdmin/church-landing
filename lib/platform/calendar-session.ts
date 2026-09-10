import "server-only";
import { prisma } from "@/lib/prisma";
import { privateCookies } from "./private-cookies";
import { PLATFORM_SESSION_COOKIE } from "./session";
import {
  getCalendars,
  getCalendarDetails,
  getCalendarAgenda,
  getCalendarEvent,
  getCalendarCommitments
} from "./calendar-reads";
async function token() {
  return (await privateCookies()).get(PLATFORM_SESSION_COOKIE)?.value;
}
export const readCalendars = async (
  options: Parameters<typeof getCalendars>[2]
) => getCalendars(prisma, await token(), options);
export const readCalendar = async (id: string) =>
  getCalendarDetails(prisma, await token(), id);
export const readCalendarAgenda = async (
  options: Parameters<typeof getCalendarAgenda>[2]
) => getCalendarAgenda(prisma, await token(), options);
export const readCalendarEvent = async (id: string) =>
  getCalendarEvent(prisma, await token(), id);
export const readCalendarCommitments = async (
  options: Parameters<typeof getCalendarCommitments>[2]
) => getCalendarCommitments(prisma, await token(), options);
