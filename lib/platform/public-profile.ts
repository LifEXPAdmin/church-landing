import type { Prisma } from "@prisma/client";

export const activePublicAccount = {
  suspendedAt: null,
  deactivatedAt: null
} satisfies Prisma.PlatformUserWhereInput;

export const publicProfileSelect = {
  id: true,
  name: true,
  username: true,
  role: true,
  bio: true,
  location: true,
  website: true,
  interests: true
} satisfies Prisma.PlatformUserSelect;
export const communityAuthorSelect = {
  id: true,
  name: true,
  username: true,
  role: true
} satisfies Prisma.PlatformUserSelect;
export type CommunityAuthor = Prisma.PlatformUserGetPayload<{
  select: typeof communityAuthorSelect;
}>;
export type PublicProfile = Prisma.PlatformUserGetPayload<{
  select: typeof publicProfileSelect;
}>;
