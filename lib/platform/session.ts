import { cookies } from "next/headers";
import { cache } from "react";

import { prisma } from "@/lib/prisma";

export const PLATFORM_SESSION_COOKIE = "church_platform_user";

export const getCurrentPlatformUser = cache(async () => {
  const cookieStore = await cookies();
  const userId = cookieStore.get(PLATFORM_SESSION_COOKIE)?.value;

  if (!userId) {
    return null;
  }

  return prisma.platformUser.findUnique({
    where: { id: userId },
    include: {
      _count: {
        select: {
          posts: true,
          followers: true,
          following: true
        }
      }
    }
  });
});

export async function setPlatformSession(userId: string) {
  const cookieStore = await cookies();
  cookieStore.set(PLATFORM_SESSION_COOKIE, userId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30
  });
}

export async function clearPlatformSession() {
  const cookieStore = await cookies();
  cookieStore.delete(PLATFORM_SESSION_COOKIE);
}
