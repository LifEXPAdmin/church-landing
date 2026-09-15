import type { Metadata } from "next";
import { unstable_noStore as noStore } from "next/cache";
import { prisma } from "@/lib/prisma";
import {
  indexingEnvironment,
  publicPageIdentity,
  validEventDisplayZone,
  type PublicQuery
} from "../indexing-policy";
import { publicDiscoverablePostWhere } from "./public-discovery-policy";
import { withPostRead } from "./post-access";
import {
  publicSharePreview,
  canonicalSharePath,
  type ShareKind
} from "./public-sharing";
/** Anonymous preview is the only source of resource metadata, even when signed in. */
export async function publicResourceMetadata(
  kind: ShareKind,
  id: string,
  query: PublicQuery = {}
): Promise<Metadata> {
  noStore();
  const { origin, index: environmentIndex } = indexingEnvironment();
  let preview: Awaited<ReturnType<typeof publicSharePreview>> | null = null;
  try {
    preview = await publicSharePreview(prisma, { kind, id });
  } catch {
    /* Generic branding also covers unavailable service and invalid source IDs. */
  }
  const title = preview?.title ?? "God’s Churches",
    description =
      preview?.description ??
      "Open God’s Churches to view this page and check your access.";
  let url: string | undefined;
  let filtered = true;
  try {
    // Plain reposts already normalize to their original in Copy/Share. Keep
    // crawler canonical/OG addresses on that same current public projection.
    const path = preview?.path ?? canonicalSharePath(kind, id);
    const pagination =
      kind === "church"
        ? ["postBefore", "postCursor"]
        : kind === "post" || kind === "topic"
          ? ["before", "cursor"]
          : [];
    const identityQuery = { ...query };
    delete identityQuery.comment;
    if (kind === "event" && validEventDisplayZone(identityQuery.timeZone))
      delete identityQuery.timeZone;
    const identity = publicPageIdentity(path, identityQuery, pagination);
    filtered = identity.filtered;
    url = new URL(identity.path, origin).href;
  } catch {}
  let discoverable =
    !!preview?.available &&
    !filtered &&
    kind !== "profile" &&
    kind !== "comment";
  if (discoverable && kind === "post") {
    try {
      discoverable = !!(await withPostRead(prisma, null, (tx, context) =>
        tx.platformPost.findFirst({
          where: { AND: [publicDiscoverablePostWhere(context), { id }] },
          select: { id: true }
        })
      ));
    } catch {
      discoverable = false;
    }
  }
  const image = preview?.image ?? {
    url: new URL("/brand/share-card.png", origin).href,
    width: 1200,
    height: 630,
    alt: "God’s Churches — faith and community"
  };
  return {
    title: {
      absolute:
        discoverable && kind === "post"
          ? `${description.slice(0, 80)} | God’s Churches`
          : title
    },
    description,
    ...(url ? { alternates: { canonical: url } } : {}),
    robots: {
      index: environmentIndex && discoverable,
      follow: !!preview?.available
    },
    openGraph: {
      title,
      description,
      type: "website",
      siteName: "God’s Churches",
      ...(url ? { url } : {}),
      images: [image]
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [{ url: image.url, alt: image.alt }]
    },
    ...(preview?.author ? { authors: [{ name: preview.author.name }] } : {})
  };
}
