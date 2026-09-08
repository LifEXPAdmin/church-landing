import type { Prisma } from "@prisma/client";

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
export type PublicProfile = Prisma.PlatformUserGetPayload<{
  select: typeof publicProfileSelect;
}>;
