import { Prisma } from "@prisma/client";
import { exchangeDiscoveryWhere } from "./exchange-policy";
import { mediaReadableSql } from "./media-catalog-policy";
import { postContext, type PostContext, type PostTx } from "./post-access";

export type PublicResourceKind = "listing" | "media";
export type PublicResourceProjection = {
  id: string;
  title: string;
  description: string;
};

/** Public discovery excludes closed listings and the separate help workflow. */
export function publicListingWhere(
  context: PostContext
): Prisma.ExchangeListingWhereInput {
  return {
    AND: [
      exchangeDiscoveryWhere(context),
      { audience: "PUBLIC", helpPurpose: null, helpRequest: null }
    ]
  };
}

/** Uses the canonical current rights, source, moderation and owner checks. */
export function publicMediaSql(context: PostContext, now = new Date()) {
  return Prisma.sql`(${mediaReadableSql(context, now)}) AND m.audience='PUBLIC'`;
}

/** Viewer state can narrow anonymous discovery, never make private copy public. */
export async function publicResourceProjection(
  tx: PostTx,
  context: PostContext,
  kind: PublicResourceKind,
  id: string
): Promise<PublicResourceProjection | null> {
  const anonymous = await postContext(tx);
  if (kind === "listing")
    return tx.exchangeListing.findFirst({
      where: {
        AND: [
          { id },
          publicListingWhere(anonymous),
          publicListingWhere(context)
        ]
      },
      select: { id: true, title: true, description: true }
    });

  const now = new Date();
  const rows = await tx.$queryRaw<PublicResourceProjection[]>(
    Prisma.sql`SELECT m.id, m.title, m.description FROM "MediaCatalogItem" m
      WHERE m.id=${id} AND (${publicMediaSql(anonymous, now)})
        AND (${publicMediaSql(context, now)}) LIMIT 1`
  );
  return rows[0] ?? null;
}
