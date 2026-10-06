import type { PrismaClient } from "@prisma/client";
import { withPostRead } from "./post-access";
import { PortalError } from "./portal-policy";
import { socialUserWhere } from "./social-policy";
import { readProfileModules } from "./profile-modules";
import {
  profileFeaturedReferences,
  type ProfileFeaturedReference
} from "./profile-featured-input";
import {
  resolvePostResourcesIn,
  resourceCards
} from "./post-resource-attachments";

export function getProfileFeaturedChoices(
  db: PrismaClient,
  token: unknown,
  value: unknown,
  expectedOwner: string | null
) {
  let references: ProfileFeaturedReference[];
  try {
    references = profileFeaturedReferences(value);
  } catch {
    throw new PortalError(
      400,
      "Choose up to six distinct listing, opportunity or media references."
    );
  }
  return withPostRead(db, token, async (tx, context) => {
    if (!expectedOwner || context.actorId !== expectedOwner)
      throw new PortalError(
        401,
        "Your sign-in changed. Reload before continuing."
      );
    if (!context.eligible)
      throw new PortalError(
        403,
        "A verified adult account is required to choose featured resources."
      );
    return {
      viewerId: context.actorId,
      resources: resourceCards(
        references,
        await resolvePostResourcesIn(tx, context, references)
      )
    };
  });
}

/** One bounded read of current profile access, current references and source access. */
export function getProfileFeaturedResources(
  db: PrismaClient,
  token: unknown,
  username: string,
  memberPreview: boolean,
  expectedOwner: string | null
) {
  return withPostRead(db, token, async (tx, context) => {
    if (!expectedOwner || context.actorId !== expectedOwner)
      throw new PortalError(
        401,
        "Your sign-in changed. Reload before continuing."
      );
    const profile = await tx.platformUser.findFirst({
      where: { username, ...socialUserWhere(context) },
      select: {
        id: true,
        presentation: { select: { version: true, modules: true } }
      }
    });
    if (!profile) throw new PortalError(404, "This profile is unavailable.");
    const reader =
      memberPreview && profile.id === context.actorId
        ? {
            actorId: null,
            churches: [],
            publishers: new Set<string>(),
            moderators: new Set<string>(),
            volunteers: new Set<string>()
          }
        : context;
    const references =
      readProfileModules(profile.presentation?.modules).featuredResources ?? [];
    return {
      viewerId: context.actorId,
      profileId: profile.id,
      version: profile.presentation?.version ?? 0,
      resources: resourceCards(
        references,
        await resolvePostResourcesIn(tx, reader, references)
      )
    };
  });
}
