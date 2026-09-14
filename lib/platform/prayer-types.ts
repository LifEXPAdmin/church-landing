export const PRAYER_GUIDE_VERSION = "prayer-guide-v1";
export const prayerGuide = [
  "Read the post or comment carefully and respect its audience.",
  "Take time to pray before choosing I prayed. You can save it privately to return later.",
  "I prayed records your own statement. God’s Churches does not verify prayer or measure anyone’s faith.",
  "Your name stays hidden unless you deliberately share it with people who can read this content. You can undo your acknowledgment."
] as const;
export const prayerUpdateKinds = [
  "REQUESTING",
  "UPDATE",
  "PRAISE",
  "RESOLVED"
] as const;
export type PrayerUpdateKind = (typeof prayerUpdateKinds)[number];
export const prayerUpdateLabels: Record<PrayerUpdateKind, string> = {
  REQUESTING: "Still requesting prayer",
  UPDATE: "An update",
  PRAISE: "Praise report",
  RESOLVED: "Follow-up complete"
};
export type PrayerChoice = {
  version: number;
  acknowledged: boolean;
  shareName: boolean;
  saved: boolean;
  updates: boolean;
};
export type PrayerTargetState = {
  ownerId: string;
  postId: string;
  commentId: string | null;
  href: string;
  canAcknowledge: boolean;
  canUpdate: boolean;
  guide: { accepted: boolean; version: number; required: string };
  choice: PrayerChoice;
  count: number;
  names: Array<{ name: string; username: string }>;
  moreNames: boolean;
};
export type PrayerSavedPage = {
  ownerId: string;
  nextCursor: string | null;
  items: Array<{
    id: string;
    postId: string;
    commentId: string | null;
    savedAt: string;
    available: boolean;
    label: string | null;
    href: string | null;
    choice: PrayerChoice;
    latestUpdate: { kind: PrayerUpdateKind; createdAt: string } | null;
  }>;
};
export type PrayerUpdatePage = {
  ownerId: string;
  nextCursor: string | null;
  items: Array<{
    id: string;
    href: string;
    kind: PrayerUpdateKind;
    createdAt: string;
    edited: boolean;
    content: string;
  }>;
};
