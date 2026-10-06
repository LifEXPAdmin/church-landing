import { createHmac, timingSafeEqual } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { accountConfig } from "./account-config";
import { PortalError } from "./portal-policy";
import { listExchangeListings } from "./exchange-listings";
import { parseExchangeListQuery } from "./exchange-input";
import { exchangeIntentLabels } from "./exchange-options";
import { mediaCatalogRead } from "./media-catalog-reads";
import { mediaFormatNames } from "./media-catalog-options";
import { listVolunteerOpportunities } from "./volunteer-reads";
import { listGroups } from "./group-reads";
import type { SearchNavigation } from "./search-navigation";

/** The cursor carries only navigation. Each source independently checks access. */
function cursorCodec(token: unknown, query: SearchNavigation) {
  const { after: ignored, ...criteria } = query;
  void ignored;
  const sign = (body: string) =>
    createHmac("sha256", accountConfig().rateSecret)
      .update(
        JSON.stringify(["explore-source-v1", token ?? null, criteria, body])
      )
      .digest("hex");
  return {
    encode(cursor: string) {
      const body = Buffer.from(
        JSON.stringify({ cursor, at: Date.now() })
      ).toString("base64url");
      return body + "." + sign(body);
    },
    decode(): string | undefined {
      if (!query.after) return;
      try {
        if (query.after.length > 4000) throw Error();
        const [body, signature, extra] = query.after.split(".");
        if (
          extra ||
          !/^[A-Za-z0-9_-]+$/.test(body) ||
          !/^[a-f0-9]{64}$/.test(signature) ||
          !timingSafeEqual(Buffer.from(signature), Buffer.from(sign(body)))
        )
          throw Error();
        const value = JSON.parse(Buffer.from(body, "base64url").toString());
        if (
          Object.keys(value).sort().join() !== "at,cursor" ||
          typeof value.cursor !== "string" ||
          value.cursor.length > 1800 ||
          !Number.isSafeInteger(value.at) ||
          value.at > Date.now() + 5000 ||
          Date.now() - value.at > 3600000
        )
          throw Error();
        return value.cursor;
      } catch {
        throw new PortalError(
          409,
          "This search page changed. Restart with your current filters."
        );
      }
    }
  };
}

export async function searchResourceModule(
  db: PrismaClient,
  token: unknown,
  query: SearchNavigation,
  expectedAccount?: string
) {
  const codec = cursorCodec(token, query),
    after = codec.decode();
  const account = (owner: string | null) => {
    if (expectedAccount !== undefined && owner !== expectedAccount)
      throw new PortalError(
        401,
        "Your sign-in changed. Reload before continuing."
      );
  };
  const page = <T>(
    items: T[],
    cursor: string | null,
    order: string,
    limitReached = false
  ) => ({
    kind: query.kind,
    query: query.q,
    items,
    nextCursor: cursor ? codec.encode(cursor) : null,
    order,
    limitReached
  });
  if (query.kind === "listings") {
    const result = await listExchangeListings(
      db,
      token,
      parseExchangeListQuery({
        q: query.q,
        country: query.country,
        placeId: query.placeId,
        radiusKm: query.radiusKm,
        after,
        sort: "newest"
      })
    );
    account(result.viewerId);
    return page(
      result.listings.map((row) => ({
        id: row.id,
        label: row.title,
        summary: row.description,
        detail: [exchangeIntentLabels[row.intent], row.placeLabel, row.country]
          .filter(Boolean)
          .join(" · "),
        href: `/platform/exchange/${row.id}`
      })),
      result.after,
      "Newest published listings first."
    );
  }
  if (query.kind === "media") {
    const parameters = new URLSearchParams({ q: query.q, view: "library" });
    if (query.churchId) parameters.set("church", query.churchId);
    if (after) parameters.set("page", after);
    const result = await mediaCatalogRead(
      db,
      token,
      parameters,
      expectedAccount
    );
    account(result.actorId);
    if (
      !result.items ||
      result.total === undefined ||
      result.page === undefined
    )
      throw new PortalError(503, "Search could not be loaded. Try again.");
    const more = (result.page + 1) * 20 < result.total;
    return page(
      result.items.map((row) => ({
        id: row.id,
        label: row.title,
        detail: mediaFormatNames[row.format as keyof typeof mediaFormatNames],
        href: `/platform/media/${row.id}`
      })),
      more && result.page < 999 ? String(result.page + 1) : null,
      "Newest published media first.",
      more && result.page === 999
    );
  }
  if (query.kind === "groups") {
    const result = await listGroups(db, token, {
      q: query.q,
      churchId: query.churchId,
      after
    });
    account(result.viewerId);
    return page(
      result.groups.map((row) => ({
        id: row.id,
        label: row.name,
        summary: row.purpose.slice(0, 220),
        detail: [row.format.toLowerCase(), row.area]
          .filter(Boolean)
          .join(" · "),
        href: `/platform/groups/${encodeURIComponent(row.slug)}`
      })),
      result.nextCursor,
      "Matching listed groups in a stable order."
    );
  }
  const result = await listVolunteerOpportunities(db, token, {
    q: query.q,
    churchId: query.churchId,
    after
  });
  account(result.ownerId);
  return page(
    result.items.map((row) => ({
      id: row.id,
      label: row.title,
      detail: row.closed ? "Currently unavailable" : "Volunteer opportunity",
      href: `/platform/serve/${row.id}`
    })),
    result.nextCursor,
    "Matching opportunities in a stable order."
  );
}
