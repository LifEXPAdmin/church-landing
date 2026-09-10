import { privateCookies } from "./private-cookies";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { hashSessionToken, validToken } from "./auth";
import { readAccountSession } from "./accounts";

export const PLATFORM_SESSION_COOKIE = "church_platform_session";
// Components receive only the account DTO; credentials stay inside this reader.
export const getCurrentPlatformUser = cache(() =>
  privateCookies().then((cookieStore) =>
    readAccountSession(prisma, cookieStore.get(PLATFORM_SESSION_COOKIE)?.value)
  )
);
export async function clearPlatformSession() {
  const cookieStore = await privateCookies();
  const token = cookieStore.get(PLATFORM_SESSION_COOKIE)?.value;
  if (validToken(token))
    await prisma.platformSession.deleteMany({
      where: { tokenHash: hashSessionToken(token) }
    });
  cookieStore.delete(PLATFORM_SESSION_COOKIE);
}
