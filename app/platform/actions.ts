"use server";
import { redirect } from "next/navigation";
import { clearPlatformSession } from "@/lib/platform/session";
export async function logoutPlatformAccount() {
  await clearPlatformSession();
  redirect("/platform/login");
}
