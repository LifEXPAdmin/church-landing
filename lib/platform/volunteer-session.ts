import { prisma } from "@/lib/prisma";
import { privateCookies } from "./private-cookies";
import { PLATFORM_SESSION_COOKIE } from "./session";
import { readVolunteers } from "./volunteer-reads";
export async function volunteerPage(
  query: Parameters<typeof readVolunteers>[2]
) {
  const token =
    process.env.NODE_ENV === "production"
      ? (await privateCookies()).get(PLATFORM_SESSION_COOKIE)?.value
      : undefined;
  return readVolunteers(prisma, token, query);
}
