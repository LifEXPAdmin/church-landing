import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { privateCookies } from "./private-cookies";
import { PLATFORM_SESSION_COOKIE } from "./session";
import { getChurchClaims } from "./church-claims";

export const readChurchClaimPage = cache(
  async (id?: string, review = false, cursor?: string, churchId?: string) => {
    const cookies = await privateCookies();
    return getChurchClaims(
      prisma,
      cookies.get(PLATFORM_SESSION_COOKIE)?.value,
      { id, review, cursor, churchId }
    );
  }
);
