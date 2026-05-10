import { cookies, headers } from "next/headers";
import { cache } from "react";

import { createSessionToken, hashSessionToken } from "@/lib/platform/auth";
import { prisma } from "@/lib/prisma";

export const PLATFORM_SESSION_COOKIE = "church_platform_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export const getCurrentPlatformUser = cache(async () => {
  const cookieStore = await cookies();
  const token = cookieStore.get(PLATFORM_SESSION_COOKIE)?.value;

  if (!token) {
    return null;
  }

  const session = await prisma.platformSession.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    include: {
      user: {
        include: {
          _count: {
            select: {
              posts: true,
              followers: true,
              following: true
            }
          }
        }
      }
    }
  });

  if (!session || session.expiresAt <= new Date()) {
    return null;
  }

  return session.user;
});

export async function setPlatformSession(userId: string) {
  const token = createSessionToken();
  const headerStore = await headers();
  const cookieStore = await cookies();
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);

  await prisma.platformSession.create({
    data: {
      userId,
      tokenHash: hashSessionToken(token),
      expiresAt,
      userAgent: headerStore.get("user-agent")?.slice(0, 300) ?? null
    }
  });

  cookieStore.set(PLATFORM_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS
  });
}

export async function clearPlatformSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(PLATFORM_SESSION_COOKIE)?.value;

  if (token) {
    await prisma.platformSession.deleteMany({
      where: { tokenHash: hashSessionToken(token) }
    });
  }

  cookieStore.delete(PLATFORM_SESSION_COOKIE);
}
