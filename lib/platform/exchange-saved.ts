import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { postContext, withPostRead } from "./post-access";
import { postField, postId } from "./post-input";
import { expected, PortalError } from "./portal-policy";
import { socialCommand, socialInput } from "./social-operations";
import { exchangeReadableWhere, requireExchangeActor } from "./exchange-policy";
import { parseSavedExchangeCriteria } from "./exchange-input";
import { EXCHANGE_SAVED_SCHEMA } from "./exchange-options";
import { getDiscoveryPlace } from "./discovery-places";
import { recordDiscoveryControl } from "./retention-controls";

const PAGE = 20,
  FAVORITES_LIMIT = 2000,
  SEARCH_LIMIT = 50;
// Stable even if a removed favorite was absent from the restored database. The
// protected journal can recreate an opaque tombstone and reject the old write.
export const exchangeFavoriteId = (ownerId: string, listingId: string) =>
  createHash("sha256")
    .update(JSON.stringify(["exchange-favorite-v1", ownerId, listingId]))
    .digest("hex");

export function exchangeSavedCommand(
  db: PrismaClient,
  token: unknown,
  input: Record<string, unknown>
) {
  const operation = input.operation;
  if (
    ![
      "favorite-add",
      "favorite-remove",
      "search-save",
      "search-delete"
    ].includes(String(operation))
  )
    throw new PortalError(400, "Choose a supported saved-listing action.");
  socialInput(input, [
    "operation",
    "mutationId",
    "expectedVersion",
    ...(operation === "favorite-add"
      ? ["listingId"]
      : operation === "favorite-remove"
        ? ["favoriteId"]
        : operation === "search-save"
          ? ["searchId", "schema", "name", "criteria", "alerts"]
          : ["searchId"])
  ]);
  return socialCommand(
    db,
    token,
    "exchange-saved",
    input,
    async (tx, ownerId) => {
      const context = await postContext(tx, ownerId);
      requireExchangeActor(context);
      if (operation === "favorite-add" || operation === "favorite-remove") {
        const listingId =
          operation === "favorite-add" ? postId(input.listingId) : null;
        const id = listingId
          ? exchangeFavoriteId(ownerId, listingId)
          : postId(input.favoriteId);
        const previous = await tx.exchangeFavorite.findFirst({
          where: { id, ownerId }
        });
        if (!listingId && !previous)
          throw new PortalError(404, "This saved choice is unavailable.");
        expected(input.expectedVersion, previous?.version ?? 0);
        if (listingId) {
          if (
            !(await tx.exchangeListing.findFirst({
              where: {
                AND: [{ id: listingId }, exchangeReadableWhere(context)]
              },
              select: { id: true }
            }))
          )
            throw new PortalError(404, "This listing is unavailable to save.");
          if (!previous || previous.deletedAt) {
            if (
              (await tx.exchangeFavorite.count({
                where: { ownerId, deletedAt: null }
              })) >= FAVORITES_LIMIT
            )
              throw new PortalError(
                409,
                "Keep up to 2,000 favorite listings. Remove a choice before adding another."
              );
            if (
              !previous &&
              (await tx.exchangeFavorite.count({ where: { ownerId } })) >= 20000
            )
              throw new PortalError(
                429,
                "Saved listing history needs a storage review."
              );
          }
        } else if (!previous)
          throw new PortalError(404, "This saved choice is unavailable.");
        const saved = previous
          ? await tx.exchangeFavorite.update({
              where: { id },
              data: {
                ...(listingId
                  ? { listingId, deletedAt: null }
                  : { deletedAt: new Date() }),
                version: { increment: 1 }
              }
            })
          : await tx.exchangeFavorite.create({
              data: { id, ownerId, listingId }
            });
        await recordDiscoveryControl(
          tx,
          "EXCHANGE_FAVORITE",
          ownerId,
          saved.id,
          saved.version
        );
        return {
          id: saved.id,
          version: saved.version,
          message: listingId
            ? "Listing saved privately. The owner is not notified."
            : "Favorite removed."
        };
      }
      const id = postId(input.searchId),
        previous = await tx.exchangeSavedSearch.findUnique({ where: { id } });
      if (previous && previous.ownerId !== ownerId)
        throw new PortalError(404, "This saved search is unavailable.");
      expected(input.expectedVersion, previous?.version ?? 0);
      if (previous?.deletedAt || previous?.recoveryRequired)
        throw new PortalError(
          409,
          "This search was removed or quarantined during recovery. Create a new saved search."
        );
      if (operation === "search-delete") {
        if (!previous)
          throw new PortalError(404, "This saved search is unavailable.");
        const saved = await tx.exchangeSavedSearch.update({
          where: { id },
          data: {
            name: "",
            criteria: {},
            alertsSince: null,
            deletedAt: new Date(),
            version: { increment: 1 }
          }
        });
        await recordDiscoveryControl(
          tx,
          "EXCHANGE_SAVED_SEARCH",
          ownerId,
          id,
          saved.version
        );
        return {
          id,
          version: saved.version,
          message: "Saved search removed and its alerts stopped."
        };
      }
      if (
        input.schema !== EXCHANGE_SAVED_SCHEMA ||
        typeof input.alerts !== "boolean"
      )
        throw new PortalError(
          400,
          "Reload the saved-search form and make an explicit alert choice."
        );
      const name = postField(input.name, 80, 1),
        { query, criteria } = parseSavedExchangeCriteria(input.criteria);
      if (query.placeId) await getDiscoveryPlace(query.country, query.placeId);
      if (
        query.scope === "church" &&
        !context.churches.includes(query.churchId!)
      )
        throw new PortalError(
          403,
          "Choose one of your currently approved churches."
        );
      if (input.alerts && query.availability && query.availability !== "ACTIVE")
        throw new PortalError(
          400,
          "Matching alerts use available listings only. Choose Available now before enabling alerts."
        );
      if (
        !previous &&
        (await tx.exchangeSavedSearch.count({
          where: { ownerId, deletedAt: null }
        })) >= SEARCH_LIMIT
      )
        throw new PortalError(
          409,
          "Keep up to 50 named searches. Remove one before adding another."
        );
      if (
        !previous &&
        (await tx.exchangeSavedSearch.count({ where: { ownerId } })) >= 2000
      )
        throw new PortalError(
          429,
          "Saved-search history needs a storage review."
        );
      // Editing criteria or consent starts a new interval, never historical backfill.
      const data = {
        name,
        schema: EXCHANGE_SAVED_SCHEMA,
        criteria,
        alertsSince: input.alerts ? new Date() : null
      };
      const saved = previous
        ? await tx.exchangeSavedSearch.update({
            where: { id },
            data: { ...data, version: { increment: 1 } }
          })
        : await tx.exchangeSavedSearch.create({
            data: { id, ownerId, ...data }
          });
      await recordDiscoveryControl(
        tx,
        "EXCHANGE_SAVED_SEARCH",
        ownerId,
        id,
        saved.version
      );
      return {
        id,
        version: saved.version,
        message: input.alerts
          ? "Search saved. New matching listings can appear in Activity. Phone alerts also require your separate notification and device choices."
          : "Search saved privately. Matching alerts are off."
      };
    },
    async (tx, ownerId) => {
      requireExchangeActor(await postContext(tx, ownerId));
    }
  );
}

export function readExchangeSaved(
  db: PrismaClient,
  token: unknown,
  query: {
    view: "favorites" | "searches" | "favorite" | "search";
    searchId?: unknown;
    after?: unknown;
    listingId?: unknown;
  }
) {
  return withPostRead(db, token, async (tx, context) => {
    const ownerId = requireExchangeActor(context);
    if (query.view === "favorite") {
      const id = exchangeFavoriteId(ownerId, postId(query.listingId));
      const row = await tx.exchangeFavorite.findFirst({
        where: { id, ownerId },
        select: { id: true, version: true, deletedAt: true }
      });
      return {
        ownerId,
        favorite: row
          ? { id: row.id, version: row.version, saved: !row.deletedAt }
          : null
      };
    }
    const after = query.after ? postId(query.after) : null;
    if (query.view === "searches" || query.view === "search") {
      if (
        after &&
        !(await tx.exchangeSavedSearch.findFirst({
          where: { id: after, ownerId, deletedAt: null },
          select: { id: true }
        }))
      )
        throw new PortalError(
          409,
          "Saved searches changed. Reload the first page."
        );
      const rows = await tx.exchangeSavedSearch.findMany({
        where: {
          ownerId,
          ...(query.view === "search" ? { id: postId(query.searchId) } : {}),
          deletedAt: null,
          recoveryRequired: false,
          ...(after ? { id: { gt: after } } : {})
        },
        orderBy: { id: "asc" },
        take: PAGE + 1
      });
      if (query.view === "search" && !rows.length)
        throw new PortalError(
          404,
          "This saved search is unavailable. Open your current named searches."
        );
      return {
        ownerId,
        searches: rows.slice(0, PAGE).map((row) => {
          const { criteria } = parseSavedExchangeCriteria(row.criteria);
          return {
            id: row.id,
            version: row.version,
            name: row.name,
            schema: row.schema,
            criteria,
            alerts: !!row.alertsSince,
            href:
              "/platform/exchange" +
              (Object.keys(criteria).length
                ? "?" + new URLSearchParams(criteria)
                : "")
          };
        }),
        after: rows.length > PAGE ? rows[PAGE - 1].id : null
      };
    }
    if (
      after &&
      !(await tx.exchangeFavorite.findFirst({
        where: { id: after, ownerId, deletedAt: null },
        select: { id: true }
      }))
    )
      throw new PortalError(
        409,
        "Favorite listings changed. Reload the first page."
      );
    const rows = await tx.exchangeFavorite.findMany({
      where: {
        ownerId,
        deletedAt: null,
        ...(after ? { id: { gt: after } } : {})
      },
      orderBy: { id: "asc" },
      take: PAGE + 1
    });
    const visible = await tx.exchangeListing.findMany({
      where: {
        AND: [
          exchangeReadableWhere(context),
          {
            id: {
              in: rows
                .slice(0, PAGE)
                .flatMap((row) => (row.listingId ? [row.listingId] : []))
            }
          }
        ]
      },
      select: {
        id: true,
        title: true,
        intent: true,
        state: true,
        currency: true,
        priceMinor: true,
        servicePricing: true,
        serviceUnit: true,
        placeLabel: true
      },
      take: PAGE
    });
    const byId = new Map(visible.map((row) => [row.id, row]));
    return {
      ownerId,
      favorites: rows.slice(0, PAGE).map((row) => ({
        id: row.id,
        version: row.version,
        listing: row.listingId ? (byId.get(row.listingId) ?? null) : null
      })),
      after: rows.length > PAGE ? rows[PAGE - 1].id : null
    };
  });
}
