import { getDiscoveryPlace } from "./discovery-places";
import { communityReportIntakeAvailable } from "./community-reports";
import { purgeArtistEvidence } from "./artist-retention";
import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { postContext, type PostTx } from "./post-access";
import { socialCommand, socialInput, socialKey } from "./social-operations";
import { expected, eligibleWhere, PortalError } from "./portal-policy";
import { postId } from "./post-input";
import {
  artistAuthority,
  artistAssertionCurrent,
  artistPublicId,
  artistUnavailable,
  requireArtistActor
} from "./artist-policy";
import {
  artistFields,
  releaseFields,
  artistFingerprint,
  artistRights,
  requireReleasePublication
} from "./artist-input";
import { ARTIST_POLICY, artistCapabilities } from "./artist-types";
import { recordDiscoveryControl } from "./retention-controls";
import { protectDiscoveryRecovery } from "./discovery-recovery";
import { artistEventCommand, eventApprover } from "./artist-reads";
const ops = [
  "create",
  "save",
  "publish",
  "unpublish",
  "remove",
  "withdraw-rights",
  "create-release",
  "save-release",
  "publish-release",
  "unpublish-release",
  "remove-release",
  "withdraw-release-rights",
  "invite",
  "accept-invite",
  "revoke-invite",
  "step-down",
  "propose-event",
  "accept-event",
  "revoke-event"
];
const rightsEmpty = {
  rightsFingerprint: null,
  rightsPolicy: null,
  rightsBasis: null,
  rightsActorId: null,
  rightsAssertedAt: null,
  rightsExpiresAt: null
};
export async function artistControl(tx: PostTx, id: string, actorId: string) {
  const row = await tx.artistProfile.update({
    where: { id },
    data: { controlVersion: { increment: 1 } },
    select: { controlVersion: true }
  });
  await recordDiscoveryControl(tx, "ARTIST", actorId, id, row.controlVersion);
}
async function currentAccess(
  tx: PostTx,
  actorId: string,
  input: Record<string, unknown>,
  replay = false
) {
  const c = await postContext(tx, actorId);
  requireArtistActor(c);
  const op = String(input.operation);
  if (op === "create") {
    if (replay) {
      const prior = await tx.socialOperation.findUnique({
        where: {
          ownerId_key: {
            ownerId: actorId,
            key: `artists:${socialKey(input.mutationId)}`
          }
        }
      });
      if (prior) {
        const receipt = prior.result as { id: string };
        const row = await tx.artistProfile.findFirst({
          where: {
            id: receipt.id,
            stewardId: actorId,
            removedAt: null,
            recoveryRequired: false,
            steward: eligibleWhere
          }
        });
        if (!row) throw artistUnavailable();
      }
    }
    return { c, scope: null };
  }
  const artistId = postId(input.artistId);
  if (replay && op === "remove") {
    const row = await tx.artistProfile.findFirst({
      where: {
        id: artistId,
        stewardId: actorId,
        state: "REMOVED",
        steward: eligibleWhere
      }
    });
    if (row)
      return {
        c,
        scope: { row, steward: true, can: () => true, delegate: null }
      };
  }
  if (op === "revoke-event") {
    const association = await tx.artistEventAssociation.findFirst({
        where: { id: postId(input.associationId), artistId }
      }),
      row = await tx.artistProfile.findUnique({ where: { id: artistId } });
    if (!association || !row) throw artistUnavailable();
    const steward = row.stewardId === actorId;
    if (!steward)
      await eventApprover(tx, actorId, association.occurrenceId, true);
    if (replay && !association.revokedAt)
      throw new PortalError(
        409,
        "This association changed after revocation. Review its current state."
      );
    return { c, scope: { row, steward, can: () => steward, delegate: null } };
  }
  const scope = await artistAuthority(tx, c, artistId);
  if (["accept-invite", "step-down"].includes(op)) {
    if (!scope.delegate || scope.delegate.accountId !== actorId)
      throw artistUnavailable();
    if (
      replay &&
      op === "accept-invite" &&
      (scope.delegate.state !== "ACCEPTED" ||
        scope.delegate.revokedAt ||
        scope.delegate.version !== Number(input.expectedVersion) + 1)
    )
      throw artistUnavailable();
    return { c, scope };
  }
  if (op === "accept-event") {
    const association = await tx.artistEventAssociation.findFirst({
      where: { id: postId(input.associationId), artistId }
    });
    if (!association || !(await artistPublicId(tx, c, artistId)))
      throw artistUnavailable();
    await eventApprover(tx, actorId, association.occurrenceId);
    if (
      replay &&
      (!association.acceptedAt ||
        association.revokedAt ||
        association.acceptedById !== actorId ||
        association.version !== Number(input.expectedVersion) + 1)
    )
      throw artistUnavailable();
    return { c, scope };
  }
  if (
    [
      "invite",
      "revoke-invite",
      "publish",
      "unpublish",
      "remove",
      "withdraw-rights"
    ].includes(op) &&
    !scope.steward
  )
    throw artistUnavailable();
  if (op === "save" && !scope.can("EDIT_ARTIST_PROFILE"))
    throw artistUnavailable();
  if (op === "propose-event" && !scope.steward) throw artistUnavailable();
  if (op.includes("release")) {
    if (
      !scope.can("PUBLISH_ARTIST_RELEASES") &&
      !scope.can("EDIT_ARTIST_RELEASES")
    )
      throw artistUnavailable();
    if (op !== "create-release") {
      const row = await tx.artistRelease.findFirst({
        where: {
          id: postId(input.releaseId),
          artistId,
          ...(replay && op === "remove-release" ? {} : { removedAt: null }),
          recoveryRequired: false
        }
      });
      if (
        !row ||
        (!scope.can("PUBLISH_ARTIST_RELEASES") &&
          (row.state !== "DRAFT" || op !== "save-release"))
      )
        throw artistUnavailable();
      if (
        replay &&
        ["save-release", "publish-release"].includes(op) &&
        input.rights &&
        (!(await artistAssertionCurrent(tx, c, scope.row, row, true)) ||
          row.rightsFingerprint !==
            artistFingerprint(releaseFields(input.fields)) ||
          row.moderationState !== "VISIBLE" ||
          (row.rightsExpiresAt && row.rightsExpiresAt <= new Date()))
      )
        throw new PortalError(
          409,
          "This release permission changed. Review its current state."
        );
      if (
        replay &&
        op === "publish-release" &&
        (row.state !== "PUBLISHED" ||
          row.moderationState !== "VISIBLE" ||
          !row.rightsFingerprint ||
          (row.rightsExpiresAt && row.rightsExpiresAt <= new Date()))
      )
        throw new PortalError(
          409,
          "This release is no longer published. Reload its current state."
        );
    }
  }
  if (
    replay &&
    ["save", "publish"].includes(op) &&
    input.rights &&
    (!(await artistAssertionCurrent(tx, c, scope.row, scope.row)) ||
      scope.row.rightsFingerprint !==
        artistFingerprint(artistFields(input.fields)) ||
      scope.row.moderationState !== "VISIBLE" ||
      (scope.row.rightsExpiresAt && scope.row.rightsExpiresAt <= new Date()))
  )
    throw new PortalError(
      409,
      "This artist permission changed. Review its current state."
    );
  if (
    replay &&
    op === "publish" &&
    (scope.row.state !== "PUBLISHED" ||
      scope.row.moderationState !== "VISIBLE" ||
      (scope.row.rightsExpiresAt && scope.row.rightsExpiresAt <= new Date()))
  )
    throw new PortalError(
      409,
      "This artist is no longer published. Reload its current state."
    );
  return { c, scope };
}
export async function artistCommand(
  db: PrismaClient,
  token: unknown,
  input: Record<string, unknown>
) {
  const op = String(input.operation);
  if (!ops.includes(op))
    throw new PortalError(400, "Choose a supported artist action.");
  const metadata = [
    "create",
    "save",
    "publish",
    "create-release",
    "save-release",
    "publish-release"
  ].includes(op);
  socialInput(input, [
    "operation",
    "mutationId",
    ...(op !== "create" ? ["artistId"] : []),
    ...(![
      "create",
      "create-release",
      "invite",
      "accept-invite",
      "revoke-invite",
      "step-down",
      "propose-event",
      "accept-event",
      "revoke-event"
    ].includes(op)
      ? ["expectedVersion"]
      : []),
    ...(op.includes("release") && op !== "create-release" ? ["releaseId"] : []),
    ...(metadata ? ["fields", "rights"] : []),
    ...(op === "create" ? ["representation", "policy"] : []),
    ...(op === "invite"
      ? ["accountId", "capabilities", "expectedVersion"]
      : []),
    ...(["accept-invite", "revoke-invite", "step-down"].includes(op)
      ? ["invitationId", "expectedVersion"]
      : []),
    ...(op.includes("event")
      ? ["occurrenceId", "associationId", "expectedVersion"]
      : [])
  ]);
  if (Buffer.byteLength(JSON.stringify(input)) > 32768)
    throw new PortalError(413, "These artist entries are too large.");
  let owner: string | null = null;
  const result = await socialCommand(
    db,
    token,
    "artists",
    input,
    async (tx, actorId) => {
      owner = actorId;
      const { c, scope } = await currentAccess(tx, actorId, input);
      const now = new Date();
      const id = scope?.row.id ?? randomUUID();
      let version = 1,
        resourceId = id;
      if (op === "create") {
        if (input.representation !== true || input.policy !== ARTIST_POLICY)
          throw new PortalError(
            400,
            "Confirm that you are this artist or currently authorized to represent this artist or team."
          );
        if (
          (await tx.artistProfile.count({
            where: { stewardId: actorId, removedAt: null }
          })) >= 50
        )
          throw new PortalError(
            409,
            "These artist profiles need a size review."
          );
        const f = artistFields(input.fields),
          rights = artistRights(input.rights, f, actorId);
        if (f.townId) await getDiscoveryPlace(f.countryId, Number(f.townId));
        await tx.artistProfile.create({
          data: {
            id,
            stewardId: actorId,
            ...f,
            credits: f.credits as Prisma.InputJsonValue,
            fingerprint: artistFingerprint(f),
            ...rights
          }
        });
      } else if (
        ["invite", "accept-invite", "revoke-invite", "step-down"].includes(op)
      ) {
        const s = scope!;
        if (op === "invite") {
          const accountId = postId(input.accountId);
          if (
            accountId === actorId ||
            c.blockedIds?.includes(accountId) ||
            !(await tx.platformUser.findFirst({
              where: { id: accountId, ...eligibleWhere },
              select: { id: true }
            }))
          )
            throw artistUnavailable();
          if (
            !Array.isArray(input.capabilities) ||
            !input.capabilities.length ||
            input.capabilities.length > 3 ||
            input.capabilities.some((x) => !artistCapabilities.includes(x)) ||
            new Set(input.capabilities).size !== input.capabilities.length
          )
            throw new PortalError(
              400,
              "Choose the exact supported editor permissions."
            );
          const prior = await tx.artistDelegate.findUnique({
            where: { artistId_accountId: { artistId: id, accountId } }
          });
          expected(input.expectedVersion, prior?.version ?? 0);
          if (prior?.state === "ACCEPTED" && !prior.revokedAt)
            throw new PortalError(
              409,
              "Revoke the existing grant before proposing new permissions."
            );
          if (
            !prior &&
            (await tx.artistDelegate.count({ where: { artistId: id } })) >= 200
          )
            throw new PortalError(
              409,
              "These editor records need a size review."
            );
          if (
            (await tx.artistDelegate.count({
              where: {
                artistId: id,
                accountId: { not: accountId },
                state: "PENDING",
                revokedAt: null,
                expiresAt: { gt: now }
              }
            })) >= 20
          )
            throw new PortalError(
              409,
              "Use at most 20 pending editor invitations."
            );
          const data = {
            capabilities: input.capabilities as string[],
            state: "PENDING",
            expiresAt: new Date(now.getTime() + 7 * 86400000),
            acceptedAt: null,
            revokedAt: null,
            version: (prior?.version ?? 0) + 1
          };
          const row = await tx.artistDelegate.upsert({
            where: { artistId_accountId: { artistId: id, accountId } },
            create: { artistId: id, accountId, ...data },
            update: data
          });
          resourceId = row.id;
          version = row.version;
        } else {
          const row = await tx.artistDelegate.findFirst({
            where: {
              id: postId(input.invitationId),
              artistId: id,
              ...(op === "revoke-invite" ? {} : { accountId: actorId })
            }
          });
          if (!row) throw artistUnavailable();
          expected(input.expectedVersion, row.version);
          if (op === "accept-invite") {
            if (
              row.state !== "PENDING" ||
              row.revokedAt ||
              row.expiresAt <= now
            )
              throw new PortalError(
                409,
                "This invitation is no longer available. Ask the steward for a current invitation."
              );
            if (
              (await tx.artistDelegate.count({
                where: { artistId: id, state: "ACCEPTED", revokedAt: null }
              })) >= 20
            )
              throw new PortalError(
                409,
                "This artist has reached its editor limit."
              );
          }
          const changed = await tx.artistDelegate.update({
            where: { id: row.id },
            data: {
              state: op === "accept-invite" ? "ACCEPTED" : "REVOKED",
              acceptedAt: op === "accept-invite" ? now : row.acceptedAt,
              revokedAt: op === "accept-invite" ? null : now,
              version: { increment: 1 }
            }
          });
          resourceId = row.id;
          version = changed.version;
        }
        await artistControl(tx, s.row.id, actorId);
      } else if (op.includes("event")) {
        const receipt = await artistEventCommand(tx, c, scope!, input);
        resourceId = receipt.id;
        version = receipt.version;
        await artistControl(tx, id, actorId);
      } else if (op.includes("release")) {
        const s = scope!,
          row =
            op === "create-release"
              ? null
              : await tx.artistRelease.findFirst({
                  where: {
                    id: postId(input.releaseId),
                    artistId: id,
                    removedAt: null,
                    recoveryRequired: false
                  }
                });
        if (op !== "create-release" && !row) throw artistUnavailable();
        if (row) expected(input.expectedVersion, row.version);
        if (
          !row &&
          (await tx.artistRelease.count({
            where: { artistId: id, removedAt: null }
          })) >= 200
        )
          throw new PortalError(
            409,
            "This artist's releases need a size review."
          );
        resourceId = row?.id ?? randomUUID();
        version = (row?.version ?? 0) + 1;
        if (metadata) {
          const f = releaseFields(input.fields),
            publish = op === "publish-release" || row?.state === "PUBLISHED";
          if (publish) {
            if (
              !(await communityReportIntakeAvailable(
                tx,
                null,
                null,
                "ARTIST_RELEASE"
              ))
            )
              throw new PortalError(
                503,
                "Music publication needs an available reporting and review service. Your draft can be saved."
              );
            if (
              !s.can("PUBLISH_ARTIST_RELEASES") ||
              s.row.moderationState !== "VISIBLE" ||
              (row && row.moderationState !== "VISIBLE")
            )
              throw artistUnavailable();
            requireReleasePublication(f);
          }
          const rights = input.rights
            ? artistRights(input.rights, f, actorId)
            : null;
          if (publish && !rights)
            throw new PortalError(
              400,
              "Review current permission before publishing or updating a published release."
            );
          const data = {
            ...f,
            tracks: f.tracks as Prisma.InputJsonValue,
            credits: f.credits as Prisma.InputJsonValue,
            links: f.links as Prisma.InputJsonValue,
            fingerprint: artistFingerprint(f),
            ...(rights ?? rightsEmpty),
            state: publish ? "PUBLISHED" : (row?.state ?? "DRAFT"),
            publishedAt: publish
              ? (row?.publishedAt ?? now)
              : (row?.publishedAt ?? null),
            version
          };
          if (row)
            await tx.artistRelease.update({
              where: { id: row.id },
              data: { ...data, controlVersion: { increment: 1 } }
            });
          else
            await tx.artistRelease.create({
              data: { id: resourceId, artistId: id, ...data }
            });
        } else {
          if (!s.can("PUBLISH_ARTIST_RELEASES")) throw artistUnavailable();
          await tx.artistRelease.update({
            where: { id: resourceId },
            data: {
              state: op === "remove-release" ? "REMOVED" : "UNPUBLISHED",
              ...(op === "remove-release" ? { removedAt: now } : {}),
              ...rightsEmpty,
              version,
              controlVersion: { increment: 1 }
            }
          });
        }
        const control = await tx.artistRelease.findUniqueOrThrow({
          where: { id: resourceId },
          select: { controlVersion: true }
        });
        await recordDiscoveryControl(
          tx,
          "ARTIST_RELEASE",
          actorId,
          resourceId,
          control.controlVersion
        );
      } else {
        const s = scope!;
        expected(input.expectedVersion, s.row.version);
        version = s.row.version + 1;
        if (metadata) {
          const f = artistFields(input.fields);
          if (f.townId) await getDiscoveryPlace(f.countryId, Number(f.townId));
          const publish = op === "publish" || s.row.state === "PUBLISHED";
          if (
            publish &&
            !(await communityReportIntakeAvailable(tx, null, null, "ARTIST"))
          )
            throw new PortalError(
              503,
              "Artist publication needs an available reporting and review service. Your draft can be saved."
            );
          if (publish && s.row.moderationState !== "VISIBLE")
            throw artistUnavailable();
          const rights = input.rights
            ? artistRights(input.rights, f, actorId)
            : null;
          if (publish && !rights)
            throw new PortalError(
              400,
              "Review current representation and publication permission before saving a published artist."
            );
          await tx.artistProfile.update({
            where: { id },
            data: {
              ...f,
              credits: f.credits as Prisma.InputJsonValue,
              fingerprint: artistFingerprint(f),
              ...(rights ?? rightsEmpty),
              state: publish ? "PUBLISHED" : s.row.state,
              publishedAt: publish
                ? (s.row.publishedAt ?? now)
                : s.row.publishedAt,
              version
            }
          });
        } else {
          await tx.artistProfile.update({
            where: { id },
            data: {
              state: op === "remove" ? "REMOVED" : "UNPUBLISHED",
              ...(op === "remove" ? { removedAt: now } : {}),
              ...rightsEmpty,
              version
            }
          });
          if (op === "remove") {
            await tx.artistDelegate.updateMany({
              where: { artistId: id, revokedAt: null },
              data: {
                state: "REVOKED",
                revokedAt: now,
                version: { increment: 1 }
              }
            });
            await tx.artistEventAssociation.updateMany({
              where: { artistId: id, revokedAt: null },
              data: { revokedAt: now, version: { increment: 1 } }
            });
          }
        }
        await artistControl(tx, id, actorId);
      }
      if (op === "remove") {
        const releases = await tx.artistRelease.findMany({
          where: { artistId: id, removedAt: null },
          select: { id: true, controlVersion: true }
        });
        for (const r of releases) {
          await tx.artistRelease.update({
            where: { id: r.id },
            data: {
              state: "REMOVED",
              removedAt: now,
              ...rightsEmpty,
              version: { increment: 1 },
              controlVersion: { increment: 1 }
            }
          });
          await purgeArtistEvidence(tx, "ARTIST_RELEASE", r.id);
          await recordDiscoveryControl(
            tx,
            "ARTIST_RELEASE",
            actorId,
            r.id,
            r.controlVersion + 1
          );
        }
        await purgeArtistEvidence(tx, "ARTIST", id);
      }
      if (op === "remove-release")
        await purgeArtistEvidence(tx, "ARTIST_RELEASE", resourceId);
      if (op === "create")
        await recordDiscoveryControl(tx, "ARTIST", actorId, id, 1);
      await tx.artistAudit.create({
        data: { artistId: id, actorId, resourceId, action: op, version }
      });
      return { id: resourceId, version, message: "Artist changes saved." };
    },
    async (tx, actorId) => {
      owner = actorId;
      const prior = await tx.socialOperation.findUnique({
        where: {
          ownerId_key: {
            ownerId: actorId,
            key: `artists:${socialKey(input.mutationId)}`
          }
        },
        select: { key: true }
      });
      await currentAccess(tx, actorId, input, !!prior);
    }
  );
  const protectedCopy = owner
    ? await protectDiscoveryRecovery(db, owner)
    : false;
  return {
    ...result,
    recoveryPending: !protectedCopy,
    message: protectedCopy
      ? result.message
      : "Saved. Its protected recovery copy is pending; keep this receipt."
  };
}
