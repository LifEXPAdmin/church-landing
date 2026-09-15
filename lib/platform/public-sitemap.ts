import type { PrismaClient } from "@prisma/client";
import { indexingEnvironment } from "../indexing-policy";
import { publicPreviewHeaders } from "./public-sharing";
import {
  publicChurchWhere,
  publicEventWhere,
  publicDiscoverablePostWhere
} from "./public-discovery-policy";
import { withPostRead } from "./post-access";
import { topicPublicWhere } from "./topic-policy";
import { PortalError } from "./portal-policy";

export const sitemapPageSize = 500;
export const staticPublicPaths = [
  "/platform",
  "/about",
  "/help",
  "/manifesto",
  "/for-users",
  "/for-churches",
  "/for-creators",
  "/for-businesses",
  "/privacy",
  "/terms"
];
const kinds = ["site", "churches", "posts", "events", "topics"] as const;
const escapeXml = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
const xml = (body: string, status = 200) =>
  new Response(body, {
    status,
    headers: {
      ...publicPreviewHeaders,
      "Content-Type": "application/xml; charset=utf-8"
    }
  });
type Entry = { path: string; modified?: Date };
export async function publicSitemapResponse(
  db: PrismaClient,
  request: Request
) {
  const environment = indexingEnvironment();
  const empty =
    '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>';
  if (!environment.index) return xml(empty);
  try {
    const query = new URL(request.url).searchParams;
    if (
      [...query.keys()].some((key) => !["kind", "page"].includes(key)) ||
      query.getAll("kind").length > 1 ||
      query.getAll("page").length > 1
    )
      throw new PortalError(400, "Invalid sitemap request.");
    const kind = query.get("kind"),
      rawPage = query.get("page");
    if (kind !== null && !(kinds as readonly string[]).includes(kind))
      throw new PortalError(400, "Invalid sitemap kind.");
    if (
      (!kind && rawPage !== null) ||
      (kind && !/^(?:0|[1-9][0-9]{0,5})$/.test(rawPage ?? ""))
    )
      throw new PortalError(400, "Invalid sitemap page.");
    return await withPostRead(db, null, async (tx, context) => {
      const postWhere = publicDiscoverablePostWhere(context);
      if (!kind) {
        const counts = await Promise.all([
          tx.church.count({ where: publicChurchWhere }),
          tx.platformPost.count({ where: postWhere }),
          tx.calendarOccurrence.count({ where: publicEventWhere }),
          tx.topicCommunity.count({ where: topicPublicWhere })
        ]);
        const pages = [
          1,
          ...counts.map((count) => Math.ceil(count / sitemapPageSize))
        ];
        if (pages.reduce((a, b) => a + b, 0) > 50000)
          throw new PortalError(503, "Sitemap capacity needs review.");
        const locations = kinds.flatMap((key, i) =>
          Array.from(
            { length: pages[i] },
            (_, page) =>
              `<sitemap><loc>${escapeXml(environment.origin + "/sitemap.xml?" + new URLSearchParams({ kind: key, page: String(page) }))}</loc></sitemap>`
          )
        );
        return xml(
          '<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
            locations.join("") +
            "</sitemapindex>"
        );
      }
      const page = Number(rawPage),
        skip = page * sitemapPageSize;
      if (page >= 50000) throw new PortalError(400, "Invalid sitemap page.");
      let entries: Entry[];
      if (kind === "site") {
        if (page !== 0) throw new PortalError(404, "Sitemap page unavailable.");
        entries = staticPublicPaths.map((path) => ({ path }));
        if (
          await tx.church.findFirst({
            where: publicChurchWhere,
            select: { id: true }
          })
        )
          entries.push({ path: "/platform/churches" });
        if (
          await tx.topicCommunity.findFirst({
            where: topicPublicWhere,
            select: { id: true }
          })
        )
          entries.push({ path: "/platform/topics" });
      } else if (kind === "churches")
        entries = (
          await tx.church.findMany({
            where: publicChurchWhere,
            select: { id: true },
            orderBy: { id: "asc" },
            take: sitemapPageSize,
            skip
          })
        ).map((row) => ({ path: "/platform/churches/" + row.id }));
      else if (kind === "posts")
        entries = (
          await tx.platformPost.findMany({
            where: postWhere,
            select: { id: true, editedAt: true, publishedAt: true },
            orderBy: { id: "asc" },
            take: sitemapPageSize,
            skip
          })
        ).map((row) => ({
          path: "/platform/posts/" + row.id,
          modified: row.editedAt ?? row.publishedAt ?? undefined
        }));
      else if (kind === "events")
        entries = (
          await tx.calendarOccurrence.findMany({
            where: publicEventWhere,
            select: { id: true },
            orderBy: { id: "asc" },
            take: sitemapPageSize,
            skip
          })
        ).map((row) => ({ path: "/platform/events/" + row.id }));
      else
        entries = (
          await tx.topicCommunity.findMany({
            where: topicPublicWhere,
            select: { slug: true, updatedAt: true },
            orderBy: { id: "asc" },
            take: sitemapPageSize,
            skip
          })
        ).map((row) => ({
          path: "/platform/topics/" + row.slug,
          modified: row.updatedAt
        }));
      if (!entries.length && page > 0)
        throw new PortalError(404, "Sitemap page unavailable.");
      return xml(
        '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
          entries
            .map(
              (row) =>
                `<url><loc>${escapeXml(environment.origin + row.path)}</loc>${row.modified ? `<lastmod>${row.modified.toISOString()}</lastmod>` : ""}</url>`
            )
            .join("") +
          "</urlset>"
      );
    });
  } catch (error) {
    return xml(
      "<error>Public sitemap unavailable.</error>",
      error instanceof PortalError ? error.status : 503
    );
  }
}
