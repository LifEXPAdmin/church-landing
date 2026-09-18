import { prisma } from "@/lib/prisma";
import { privateCookies } from "./private-cookies";
import { PLATFORM_SESSION_COOKIE } from "./session";
import { readGroupPage } from "./group-page-data";
export async function groupPage(query: Parameters<typeof readGroupPage>[2]) {
  const token =
    process.env.NODE_ENV === "production"
      ? (await privateCookies()).get(PLATFORM_SESSION_COOKIE)?.value
      : undefined;
  return readGroupPage(prisma, token, query);
}
