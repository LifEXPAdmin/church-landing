import { Prisma, type PrismaClient } from "@prisma/client";
import { withAccountRead } from "./account-read";
import {
  mediaContext,
  mediaReadableSql,
  mediaManagementWhere,
  mediaUnavailable,
  mediaCanPublish,
  requireMediaActor
} from "./media-catalog-policy";
import { mediaText } from "./media-catalog-input";
import { mediaFormats } from "./media-catalog-options";
import { postId } from "./post-input";
import { PortalError } from "./portal-policy";
import { normalizeScripture } from "./media-scripture";
import { SCRIPTURE_REGISTRY_VERSION } from "./scripture-registry";
import type { PostContext, PostTx } from "./post-access";
import { mediaTranscript } from "./media-transcript";
export const mediaPublicSelect = {
  id: true,
  version: true,
  title: true,
  description: true,
  format: true,
  presentation: true,
  audience: true,
  durationSeconds: true,
  languageIds: true,
  speakers: true,
  churchCredit: true,
  series: true,
  sequence: true,
  topics: true,
  scriptureRanges: true,
  recordedOn: true,
  details: true,
  sourceUrl: true,
  sourceProvider: true,
  attribution: true,
  publishedAt: true,
  ownerChurch: { select: { id: true, name: true } },
  owner: { select: { name: true, username: true } }
} satisfies Prisma.MediaCatalogItemSelect;
const mediaDetailSelect = {
  ...mediaPublicSelect,
  transcriptText: true,
  chapters: true
} satisfies Prisma.MediaCatalogItemSelect;
async function mediaIdReadableIn(tx: PostTx, c: PostContext, id: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>(
    Prisma.sql`SELECT m.id FROM "MediaCatalogItem" m WHERE m.id=${id} AND (${mediaReadableSql(c)})`
  );
  return rows.length > 0;
}
export async function mediaReadableIn(tx: PostTx, c: PostContext, id: string) {
  return (await mediaIdReadableIn(tx, c, id))
    ? tx.mediaCatalogItem.findUnique({
        where: { id },
        select: mediaPublicSelect
      })
    : null;
}
export type MediaPublic = NonNullable<
  Awaited<ReturnType<typeof mediaReadableIn>>
>;
async function mediaDetailIn(tx: PostTx, c: PostContext, id: string) {
  if (!(await mediaIdReadableIn(tx, c, id))) return null;
  const row = await tx.mediaCatalogItem.findUnique({
    where: { id },
    select: mediaDetailSelect
  });
  return row
    ? {
        ...row,
        ...mediaTranscript(
          row.transcriptText,
          row.chapters,
          row.durationSeconds
        )
      }
    : null;
}
export type MediaDetail = NonNullable<
  Awaited<ReturnType<typeof mediaDetailIn>>
>;
export function mediaCatalogRead(
  db: PrismaClient,
  token: unknown,
  query: URLSearchParams,
  expectedAccount?: string | null
) {
  const allowed = [
    "view",
    "id",
    "q",
    "format",
    "speaker",
    "series",
    "topic",
    "church",
    "scripture",
    "referenceSystem",
    "page"
  ];
  if (
    [...query.keys()].some(
      (k) => !allowed.includes(k) || query.getAll(k).length !== 1
    )
  )
    throw new PortalError(400, "Choose supported media search fields.");
  const view = query.get("view") ?? "library";
  if (!["library", "detail", "studio", "editor"].includes(view))
    throw new PortalError(400, "Choose an available media view.");
  return withAccountRead(db, token, async (tx, actorId) => {
    const c = await mediaContext(tx, actorId);
    if (expectedAccount && actorId !== expectedAccount)
      throw new PortalError(
        401,
        "Your sign-in changed. Reload before continuing."
      );
    if (view === "editor" || view === "studio") {
      requireMediaActor(c);
      if (!expectedAccount || actorId !== expectedAccount)
        throw new PortalError(
          401,
          "Reload your media studio before continuing."
        );
      const churches = await tx.church.findMany({
        where: {
          id: { in: [...new Set([...c.mediaEditors, ...c.mediaManagers])] }
        },
        select: { id: true, name: true },
        orderBy: { name: "asc" }
      });
      if (view === "editor") {
        const row = await tx.mediaCatalogItem.findFirst({
          where: {
            AND: [{ id: postId(query.get("id")) }, mediaManagementWhere(c)]
          },
          select: {
            ...mediaDetailSelect,
            state: true,
            ownerChurchId: true,
            sourceState: true,
            recoveryRequired: true,
            moderationState: true,
            rights: {
              select: {
                basis: true,
                evidenceReference: true,
                license: true,
                consentReference: true,
                expiresAt: true,
                revokedAt: true
              }
            }
          }
        });
        if (!row) throw mediaUnavailable();
        return {
          actorId,
          churches,
          item: {
            ...row,
            ...mediaTranscript(
              row.transcriptText,
              row.chapters,
              row.durationSeconds
            ),
            canPublish: mediaCanPublish(c, {
              ownerChurchId: row.ownerChurchId,
              ownerId: row.ownerChurchId ? null : actorId
            })
          }
        };
      }
      const page = pageNumber(query.get("page"));
      const where = mediaManagementWhere(c),
        [rows, total] = await Promise.all([
          tx.mediaCatalogItem.findMany({
            where,
            select: {
              id: true,
              title: true,
              format: true,
              state: true,
              sourceState: true,
              recoveryRequired: true,
              updatedAt: true,
              ownerChurch: { select: { name: true } }
            },
            orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
            skip: page * 20,
            take: 20
          }),
          tx.mediaCatalogItem.count({ where })
        ]);
      return { actorId, churches, items: rows, total, page };
    }
    if (view === "detail") {
      const item = await mediaDetailIn(tx, c, postId(query.get("id")));
      if (!item) throw mediaUnavailable();
      return { actorId, item };
    }
    const q = mediaText(query.get("q"), 160, "search"),
      format = query.get("format"),
      speaker = mediaText(query.get("speaker"), 120, "speaker"),
      series = mediaText(query.get("series"), 160, "series"),
      topic = mediaText(query.get("topic"), 40, "topic"),
      church = query.get("church"),
      page = pageNumber(query.get("page"));
    if (
      format &&
      !mediaFormats.includes(format as (typeof mediaFormats)[number])
    )
      throw new PortalError(400, "Choose a supported media format.");
    const clauses = [mediaReadableSql(c)];
    const scripture = mediaText(
      query.get("scripture"),
      4000,
      "Scripture search"
    );
    if (scripture) {
      const ranges = normalizeScripture([
        {
          referenceSystemId: query.get("referenceSystem"),
          referenceVersion: SCRIPTURE_REGISTRY_VERSION,
          originals: [scripture]
        }
      ]);
      const overlaps = ranges.map(
        (r) => Prisma.sql`(s->>'referenceSystemId'=${r.referenceSystemId}
        AND s->>'referenceVersion'=${r.referenceVersion} AND s->>'bookId'=${r.bookId}
        AND jsonb_typeof(s->'startKey')='number' AND jsonb_typeof(s->'endKey')='number'
        AND s->'startKey'<=${String(r.endKey)}::jsonb AND s->'endKey'>=${String(r.startKey)}::jsonb)`
      );
      clauses.push(
        Prisma.sql`EXISTS (SELECT 1 FROM jsonb_array_elements(m."scriptureRanges") s WHERE ${Prisma.join(overlaps, " OR ")})`
      );
    }
    const contains = (value: string) => `%${value.replace(/[\\%_]/g, "\\$&")}%`;
    if (q)
      clauses.push(
        Prisma.sql`(m.title ILIKE ${contains(q)} OR m.description ILIKE ${contains(q)} OR m."transcriptText" ILIKE ${contains(q)})`
      );
    if (format) clauses.push(Prisma.sql`m.format=${format}`);
    if (speaker)
      clauses.push(
        Prisma.sql`EXISTS (SELECT 1 FROM unnest(m.speakers) s WHERE s ILIKE ${contains(speaker)})`
      );
    if (series) clauses.push(Prisma.sql`m.series ILIKE ${contains(series)}`);
    if (topic)
      clauses.push(
        Prisma.sql`EXISTS (SELECT 1 FROM unnest(m.topics) t WHERE lower(t)=lower(${topic}))`
      );
    if (church) clauses.push(Prisma.sql`m."ownerChurchId"=${postId(church)}`);
    const where = Prisma.join(clauses, " AND ");
    const [ids, count] = await Promise.all([
      tx.$queryRaw<{ id: string }[]>(
        Prisma.sql`SELECT m.id FROM "MediaCatalogItem" m WHERE ${where} ORDER BY m."publishedAt" DESC,m.id ASC LIMIT 20 OFFSET ${page * 20}`
      ),
      tx.$queryRaw<{ total: bigint }[]>(
        Prisma.sql`SELECT count(*) AS total FROM "MediaCatalogItem" m WHERE ${where}`
      )
    ]);
    const rows = await tx.mediaCatalogItem.findMany({
      where: { id: { in: ids.map((r) => r.id) } },
      select: mediaPublicSelect
    });
    const byId = new Map(rows.map((r) => [r.id, r]));
    return {
      actorId,
      items: ids.map((r) => byId.get(r.id)!),
      total: Number(count[0].total),
      page
    };
  });
}
function pageNumber(v: string | null) {
  if (v !== null && !/^(0|[1-9][0-9]{0,2})$/.test(v))
    throw new PortalError(400, "Choose an available media page.");
  return Number(v ?? 0);
}
