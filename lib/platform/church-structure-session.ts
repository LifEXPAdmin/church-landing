import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { privateCookies } from "./private-cookies";
import { PLATFORM_SESSION_COOKIE } from "./session";
import { getChurchStructure } from "./church-structure";

export const readChurchStructurePage = cache(
  async (options: Parameters<typeof getChurchStructure>[2]) => {
    const cookies = await privateCookies();
    return getChurchStructure(
      prisma,
      cookies.get(PLATFORM_SESSION_COOKIE)?.value,
      options
    );
  }
);
