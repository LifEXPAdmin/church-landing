import { getPostViewIn } from "./post-reads";
import { postPreviewText } from "./post-options";
import { accountConfig } from "./account-config";
import { postContext, postReadableWhere, withPostRead } from "./post-access";
import { postId } from "./post-input";
import { commentVisibleWhere } from "./comment-policy";
import { PortalError } from "./portal-policy";
import type { PrismaClient } from "@prisma/client";
import { topicPublicWhere } from "./topic-policy";
import { shareCardLabel } from "../share-card";

export type ShareKind =
  | "post"
  | "comment"
  | "church"
  | "event"
  | "profile"
  | "topic";
export function canonicalSharePath(
  kind: unknown,
  id: unknown,
  commentId?: unknown
) {
  if (
    !["post", "comment", "church", "event", "profile", "topic"].includes(
      String(kind)
    )
  )
    throw new PortalError(400, "Choose a supported sharing destination.");
  const safeId = postId(id);
  if (kind === "topic") {
    if (
      safeId.length < 3 ||
      safeId.length > 60 ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(safeId)
    )
      throw new PortalError(400, "Choose a valid topic address.");
    return `/platform/topics/${safeId}`;
  }
  if (kind === "comment")
    return `/platform/posts/${safeId}?comment=${postId(commentId)}`;
  return `/platform/${kind === "post" ? "posts" : kind === "church" ? "churches" : kind === "event" ? "events" : "profile"}/${safeId}`;
}
const short = (text: string, max: number) =>
  text
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
export const publicPreviewHeaders = {
  "Cache-Control": "no-store, max-age=0",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow",
  Vary: "Cookie"
};
export async function publicSharePreview(
  db: PrismaClient,
  query: { kind: unknown; id: unknown; commentId?: unknown },
  token?: unknown
) {
  const path = canonicalSharePath(query.kind, query.id, query.commentId),
    origin = accountConfig().origin;
  const fallback = {
    available: false,
    kind: String(query.kind) as ShareKind,
    path,
    url: new URL(path, origin).href,
    title: "God’s Churches",
    description: "Open God’s Churches to view this page and check your access.",
    author: null as { name: string; kind: "person" | "church" } | null,
    image: {
      url: new URL("/brand/share-card.png", origin).href,
      width: 1200,
      height: 630,
      alt: shareCardLabel
    }
  };
  // Anonymous access is the upper bound. A signed-in viewer's blocks can only
  // narrow it; a session or crawler never expands the public preview audience.
  const preview = await withPostRead(db, token, async (tx, context) => {
    if (query.kind === "profile") return fallback;
    if (query.kind === "topic") {
      const topic = await tx.topicCommunity.findFirst({
        where: { ...topicPublicWhere, slug: String(query.id) },
        select: { name: true, description: true }
      });
      return topic
        ? {
            ...fallback,
            available: true,
            title: short(topic.name, 110),
            description: short(topic.description, 160)
          }
        : fallback;
    }
    if (query.kind === "post" || query.kind === "comment") {
      const row = await tx.platformPost.findFirst({
        where: {
          AND: [
            { id: postId(query.id), audience: "PUBLIC" },
            postReadableWhere(await postContext(tx)),
            postReadableWhere(context)
          ]
        },
        select: {
          id: true,
          repostKind: true,
          type: true,
          content: true,
          contentNote: true,
          safeExcerpt: true,
          authorChurchId: true,
          author: { select: { name: true } },
          authorChurch: { select: { name: true } }
        }
      });
      if (!row) return fallback;
      if (row.repostKind === "PLAIN") {
        if (query.kind !== "post") return fallback;
        const entry = await getPostViewIn(tx, context, row.id);
        const source = entry?.repost?.source;
        if (!source) return fallback;
        const sourcePath = canonicalSharePath("post", source.id);
        return {
          ...fallback,
          available: true,
          path: sourcePath,
          url: new URL(sourcePath, origin).href,
          title: short(
            `${source.type === "PRAYER" ? "A prayer" : "A public post"} from ${source.author.name}`,
            110
          ),
          description:
            source.type === "PRAYER" && !source.safeExcerpt
              ? "Read this public conversation on Godschurches."
              : short(postPreviewText(source), 160),
          author: {
            name: short(source.author.name, 100),
            kind: source.author.churchId
              ? ("church" as const)
              : ("person" as const)
          }
        };
      }
      let name = row.authorChurch?.name ?? row.author.name,
        kind: "person" | "church" = row.authorChurch ? "church" : "person";
      if (query.kind === "comment") {
        const comment = await tx.platformPostComment.findFirst({
          where: {
            AND: [
              { id: postId(query.commentId), postId: row.id },
              commentVisibleWhere(context)
            ]
          },
          select: {
            author: { select: { name: true } },
            authorChurch: { select: { name: true } }
          }
        });
        if (!comment) return fallback;
        name = comment.authorChurch?.name ?? comment.author.name;
        kind = comment.authorChurch ? "church" : "person";
      }
      return {
        ...fallback,
        available: true,
        title: short(
          `${query.kind === "comment" ? "A comment" : row.type === "PRAYER" ? "A prayer" : "A public post"} from ${name}`,
          110
        ),
        description:
          query.kind === "comment" ||
          (row.type === "PRAYER" && !row.safeExcerpt)
            ? "Read this public conversation on Godschurches."
            : short(postPreviewText(row), 160),
        author: { name: short(name, 100), kind }
      };
    }
    if (query.kind === "church") {
      const row = await tx.church.findFirst({
        where: { id: postId(query.id), communityListed: true },
        select: { name: true, summary: true }
      });
      return row
        ? {
            ...fallback,
            available: true,
            title: short(row.name, 110),
            description: short(row.summary, 160),
            author: { name: short(row.name, 100), kind: "church" as const }
          }
        : fallback;
    }
    const row = await tx.calendarOccurrence.findFirst({
      where: {
        id: postId(query.id),
        canceledAt: null,
        event: {
          canceledAt: null,
          visibility: "PUBLIC",
          calendar: { archivedAt: null, churchId: { not: null } }
        }
      },
      select: {
        title: true,
        description: true,
        event: {
          select: {
            calendar: { select: { church: { select: { name: true } } } }
          }
        }
      }
    });
    return row
      ? {
          ...fallback,
          available: true,
          title: short(row.title, 110),
          description: short(row.description, 160),
          author: {
            name: short(row.event.calendar.church!.name, 100),
            kind: "church" as const
          }
        }
      : fallback;
  });
  if (!preview.available) return preview;
  const imagePath = new URL("/api/platform/share-preview", origin);
  imagePath.searchParams.set("format", "png");
  imagePath.searchParams.set("kind", String(query.kind));
  imagePath.searchParams.set("id", postId(query.id));
  if (query.kind === "comment")
    imagePath.searchParams.set("commentId", postId(query.commentId));
  return {
    ...preview,
    image: {
      ...preview.image,
      url: imagePath.href,
      alt: `${preview.title} — God’s Churches`
    }
  };
}
