import type { PlatformPostType, PlatformRole } from "@prisma/client";

export const roleLabels: Record<PlatformRole, string> = {
  BELIEVER: "Believer",
  CHURCH: "Church",
  CREATOR: "Creator",
  BUSINESS: "Business",
  BUILDER: "Builder"
};

export const postTypeLabels: Record<PlatformPostType, string> = {
  TESTIMONY: "Testimony",
  PRAYER: "Prayer",
  TEACHING: "Teaching",
  UPDATE: "Update",
  NEED: "Need"
};

export function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}
