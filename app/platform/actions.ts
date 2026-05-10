"use server";

import { PlatformPostType, PlatformRole } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { hashPassword, validatePassword, verifyPassword } from "@/lib/platform/auth";
import { prisma } from "@/lib/prisma";
import {
  clearPlatformSession,
  getCurrentPlatformUser,
  setPlatformSession
} from "@/lib/platform/session";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_REGEX = /^[a-z0-9_]{3,24}$/;
const roles = new Set(Object.values(PlatformRole));
const postTypes = new Set(Object.values(PlatformPostType));

function cleanUsername(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "");
}

function safeRedirectPath(value: FormDataEntryValue | null) {
  const path = String(value ?? "/platform");

  return path.startsWith("/platform") ? path : "/platform";
}

export async function createPlatformAccount(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const username = cleanUsername(String(formData.get("username") ?? ""));
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");
  const roleValue = String(formData.get("role") ?? "BELIEVER") as PlatformRole;
  const passwordError = validatePassword(password);

  if (
    name.length < 2 ||
    !USERNAME_REGEX.test(username) ||
    !EMAIL_REGEX.test(email) ||
    !roles.has(roleValue) ||
    passwordError ||
    password !== confirmPassword
  ) {
    redirect("/platform/login?error=invalid");
  }

  const existingByEmail = await prisma.platformUser.findUnique({ where: { email } });
  const passwordHash = await hashPassword(password);

  if (existingByEmail) {
    if (existingByEmail.passwordHash || existingByEmail.username !== username) {
      redirect("/platform/login?error=exists");
    }

    const user = await prisma.platformUser.update({
      where: { id: existingByEmail.id },
      data: {
        name,
        role: roleValue,
        passwordHash
      }
    });

    await setPlatformSession(user.id);
    redirect("/platform");
  }

  const existingUsername = await prisma.platformUser.findUnique({
    where: { username }
  });

  if (existingUsername) {
    redirect("/platform/login?error=username");
  }

  const user = await prisma.platformUser.create({
    data: {
      name,
      username,
      email,
      passwordHash,
      role: roleValue,
      bio: "I am exploring Church and The Revival.",
      interests: ["Prayer", "Community"]
    }
  });

  await setPlatformSession(user.id);
  redirect("/platform");
}

export async function loginPlatformAccount(formData: FormData) {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!EMAIL_REGEX.test(email) || !password) {
    redirect("/platform/login?error=login");
  }

  const user = await prisma.platformUser.findUnique({ where: { email } });

  if (!user) {
    redirect("/platform/login?error=missing");
  }

  if (!user.passwordHash) {
    redirect("/platform/login?error=needs-password");
  }

  const passwordMatches = await verifyPassword(password, user.passwordHash);

  if (!passwordMatches) {
    redirect("/platform/login?error=login");
  }

  await setPlatformSession(user.id);
  redirect("/platform");
}

export async function logoutPlatformAccount() {
  await clearPlatformSession();
  redirect("/platform/login");
}

export async function updatePlatformProfile(formData: FormData) {
  const currentUser = await getCurrentPlatformUser();

  if (!currentUser) {
    redirect("/platform/login");
  }

  const name = String(formData.get("name") ?? "").trim();
  const bio = String(formData.get("bio") ?? "")
    .trim()
    .slice(0, 500);
  const location = String(formData.get("location") ?? "")
    .trim()
    .slice(0, 80);
  const website = String(formData.get("website") ?? "")
    .trim()
    .slice(0, 120);
  const interests = String(formData.get("interests") ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 8);

  if (name.length < 2) {
    redirect("/platform/profile/me?error=name");
  }

  await prisma.platformUser.update({
    where: { id: currentUser.id },
    data: {
      name,
      bio: bio || null,
      location: location || null,
      website: website || null,
      interests
    }
  });

  revalidatePath("/platform");
  revalidatePath(`/platform/profile/${currentUser.username}`);
  redirect(`/platform/profile/${currentUser.username}`);
}

export async function createPlatformPost(formData: FormData) {
  const currentUser = await getCurrentPlatformUser();

  if (!currentUser) {
    redirect("/platform/login");
  }

  const content = String(formData.get("content") ?? "")
    .trim()
    .slice(0, 900);
  const scripture = String(formData.get("scripture") ?? "")
    .trim()
    .slice(0, 120);
  const typeValue = String(
    formData.get("type") ?? "UPDATE"
  ) as PlatformPostType;

  if (content.length < 3 || !postTypes.has(typeValue)) {
    redirect("/platform?error=post");
  }

  await prisma.platformPost.create({
    data: {
      authorId: currentUser.id,
      content,
      scripture: scripture || null,
      type: typeValue
    }
  });

  revalidatePath("/platform");
  redirect("/platform");
}

export async function deletePlatformPost(formData: FormData) {
  const currentUser = await getCurrentPlatformUser();

  if (!currentUser) {
    redirect("/platform/login");
  }

  const postId = String(formData.get("postId") ?? "");
  const redirectTo = safeRedirectPath(formData.get("redirectTo"));

  if (postId) {
    await prisma.platformPost.deleteMany({
      where: {
        id: postId,
        authorId: currentUser.id
      }
    });
  }

  revalidatePath("/platform");
  revalidatePath(`/platform/profile/${currentUser.username}`);
  redirect(redirectTo);
}

export async function followPlatformUser(formData: FormData) {
  const currentUser = await getCurrentPlatformUser();

  if (!currentUser) {
    redirect("/platform/login");
  }

  const followingId = String(formData.get("followingId") ?? "");
  const username = String(formData.get("username") ?? "");

  if (!followingId || followingId === currentUser.id) {
    redirect(`/platform/profile/${username}`);
  }

  await prisma.platformFollow.upsert({
    where: {
      followerId_followingId: {
        followerId: currentUser.id,
        followingId
      }
    },
    create: {
      followerId: currentUser.id,
      followingId
    },
    update: {}
  });

  revalidatePath("/platform");
  revalidatePath(`/platform/profile/${username}`);
  redirect(`/platform/profile/${username}`);
}

export async function unfollowPlatformUser(formData: FormData) {
  const currentUser = await getCurrentPlatformUser();

  if (!currentUser) {
    redirect("/platform/login");
  }

  const followingId = String(formData.get("followingId") ?? "");
  const username = String(formData.get("username") ?? "");

  await prisma.platformFollow.deleteMany({
    where: {
      followerId: currentUser.id,
      followingId
    }
  });

  revalidatePath("/platform");
  revalidatePath(`/platform/profile/${username}`);
  redirect(`/platform/profile/${username}`);
}

export async function togglePlatformPostLike(formData: FormData) {
  const currentUser = await getCurrentPlatformUser();

  if (!currentUser) {
    redirect("/platform/login");
  }

  const postId = String(formData.get("postId") ?? "");
  const redirectTo = safeRedirectPath(formData.get("redirectTo"));

  if (!postId) {
    redirect(redirectTo);
  }

  const existing = await prisma.platformPostLike.findUnique({
    where: {
      postId_userId: {
        postId,
        userId: currentUser.id
      }
    }
  });

  if (existing) {
    await prisma.platformPostLike.delete({
      where: {
        postId_userId: {
          postId,
          userId: currentUser.id
        }
      }
    });
  } else {
    await prisma.platformPostLike.create({
      data: {
        postId,
        userId: currentUser.id
      }
    });
  }

  revalidatePath("/platform");
  redirect(redirectTo);
}

export async function createPlatformPostComment(formData: FormData) {
  const currentUser = await getCurrentPlatformUser();

  if (!currentUser) {
    redirect("/platform/login");
  }

  const postId = String(formData.get("postId") ?? "");
  const redirectTo = safeRedirectPath(formData.get("redirectTo"));
  const content = String(formData.get("content") ?? "")
    .trim()
    .slice(0, 400);

  if (!postId || content.length < 2) {
    redirect(redirectTo);
  }

  await prisma.platformPostComment.create({
    data: {
      postId,
      authorId: currentUser.id,
      content
    }
  });

  revalidatePath("/platform");
  redirect(redirectTo);
}

export async function deletePlatformPostComment(formData: FormData) {
  const currentUser = await getCurrentPlatformUser();

  if (!currentUser) {
    redirect("/platform/login");
  }

  const commentId = String(formData.get("commentId") ?? "");
  const redirectTo = safeRedirectPath(formData.get("redirectTo"));

  if (commentId) {
    await prisma.platformPostComment.deleteMany({
      where: {
        id: commentId,
        authorId: currentUser.id
      }
    });
  }

  revalidatePath("/platform");
  redirect(redirectTo);
}
