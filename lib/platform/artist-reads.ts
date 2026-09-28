import { Prisma, type PrismaClient } from "@prisma/client";
import { withAccountRead } from "./account-read";
import { postContext, type PostContext, type PostTx } from "./post-access";
import {
  artistAuthority,
  artistManagementWhere,
  artistPublicId,
  artistReadableSql,
  releaseReadableSql,
  artistUnavailable,
  requireArtistActor
} from "./artist-policy";
import { mediaText } from "./media-catalog-input";
import { postId } from "./post-input";
import { eligibleWhere, expected, PortalError } from "./portal-policy";
import { profileEventIn } from "./profile-events";
import {
  calendarContext,
  eventInclude,
  requireCalendarEdit,
  requireCalendarCapability
} from "./calendar-access";
import { effectiveChurchGrants } from "./church-permissions";
import { discoveryPlaceLabel, getDiscoveryPlace } from "./discovery-places";
import { discoveryCountries } from "./discovery-options";
import { artistRoles } from "./artist-types";
export const artistPublicSelect = {
  id: true,
  version: true,
  name: true,
  biography: true,
  presentation: true,
  roles: true,
  genres: true,
  countryId: true,
  townId: true,
  churchCredit: true,
  credits: true,
  publishedAt: true
} satisfies Prisma.ArtistProfileSelect;
export const releasePublicSelect = {
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
  publishedAt: true
} satisfies Prisma.ArtistReleaseSelect;
export async function artistReleasePublic(
  tx: PostTx,
  c: PostContext,
  id: string
) {
  const ids = await tx.$queryRaw<{ id: string }[]>(
    Prisma.sql`SELECT r.id FROM "ArtistRelease" r JOIN "ArtistProfile" a ON a.id=r."artistId" WHERE r.id=${id} AND ${releaseReadableSql(c)}`
  );
  return ids.length
    ? tx.artistRelease.findUnique({
        where: { id },
        select: releasePublicSelect
      })
    : null;
}
export async function eventApprover(
  tx: PostTx,
  actorId: string,
  occurrenceId: string,
  revoke = false
) {
  const actor = await tx.platformUser.findFirst({
      where: { id: actorId, ...eligibleWhere }
    }),
    event = await tx.calendarOccurrence.findUnique({
      where: { id: occurrenceId },
      include: { event: { include: eventInclude } }
    });
  if (
    !actor ||
    !event ||
    (!revoke && event.event.visibility !== "PUBLIC") ||
    !event.event.calendar.churchId ||
    (!revoke && event.event.calendar.archivedAt)
  )
    throw artistUnavailable();
  const context = await calendarContext(tx, actor);
  requireCalendarEdit(
    context,
    revoke
      ? { ...event.event.calendar, archivedAt: null }
      : event.event.calendar
  );
  requireCalendarCapability(
    context,
    event.event.calendar.churchId,
    "PUBLISH_CHURCH_EVENTS"
  );
  return event;
}
async function eventConsentCurrent(
  tx: PostTx,
  association: { acceptedById: string | null; occurrenceId: string }
) {
  if (!association.acceptedById) return false;
  const source = await tx.calendarOccurrence.findUnique({
    where: { id: association.occurrenceId },
    select: {
      event: {
        select: {
          visibility: true,
          calendar: { select: { churchId: true, archivedAt: true } }
        }
      }
    }
  });
  const churchId = source?.event.calendar.churchId;
  if (
    !churchId ||
    source.event.visibility !== "PUBLIC" ||
    source.event.calendar.archivedAt ||
    !(await tx.platformUser.findFirst({
      where: { id: association.acceptedById, ...eligibleWhere },
      select: { id: true }
    }))
  )
    return false;
  if (
    !(await tx.churchConnection.findFirst({
      where: { userId: association.acceptedById, churchId, state: "APPROVED" },
      select: { id: true }
    }))
  )
    return false;
  const grants = await effectiveChurchGrants(
    tx,
    association.acceptedById,
    [churchId],
    ["EDIT_CHURCH_CALENDAR", "PUBLISH_CHURCH_EVENTS"]
  );
  return ["EDIT_CHURCH_CALENDAR", "PUBLISH_CHURCH_EVENTS"].every((cap) =>
    grants.some(
      (g) =>
        g.capability === cap &&
        (!g.dependency ||
          (g.dependency.state === "APPROVED" &&
            g.dependency.userId === association.acceptedById &&
            g.dependency.churchId === churchId))
    )
  );
}
export async function artistEvents(tx: PostTx, c: PostContext, id: string) {
  const rows = await tx.artistEventAssociation.findMany({
    where: { artistId: id, acceptedAt: { not: null }, revokedAt: null },
    orderBy: { id: "asc" },
    take: 51
  });
  if (rows.length > 50)
    throw new PortalError(503, "These event associations need a size review.");
  const items = [];
  for (const row of rows) {
    if (!(await eventConsentCurrent(tx, row))) continue;
    const event = await profileEventIn(tx, c, row.occurrenceId);
    if (event) items.push(event);
  }
  return items;
}
export async function artistEventCommand(
  tx: PostTx,
  c: PostContext,
  scope: Awaited<ReturnType<typeof artistAuthority>>,
  input: Record<string, unknown>
) {
  const actorId = requireArtistActor(c),
    op = String(input.operation),
    now = new Date();
  if (op === "propose-event") {
    if (!scope.steward || !(await artistPublicId(tx, c, scope.row.id)))
      throw artistUnavailable();
    const occurrenceId = postId(input.occurrenceId),
      event = await profileEventIn(tx, c, occurrenceId),
      source = await tx.calendarOccurrence.findUnique({
        where: { id: occurrenceId },
        select: {
          event: {
            select: {
              visibility: true,
              calendar: { select: { churchId: true } }
            }
          }
        }
      });
    if (
      !event ||
      event.canceled ||
      source?.event.visibility !== "PUBLIC" ||
      !source.event.calendar.churchId
    )
      throw artistUnavailable();
    const prior = await tx.artistEventAssociation.findUnique({
      where: { artistId_occurrenceId: { artistId: scope.row.id, occurrenceId } }
    });
    expected(input.expectedVersion, prior?.version ?? 0);
    if (
      !prior &&
      (await tx.artistEventAssociation.count({
        where: { artistId: scope.row.id }
      })) >= 500
    )
      throw new PortalError(
        409,
        "This artist event history needs a size review."
      );
    if (prior && !prior.revokedAt)
      throw new PortalError(
        409,
        "This event already has a pending or accepted association. Review that association."
      );
    if (
      (await tx.artistEventAssociation.count({
        where: { artistId: scope.row.id, revokedAt: null }
      })) >= 50
    )
      throw new PortalError(409, "Use at most 50 active event associations.");
    const data = {
      proposedById: actorId,
      acceptedById: null,
      acceptedAt: null,
      revokedAt: null,
      expiresAt: new Date(now.getTime() + 7 * 86400000),
      version: (prior?.version ?? 0) + 1
    };
    const row = await tx.artistEventAssociation.upsert({
      where: {
        artistId_occurrenceId: { artistId: scope.row.id, occurrenceId }
      },
      create: { artistId: scope.row.id, occurrenceId, ...data },
      update: data
    });
    return { id: row.id, version: row.version };
  }
  const row = await tx.artistEventAssociation.findFirst({
    where: { id: postId(input.associationId), artistId: scope.row.id }
  });
  if (!row) throw artistUnavailable();
  expected(input.expectedVersion, row.version);
  if (op === "accept-event") {
    await eventApprover(tx, actorId, row.occurrenceId);
    if (
      row.acceptedAt ||
      row.revokedAt ||
      row.expiresAt <= now ||
      !(await artistPublicId(tx, c, scope.row.id))
    )
      throw artistUnavailable();
  } else if (!scope.steward)
    await eventApprover(tx, actorId, row.occurrenceId, true);
  return tx.artistEventAssociation.update({
    where: { id: row.id },
    data:
      op === "accept-event"
        ? { acceptedById: actorId, acceptedAt: now, version: { increment: 1 } }
        : { revokedAt: now, version: { increment: 1 } },
    select: { id: true, version: true }
  });
}
export function artistRead(
  db: PrismaClient,
  token: unknown,
  q: URLSearchParams,
  expectedAccount?: string | null
) {
  const allowed = [
    "view",
    "id",
    "artistId",
    "q",
    "role",
    "genre",
    "country",
    "town",
    "church",
    "release",
    "events",
    "page"
  ];
  if (
    [...q.keys()].some((k) => !allowed.includes(k) || q.getAll(k).length !== 1)
  )
    throw new PortalError(400, "Choose supported music filters.");
  const view = q.get("view") ?? "library";
  return withAccountRead(db, token, async (tx, actorId) => {
    if (expectedAccount && actorId !== expectedAccount)
      throw new PortalError(
        401,
        "Your sign-in changed. Reload before continuing."
      );
    const c = await postContext(tx, actorId),
      viewerId = c.actorId;
    if (view === "library" || view === "following") {
      if (view === "following") requireArtistActor(c);
      const text = mediaText(q.get("q"), 100, "music search"),
        genre = mediaText(q.get("genre"), 40, "genre"),
        church = mediaText(q.get("church"), 160, "supplied church credit"),
        country = mediaText(q.get("country"), 2, "country"),
        town = q.get("town") ?? "",
        role = q.get("role") ?? "",
        kind = q.get("release") ?? "",
        events = q.get("events") ?? "",
        page = Number(q.get("page") ?? 1);
      if (
        !Number.isSafeInteger(page) ||
        page < 1 ||
        page > 100 ||
        (role && !artistRoles.includes(role as (typeof artistRoles)[number])) ||
        (kind && !["SINGLE", "EP", "ALBUM"].includes(kind)) ||
        (events && events !== "yes")
      )
        throw new PortalError(400, "Choose supported music filters and pages.");
      if (
        town &&
        (!country ||
          !/^[1-9][0-9]*$/.test(town) ||
          !(await getDiscoveryPlace(country, Number(town))))
      )
        throw new PortalError(
          400,
          "Choose a current named town in this country."
        );
      const escaped = (v: string) => `%${v.replace(/[\\%_]/g, "\\$&")}%`;
      const where = Prisma.sql`${artistReadableSql(c)} ${text ? Prisma.sql`AND (a.name ILIKE ${escaped(text)} OR EXISTS(SELECT 1 FROM "ArtistRelease" r WHERE r."artistId"=a.id AND ${releaseReadableSql(c)} AND r.title ILIKE ${escaped(text)}))` : Prisma.empty}
    ${role ? Prisma.sql`AND ${role}=ANY(a.roles)` : Prisma.empty} ${genre ? Prisma.sql`AND EXISTS(SELECT 1 FROM unnest(a.genres) g WHERE lower(g)=lower(${genre}))` : Prisma.empty}
    ${country ? Prisma.sql`AND a."countryId"=${country}` : Prisma.empty} ${town ? Prisma.sql`AND a."townId"=${town}` : Prisma.empty} ${church ? Prisma.sql`AND a."churchCredit" ILIKE ${escaped(church)}` : Prisma.empty}
    ${kind ? Prisma.sql`AND EXISTS(SELECT 1 FROM "ArtistRelease" r WHERE r."artistId"=a.id AND r.kind=${kind} AND ${releaseReadableSql(c)})` : Prisma.empty}
    ${events ? Prisma.sql`AND EXISTS(SELECT 1 FROM "ArtistEventAssociation" ae WHERE ae."artistId"=a.id AND ae."acceptedAt" IS NOT NULL AND ae."revokedAt" IS NULL)` : Prisma.empty}
    ${view === "following" ? Prisma.sql`AND EXISTS(SELECT 1 FROM "SocialRelationship" f WHERE f."artistId"=a.id AND f."ownerId"=${viewerId} AND f."followingArtist")` : Prisma.empty}`;
      if (events) {
        const [size] = await tx.$queryRaw<{ count: bigint }[]>(
          Prisma.sql`SELECT count(*) count FROM "ArtistEventAssociation" ae JOIN "ArtistProfile" a ON a.id=ae."artistId" WHERE ${where} AND ae."acceptedAt" IS NOT NULL AND ae."revokedAt" IS NULL`
        );
        if (size.count > BigInt(200))
          throw new PortalError(
            409,
            "Narrow these music filters before checking organizer-approved events."
          );
      }
      // Event source authorization is evaluated before paging; the bounded set is
      // deliberately capped rather than returning a partial or misleading count.
      const all = await tx.$queryRaw<{ id: string }[]>(
        Prisma.sql`SELECT a.id FROM "ArtistProfile" a WHERE ${where} ORDER BY a.name,a.id LIMIT 2001`
      );
      if (all.length > 2000)
        throw new PortalError(409, "Narrow these music filters to continue.");
      const permitted = [];
      for (const row of all) {
        if (events && !(await artistEvents(tx, c, row.id)).length) continue;
        permitted.push(row.id);
      }
      const ids = permitted.slice((page - 1) * 20, page * 20),
        rows = await tx.artistProfile.findMany({
          where: { id: { in: ids } },
          select: artistPublicSelect
        });
      const unavailable =
        view === "following"
          ? await tx.$queryRaw<
              { artistId: string; version: number }[]
            >(Prisma.sql`
        SELECT f."artistId",f.version FROM "SocialRelationship" f WHERE f."ownerId"=${viewerId} AND f."followingArtist" AND f."artistId" IS NOT NULL
        AND NOT EXISTS(SELECT 1 FROM "ArtistProfile" a WHERE a.id=f."artistId" AND ${artistReadableSql(c)}) ORDER BY f.id LIMIT 100`)
          : [];
      return {
        viewerId,
        unavailable,
        items: ids.map((id) => rows.find((r) => r.id === id)!),
        total: permitted.length,
        page,
        pages: Math.ceil(permitted.length / 20)
      };
    }
    if (view === "studio") {
      requireArtistActor(c);
      const rows = await tx.artistProfile.findMany({
        where: artistManagementWhere(c),
        select: { ...artistPublicSelect, state: true },
        orderBy: { updatedAt: "desc" },
        take: 101
      });
      if (rows.length > 100)
        throw new PortalError(409, "These artist roles need a size review.");
      const invitations = await tx.artistDelegate.findMany({
        where: {
          accountId: viewerId!,
          state: "PENDING",
          revokedAt: null,
          expiresAt: { gt: new Date() },
          artist: {
            removedAt: null,
            recoveryRequired: false,
            steward: eligibleWhere,
            stewardId: { notIn: c.blockedIds ?? [] }
          }
        },
        select: {
          id: true,
          artistId: true,
          version: true,
          capabilities: true,
          expiresAt: true,
          artist: { select: { name: true } }
        },
        take: 21
      });
      return { viewerId, items: rows, invitations };
    }
    if (view === "association") {
      requireArtistActor(c);
      const row = await tx.artistEventAssociation.findUnique({
        where: { id: postId(q.get("id")) }
      });
      if (!row) throw artistUnavailable();
      await eventApprover(tx, viewerId!, row.occurrenceId, true);
      const artist = (await artistPublicId(tx, c, row.artistId))
          ? await tx.artistProfile.findUnique({
              where: { id: row.artistId },
              select: artistPublicSelect
            })
          : { id: row.artistId, name: "Unavailable artist" },
        event = await profileEventIn(tx, c, row.occurrenceId);
      return {
        viewerId,
        artist,
        event,
        association: {
          id: row.id,
          artistId: row.artistId,
          version: row.version,
          accepted: !!row.acceptedAt,
          revoked: !!row.revokedAt,
          expiresAt: row.expiresAt
        }
      };
    }
    if (view === "editor") {
      const scope = await artistAuthority(tx, c, postId(q.get("id")));
      if (
        !scope.steward &&
        !scope.can("EDIT_ARTIST_PROFILE") &&
        !scope.can("EDIT_ARTIST_RELEASES") &&
        !scope.can("PUBLISH_ARTIST_RELEASES")
      )
        throw artistUnavailable();
      const { row } = scope;
      const releases =
        scope.can("PUBLISH_ARTIST_RELEASES") ||
        scope.can("EDIT_ARTIST_RELEASES")
          ? await tx.artistRelease.findMany({
              where: {
                artistId: row.id,
                removedAt: null,
                recoveryRequired: false,
                ...(!scope.can("PUBLISH_ARTIST_RELEASES")
                  ? { state: "DRAFT" }
                  : {})
              },
              select: {
                ...releasePublicSelect,
                state: true,
                moderationState: true
              },
              orderBy: { updatedAt: "desc" },
              take: 201
            })
          : [];
      const delegates = scope.steward
        ? await tx.artistDelegate.findMany({
            where: { artistId: row.id },
            select: {
              id: true,
              accountId: true,
              capabilities: true,
              version: true,
              state: true,
              expiresAt: true,
              revokedAt: true
            },
            take: 201
          })
        : [];
      const associations = scope.steward
        ? await tx.artistEventAssociation.findMany({
            where: { artistId: row.id },
            select: {
              id: true,
              occurrenceId: true,
              revokedAt: true,
              version: true,
              acceptedAt: true,
              expiresAt: true
            },
            take: 501
          })
        : [];
      const artist = {
        ...(await tx.artistProfile.findUniqueOrThrow({
          where: { id: row.id },
          select: artistPublicSelect
        })),
        state: row.state,
        moderationState: row.moderationState
      };
      return {
        viewerId,
        artist,
        releases,
        delegates,
        associations,
        ownDelegate: scope.delegate
          ? {
              id: scope.delegate.id,
              version: scope.delegate.version,
              state: scope.delegate.state
            }
          : null,
        permissions: {
          steward: scope.steward,
          profile: scope.can("EDIT_ARTIST_PROFILE"),
          drafts:
            scope.can("EDIT_ARTIST_RELEASES") ||
            scope.can("PUBLISH_ARTIST_RELEASES"),
          publish: scope.can("PUBLISH_ARTIST_RELEASES")
        }
      };
    }
    if (view === "detail") {
      const id = postId(q.get("id"));
      if (!(await artistPublicId(tx, c, id))) throw artistUnavailable();
      const artist = await tx.artistProfile.findUnique({
        where: { id },
        select: artistPublicSelect
      });
      const ids = await tx.$queryRaw<{ id: string }[]>(
        Prisma.sql`SELECT r.id FROM "ArtistRelease" r JOIN "ArtistProfile" a ON a.id=r."artistId" WHERE a.id=${id} AND ${releaseReadableSql(c)} ORDER BY r."publishedAt" DESC,r.id LIMIT 201`
      );
      const releases = await tx.artistRelease.findMany({
        where: { id: { in: ids.map((x) => x.id) } },
        select: releasePublicSelect,
        orderBy: [{ publishedAt: "desc" }, { id: "asc" }]
      });
      const events = await artistEvents(tx, c, id);
      const place =
        artist?.countryId && artist.townId
          ? await getDiscoveryPlace(artist.countryId, Number(artist.townId))
          : null;
      const locationLabel = place
        ? discoveryPlaceLabel(place)
        : (discoveryCountries.find((c) => c.id === artist?.countryId)?.name ??
          "");
      return {
        viewerId,
        artist: artist ? { ...artist, locationLabel } : null,
        releases,
        events
      };
    }
    throw new PortalError(400, "Choose an available artist view.");
  });
}
