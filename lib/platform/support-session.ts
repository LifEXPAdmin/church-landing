import { cache } from "react";
import { privateCookies } from "./private-cookies";
import { prisma } from "@/lib/prisma";
import { PLATFORM_SESSION_COOKIE } from "./session";
import { readSupport } from "./support";
import type { SupportView } from "./support-types";
export const readSupportPage = cache(
  async (
    view: SupportView,
    caseId?: string,
    churchId?: string,
    page?: string
  ) => {
    const store = await privateCookies();
    return readSupport(
      prisma,
      store.get(PLATFORM_SESSION_COOKIE)?.value,
      view,
      { caseId, churchId, page }
    );
  }
);
