import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { privateCookies } from "./private-cookies";
import { PLATFORM_SESSION_COOKIE } from "./session";
import { getChurchListings } from "./church-listings";

export const readChurchListingPage = cache(
  async (id?: string, review = false, cursor?: string) => {
    const cookies = await privateCookies();
    return getChurchListings(
      prisma,
      cookies.get(PLATFORM_SESSION_COOKIE)?.value,
      id,
      review,
      cursor
    );
  }
);
