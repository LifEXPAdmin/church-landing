import type { Prisma } from "@prisma/client";
import { postReadableWhere, type PostContext } from "./post-access";

// Church is the canonical published profile. Both private setup branches use
// separate draft tables until publication/activation. communityListed denotes
// unofficial provenance, not visibility; authority loss preserves public facts.
export const publicChurchWhere = {} satisfies Prisma.ChurchWhereInput;
export const publicEventWhere = {
  canceledAt: null,
  event: {
    canceledAt: null,
    visibility: "PUBLIC",
    calendar: { archivedAt: null, churchId: { not: null } }
  }
} satisfies Prisma.CalendarOccurrenceWhereInput;

export function publicDiscoverablePostWhere(
  context: PostContext
): Prisma.PlatformPostWhereInput {
  return {
    AND: [
      postReadableWhere(context),
      {
        audience: "PUBLIC",
        OR: [{ repostKind: null }, { repostKind: { not: "PLAIN" } }]
      },
      {
        OR: [
          { type: { not: "PRAYER" }, contentNote: null },
          { safeExcerpt: { not: null }, NOT: { safeExcerpt: "" } }
        ]
      }
    ]
  };
}
