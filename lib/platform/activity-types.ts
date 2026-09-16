export const activityCategories = [
  "messages",
  "requests",
  "comments",
  "reports",
  "founder",
  "posts",
  "reactions",
  "prayer",
  "church",
  "commitments",
  "feedback",
  "photos",
  "exchange",
  "handoffs"
] as const;
export type ActivityCategory = (typeof activityCategories)[number];
export type ActivityPage = {
  ownerId: string;
  boundary: string;
  nextCursor: string | null;
  unread: number;
  items: Array<{
    id: string;
    category: ActivityCategory;
    createdAt: string;
    count: number;
    unread: number;
    available: boolean;
    summary: string | null;
    href: string | null;
  }>;
  categories: readonly ActivityCategory[];
};
