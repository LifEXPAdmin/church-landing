import { cache } from "react";
import { privateCookies } from "./private-cookies";
import { PLATFORM_SESSION_COOKIE } from "./session";
import { prisma } from "@/lib/prisma";
import { readAdminNavigation } from "./admin-authority";
export const readAdminPageNavigation = cache(async () => {
  const cookies = await privateCookies();
  return readAdminNavigation(
    prisma,
    cookies.get(PLATFORM_SESSION_COOKIE)?.value
  );
});
