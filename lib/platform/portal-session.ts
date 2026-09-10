import { cache } from "react";
import { privateCookies } from "./private-cookies";

import { prisma } from "@/lib/prisma";
import { getPortalSnapshot } from "./portal";
import { PLATFORM_SESSION_COOKIE } from "./session";
import type { PortalView } from "./portal-types";

// Keep credential handling inside the server data boundary. Components only
// await a projected snapshot, never the request cookie collection or raw token.
export const readPortalPage = cache(
  async (view: PortalView, churchId?: string) => {
    const cookieStore = await privateCookies();
    const token = cookieStore.get(PLATFORM_SESSION_COOKIE)?.value;
    if (!token && (view === "discover" || view === "help")) return null;
    return getPortalSnapshot(prisma, token, view, churchId);
  }
);
