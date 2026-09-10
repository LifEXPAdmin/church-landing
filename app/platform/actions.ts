"use server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { AccountError } from "@/lib/platform/accounts";
import { communityCommand } from "@/lib/platform/community";
import {
  safeAccountReturn,
  accountEntryHref
} from "@/lib/platform/account-entry";
import {
  clearPlatformSession,
  PLATFORM_SESSION_COOKIE
} from "@/lib/platform/session";

function safeRedirectPath(value: FormDataEntryValue | null) {
  return safeAccountReturn(value);
}
async function command(
  operation: Parameters<typeof communityCommand>[2],
  formData: FormData
) {
  const token = (await cookies()).get(PLATFORM_SESSION_COOKIE)?.value;
  try {
    await communityCommand(
      prisma,
      token,
      operation,
      Object.fromEntries(formData)
    );
  } catch (error) {
    if (error instanceof AccountError && error.code === "session")
      redirect(
        accountEntryHref(
          "join",
          formData.get("redirectTo"),
          operation === "like"
            ? "like"
            : operation === "comment"
              ? "comment"
              : "participate"
        )
      );
    throw error;
  }
  revalidatePath("/platform");
  revalidatePath("/platform/search");
  revalidatePath("/platform/profile/[username]", "page");
  revalidatePath("/platform/posts/[postId]", "page");
}
export async function logoutPlatformAccount() {
  await clearPlatformSession();
  redirect("/platform/login");
}
export async function createPlatformPost(formData: FormData) {
  await command("post", formData);
  redirect("/platform");
}
export async function deletePlatformPost(formData: FormData) {
  await command("delete-post", formData);
  redirect(safeRedirectPath(formData.get("redirectTo")));
}
function profilePath(formData: FormData) {
  const name = String(formData.get("username") ?? "");
  return /^[a-z0-9_]{3,24}$/.test(name)
    ? `/platform/profile/${name}`
    : "/platform";
}
export async function followPlatformUser(formData: FormData) {
  await command("follow", formData);
  redirect(profilePath(formData));
}
export async function unfollowPlatformUser(formData: FormData) {
  await command("unfollow", formData);
  redirect(profilePath(formData));
}
export async function togglePlatformPostLike(formData: FormData) {
  await command("like", formData);
  redirect(safeRedirectPath(formData.get("redirectTo")));
}
export async function createPlatformPostComment(formData: FormData) {
  await command("comment", formData);
  redirect(safeRedirectPath(formData.get("redirectTo")));
}
export async function deletePlatformPostComment(formData: FormData) {
  await command("delete-comment", formData);
  redirect(safeRedirectPath(formData.get("redirectTo")));
}
