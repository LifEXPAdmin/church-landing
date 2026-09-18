import { prisma } from "@/lib/prisma";
import { privateCookies } from "./private-cookies";
import { PLATFORM_SESSION_COOKIE } from "./session";
import { readPantry } from "./pantry-reads";
export async function pantryPage(query: Parameters<typeof readPantry>[2]) {
  const token =
    process.env.NODE_ENV === "production"
      ? (await privateCookies()).get(PLATFORM_SESSION_COOKIE)?.value
      : undefined;
  return readPantry(prisma, token, query);
}
