import type { PostTx } from "./post-access";
import { recordDiscoveryControl } from "./retention-controls";
export const artistRightsEmpty = {
  rightsFingerprint: null,
  rightsPolicy: null,
  rightsBasis: null,
  rightsActorId: null,
  rightsAssertedAt: null,
  rightsExpiresAt: null
};
export const artistEmpty = {
  name: "",
  biography: "",
  roles: [],
  genres: [],
  countryId: null,
  townId: null,
  churchCredit: "",
  credits: [],
  fingerprint: null,
  ...artistRightsEmpty
};
export const releaseEmpty = {
  title: "",
  description: "",
  releaseDate: null,
  tracks: [],
  credits: [],
  links: [],
  fingerprint: null,
  ...artistRightsEmpty
};
async function held(tx: PostTx, type: "ARTIST" | "ARTIST_RELEASE", id: string) {
  return !!(await tx.communityReport.findFirst({
    where: { targetType: type, targetId: id },
    select: { id: true }
  }));
}
/** Selected canonical report evidence remains restricted until its final case expires. */
export async function purgeArtistEvidence(
  tx: PostTx,
  type: string,
  id: string
) {
  if (type === "ARTIST" && !(await held(tx, type, id)))
    await tx.artistProfile.updateMany({
      where: { id, removedAt: { not: null } },
      data: artistEmpty
    });
  if (type === "ARTIST_RELEASE" && !(await held(tx, type, id)))
    await tx.artistRelease.updateMany({
      where: { id, removedAt: { not: null } },
      data: releaseEmpty
    });
}
export async function exportArtists(tx: PostTx, userId: string, limit: number) {
  const artists = await tx.artistProfile.findMany({
    where: {
      stewardId: userId,
      removedAt: null,
      recoveryRequired: false,
      moderationState: "VISIBLE"
    },
    select: {
      id: true,
      version: true,
      presentation: true,
      name: true,
      biography: true,
      roles: true,
      genres: true,
      countryId: true,
      townId: true,
      churchCredit: true,
      credits: true,
      state: true,
      createdAt: true,
      updatedAt: true
    },
    take: limit + 1,
    orderBy: { id: "asc" }
  });
  const releases = await tx.artistRelease.findMany({
    where: {
      artistId: { in: artists.map((x) => x.id) },
      removedAt: null,
      recoveryRequired: false,
      moderationState: "VISIBLE"
    },
    select: {
      id: true,
      artistId: true,
      version: true,
      kind: true,
      title: true,
      description: true,
      releaseDate: true,
      tracks: true,
      credits: true,
      links: true,
      state: true,
      createdAt: true,
      updatedAt: true
    },
    take: limit + 1,
    orderBy: { id: "asc" }
  });
  const artistDelegations = await tx.artistDelegate.findMany({
    where: { accountId: userId },
    select: {
      artistId: true,
      capabilities: true,
      state: true,
      acceptedAt: true,
      revokedAt: true,
      expiresAt: true
    },
    take: limit + 1,
    orderBy: { id: "asc" }
  });
  return {
    artistProfiles: artists,
    artistReleases: releases,
    artistDelegations
  };
}
export async function eraseArtists(tx: PostTx, userId: string, now: Date) {
  const artists = await tx.artistProfile.findMany({
    where: { stewardId: userId },
    select: { id: true, controlVersion: true }
  });
  for (const a of artists) {
    await tx.artistProfile.update({
      where: { id: a.id },
      data: {
        stewardId: null,
        state: "REMOVED",
        removedAt: now,
        version: { increment: 1 },
        controlVersion: { increment: 1 },
        ...artistRightsEmpty
      }
    });
    await tx.artistDelegate.updateMany({
      where: { artistId: a.id },
      data: { state: "REVOKED", revokedAt: now, version: { increment: 1 } }
    });
    await tx.artistEventAssociation.updateMany({
      where: { artistId: a.id },
      data: { revokedAt: now, version: { increment: 1 } }
    });
    const releases = await tx.artistRelease.findMany({
      where: { artistId: a.id },
      select: { id: true, controlVersion: true }
    });
    for (const r of releases) {
      await tx.artistRelease.update({
        where: { id: r.id },
        data: {
          state: "REMOVED",
          removedAt: now,
          version: { increment: 1 },
          controlVersion: { increment: 1 },
          ...artistRightsEmpty
        }
      });
      await purgeArtistEvidence(tx, "ARTIST_RELEASE", r.id);
      await recordDiscoveryControl(
        tx,
        "ARTIST_RELEASE",
        userId,
        r.id,
        r.controlVersion + 1
      );
    }
    await purgeArtistEvidence(tx, "ARTIST", a.id);
    await recordDiscoveryControl(
      tx,
      "ARTIST",
      userId,
      a.id,
      a.controlVersion + 1
    );
  }
  const grants = await tx.artistDelegate.findMany({
    where: { accountId: userId },
    select: { artistId: true }
  });
  for (const g of grants) {
    const a = await tx.artistProfile.update({
      where: { id: g.artistId },
      data: { controlVersion: { increment: 1 } }
    });
    await recordDiscoveryControl(tx, "ARTIST", userId, a.id, a.controlVersion);
  }
  await tx.artistDelegate.deleteMany({ where: { accountId: userId } });
  const associationArtists = await tx.artistEventAssociation.findMany({
    where: { OR: [{ proposedById: userId }, { acceptedById: userId }] },
    select: { artistId: true },
    distinct: ["artistId"]
  });
  for (const association of associationArtists) {
    const artist = await tx.artistProfile.update({
      where: { id: association.artistId },
      data: { controlVersion: { increment: 1 } }
    });
    await recordDiscoveryControl(
      tx,
      "ARTIST",
      userId,
      artist.id,
      artist.controlVersion
    );
  }
  await tx.artistEventAssociation.updateMany({
    where: { OR: [{ proposedById: userId }, { acceptedById: userId }] },
    data: {
      revokedAt: now,
      proposedById: null,
      acceptedById: null,
      version: { increment: 1 }
    }
  });
  await tx.artistProfile.updateMany({
    where: { rightsActorId: userId },
    data: { ...artistRightsEmpty }
  });
  await tx.artistRelease.updateMany({
    where: { rightsActorId: userId },
    data: { ...artistRightsEmpty }
  });
  await tx.artistAudit.updateMany({
    where: { actorId: userId },
    data: { actorId: null }
  });
}
export async function replayArtistControl(
  tx: PostTx,
  kind: "ARTIST" | "ARTIST_RELEASE" | "ARTIST_FOLLOW",
  id: string,
  version: number,
  now: Date
) {
  if (kind === "ARTIST_FOLLOW") {
    await tx.socialRelationship.updateMany({
      where: { id, artistId: { not: null }, version: { lt: version } },
      data: { followingArtist: false, followingSince: null, version }
    });
    return;
  }
  if (kind === "ARTIST") {
    const prior = await tx.artistProfile.findUnique({
      where: { id },
      select: { controlVersion: true }
    });
    if (prior && prior.controlVersion >= version) return;
    await tx.artistProfile.upsert({
      where: { id },
      create: {
        id,
        state: "UNPUBLISHED",
        recoveryRequired: true,
        controlVersion: version,
        version
      },
      update: {
        state: "UNPUBLISHED",
        recoveryRequired: true,
        controlVersion: version,
        version,
        ...artistRightsEmpty
      }
    });
    await tx.artistDelegate.updateMany({
      where: { artistId: id, revokedAt: null },
      data: { state: "REVOKED", revokedAt: now, version: { increment: 1 } }
    });
    await tx.artistEventAssociation.updateMany({
      where: { artistId: id, revokedAt: null },
      data: { revokedAt: now, version: { increment: 1 } }
    });
    return;
  }
  const prior = await tx.artistRelease.findUnique({
    where: { id },
    select: { controlVersion: true }
  });
  if (prior && prior.controlVersion >= version) return;
  await tx.artistRelease.upsert({
    where: { id },
    create: {
      id,
      state: "UNPUBLISHED",
      recoveryRequired: true,
      controlVersion: version,
      version
    },
    update: {
      state: "UNPUBLISHED",
      recoveryRequired: true,
      controlVersion: version,
      version,
      ...artistRightsEmpty
    }
  });
}

/** Retire all restored execution authority even when journal and backup checkpoints match. */
export async function quarantineArtists(tx: PostTx, now: Date) {
  const artists = await tx.artistProfile.updateMany({
    where: { recoveryRequired: false },
    data: { recoveryRequired: true, ...artistRightsEmpty }
  });
  const releases = await tx.artistRelease.updateMany({
    where: { recoveryRequired: false },
    data: { recoveryRequired: true, ...artistRightsEmpty }
  });
  const delegates = await tx.artistDelegate.updateMany({
    where: { revokedAt: null },
    data: { state: "REVOKED", revokedAt: now, version: { increment: 1 } }
  });
  const events = await tx.artistEventAssociation.updateMany({
    where: { revokedAt: null },
    data: { revokedAt: now, version: { increment: 1 } }
  });
  return {
    artists: artists.count,
    releases: releases.count,
    delegates: delegates.count,
    events: events.count
  };
}
