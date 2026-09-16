import { createHmac, timingSafeEqual } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { accountConfig } from "./account-config";
import { PortalError } from "./portal-policy";
import { postId } from "./post-input";
import {
  exchangeSearchParams,
  type ExchangeSearchQuery
} from "./exchange-options";

export type ExchangeSearchAnchor = {
  id: string;
  updatedAt: string;
  publishedAt: string | null;
  priceMinor: number | null;
  band: number | null;
};
type Page = { at: string; anchor: ExchangeSearchAnchor | null };
export const exchangePageChanged = () =>
  new PortalError(
    409,
    "This listing page changed. Refresh the current search."
  );

export function exchangeSearchCursor(
  viewerId: string | null,
  query: ExchangeSearchQuery,
  now = new Date()
) {
  const criteria = exchangeSearchParams(query).toString();
  const sign = (body: string) =>
    createHmac("sha256", accountConfig().rateSecret)
      .update(
        JSON.stringify([
          "exchange-search-v1",
          viewerId,
          !!query.mine,
          criteria,
          body
        ])
      )
      .digest("hex");
  return {
    encode(value: Page) {
      const body = Buffer.from(JSON.stringify(value)).toString("base64url");
      return body + "." + sign(body);
    },
    decode(value: string | undefined): Page {
      if (!value) return { at: now.toISOString(), anchor: null };
      try {
        if (value.length > 1800) throw Error();
        const [body, signature, extra] = value.split(".");
        if (
          extra ||
          !/^[A-Za-z0-9_-]+$/.test(body) ||
          !/^[a-f0-9]{64}$/.test(signature) ||
          !timingSafeEqual(Buffer.from(sign(body)), Buffer.from(signature))
        )
          throw Error();
        const page = JSON.parse(
          Buffer.from(body, "base64url").toString("utf8")
        );
        const validDate = (date: unknown) =>
          typeof date === "string" &&
          Number.isFinite(Date.parse(date)) &&
          new Date(date).toISOString() === date;
        if (
          !page ||
          Object.keys(page).sort().join() !== "anchor,at" ||
          !validDate(page.at) ||
          Date.parse(page.at) > now.getTime() + 5000 ||
          now.getTime() - Date.parse(page.at) > 3600000
        )
          throw Error();
        const anchor = page.anchor;
        if (
          anchor !== null &&
          (!anchor ||
            Object.keys(anchor).sort().join() !==
              "band,id,priceMinor,publishedAt,updatedAt" ||
            postId(anchor.id) !== anchor.id ||
            !validDate(anchor.updatedAt) ||
            (anchor.publishedAt !== null && !validDate(anchor.publishedAt)) ||
            (anchor.priceMinor !== null &&
              (!Number.isSafeInteger(anchor.priceMinor) ||
                anchor.priceMinor < 0)) ||
            (anchor.band !== null &&
              ![10, 25, 50, 100, 250].includes(anchor.band)))
        )
          throw Error();
        return page as Page;
      } catch {
        throw exchangePageChanged();
      }
    }
  };
}

/** Criteria only. Every caller must also apply the current discovery/owner policy. */
export function exchangeSearchWhere(
  query: ExchangeSearchQuery
): Prisma.ExchangeListingWhereInput {
  const search = query.q?.replace(/[\\%_]/g, "\\$&");
  return {
    ...(query.intent ? { intent: query.intent } : {}),
    ...(query.category ? { category: query.category } : {}),
    ...(query.condition ? { condition: query.condition } : {}),
    ...(query.mine
      ? query.state
        ? { state: query.state }
        : {}
      : {
          state:
            query.availability === "ALL"
              ? { in: ["ACTIVE", "RESERVED"] }
              : (query.availability ?? "ACTIVE")
        }),
    ...(query.scope === "public"
      ? { audience: "PUBLIC" }
      : query.scope === "church"
        ? { audience: "CHURCH", audienceChurchId: query.churchId }
        : {}),
    ...(search
      ? {
          OR: ["title", "description", "requestedItems", "serviceArea"].map(
            (key) => ({ [key]: { contains: search, mode: "insensitive" } })
          )
        }
      : {}),
    ...(query.country ? { country: query.country } : {}),
    ...(query.placeId && !query.radiusKm ? { placeId: query.placeId } : {}),
    AND: [
      ...(query.freeOnly
        ? [
            {
              OR: [
                { intent: "FREE" as const },
                { intent: "SERVICE" as const, servicePricing: "FREE" }
              ]
            }
          ]
        : []),
      ...(query.currency && query.basis
        ? [
            {
              currency: query.currency,
              priceMinor: {
                not: null,
                ...(query.minPriceMinor !== undefined
                  ? { gte: query.minPriceMinor }
                  : {}),
                ...(query.maxPriceMinor !== undefined
                  ? { lte: query.maxPriceMinor }
                  : {})
              },
              ...(query.basis === "item"
                ? { intent: "SALE" as const }
                : {
                    intent: "SERVICE" as const,
                    servicePricing: "FIXED",
                    serviceUnit: query.basis === "hour" ? "HOUR" : "TASK"
                  })
            }
          ]
        : [])
    ]
  };
}

export function exchangeSearchAfter(
  query: ExchangeSearchQuery,
  cursor: ExchangeSearchAnchor
): Prisma.ExchangeListingWhereInput {
  const time = query.mine ? "updatedAt" : "publishedAt";
  const at = new Date((query.mine ? cursor.updatedAt : cursor.publishedAt)!);
  const newest: Prisma.ExchangeListingWhereInput = {
    OR: [{ [time]: { lt: at } }, { [time]: at, id: { lt: cursor.id } }]
  };
  if (!query.sort?.startsWith("price-")) return newest;
  if (cursor.priceMinor === null) throw exchangePageChanged();
  return {
    OR: [
      {
        priceMinor: {
          [query.sort === "price-low" ? "gt" : "lt"]: cursor.priceMinor
        }
      },
      { priceMinor: cursor.priceMinor, ...newest }
    ]
  };
}
