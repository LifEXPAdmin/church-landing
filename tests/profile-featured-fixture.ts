import type { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import {
  assertPortalTestDatabase,
  createPortalActor,
  type PortalActor
} from "./seed-portal";
import { postCommand } from "../lib/platform/post-commands";
import { mediaCatalogCommand } from "../lib/platform/media-catalog-commands";
import { mediaFields } from "../lib/platform/media-catalog-input";
import { MEDIA_POLICY } from "../lib/platform/media-catalog-options";
import { getProfileEditor } from "../lib/platform/profiles";
import { updateAccountProfile } from "../lib/platform/accounts";
import { emptyProfileModules } from "../lib/platform/profile-modules";
import type { ProfileFeaturedReference } from "../lib/platform/profile-featured-input";
export async function featuredFixture(db: PrismaClient) {
  await assertPortalTestDatabase(db);
  const owner = await createPortalActor(db, "featuredowner"),
    member = await createPortalActor(db, "featuredmember"),
    outsider = await createPortalActor(db, "featuredother");
  const church = await db.church.create({
    data: {
      slug: randomUUID(),
      name: "Fictional featured church",
      summary: "Isolated feature fixture",
      communityListed: true
    }
  });
  await db.churchConnection.createMany({
    data: [owner, member].map((actor) => ({
      userId: actor.id,
      churchId: church.id,
      state: "APPROVED"
    }))
  });
  await db.churchCapabilityGrant.create({
    data: {
      userId: owner.id,
      churchId: church.id,
      capability: "PUBLISH_CHURCH_POSTS"
    }
  });
  const listing = await db.exchangeListing.create({
    data: {
      ownerId: owner.id,
      creatorId: owner.id,
      state: "ACTIVE",
      publishedAt: new Date(),
      confirmedAt: new Date(),
      itemPolicy: "exchange-listings-v3",
      category: "BOOKS",
      condition: "GOOD",
      country: "US",
      placeId: 4887398,
      placeLabel: "Chicago",
      title: "Fictional featured books",
      description: "PRIVATE listing extended description"
    }
  });
  const post = await postCommand(db, owner.token, {
    operation: "create",
    requestKey: randomUUID(),
    content: "Fictional opportunity backing post",
    audience: "CHURCH",
    authorChurchId: church.id
  });
  const opportunity = await db.volunteerOpportunity.create({
    data: {
      postId: post.id,
      title: "Fictional featured opportunity",
      contact: "PRIVATE coordinator contact",
      requirements: "PRIVATE application requirements",
      commitment: "One hour",
      capacity: 3,
      duties: "PRIVATE duties"
    }
  });
  const fields = mediaFields({
    title: "Fictional featured sermon",
    description: "PRIVATE media description",
    format: "SERMON",
    presentation: "VIDEO",
    audience: "PUBLIC",
    details: { preachedOn: null },
    sourceUrl: "https://youtu.be/abcdefghijk"
  });
  const reviewed = {
    fields,
    acknowledgment: {
      policy: MEDIA_POLICY,
      sourceUrl: fields.sourceUrl,
      audience: fields.audience,
      accepted: true
    },
    rights: {
      basis: "OWN",
      reviewed: true,
      publicRecording: true,
      textRights: true
    }
  };
  const media = await mediaCatalogCommand(db, owner.token, {
    operation: "create",
    mutationId: randomUUID(),
    ownerChurchId: null,
    ...reviewed
  });
  await mediaCatalogCommand(db, owner.token, {
    operation: "publish",
    mutationId: randomUUID(),
    itemId: media.id,
    expectedVersion: media.version,
    ...reviewed
  });
  const references: ProfileFeaturedReference[] = [
    { kind: "exchangeListing", id: listing.id },
    { kind: "volunteerOpportunity", id: opportunity.id },
    { kind: "mediaCatalogItem", id: media.id }
  ];
  return {
    owner,
    member,
    outsider,
    church,
    post,
    listing,
    opportunity,
    media: { ...media, title: fields.title },
    references
  };
}
export async function saveFeatured(
  db: PrismaClient,
  actor: PortalActor,
  references: ProfileFeaturedReference[],
  extra: Record<string, unknown> = {}
) {
  const current = await getProfileEditor(db, actor.token);
  return updateAccountProfile(
    db,
    actor.token,
    {
      name: actor.name,
      expectedVersion: current.presentation.version,
      profileModules: {
        ...emptyProfileModules(),
        featuredResources: references
      },
      ...extra
    },
    actor.id
  );
}
