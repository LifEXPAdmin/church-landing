import { Prisma, type PrismaClient } from "@prisma/client";
import { withPostRead, postContext, type PostTx } from "./post-access";
import {
  defaultDiscoveryPreferences,
  parseDiscoveryPreferences,
  type DiscoveryFilters,
  type DiscoveryPreferences
} from "./discovery-options";
import { getDiscoveryPlace, discoveryPlaceLabel } from "./discovery-places";
import { expected, PortalError } from "./portal-policy";
import { socialCommand, socialInput } from "./social-operations";
import { POST_TOPICS } from "./post-options";
import { recordDiscoveryControl } from "./retention-controls";
import { feedMode } from "./feed-options";

export function storedDiscoveryPreferences(value: unknown) {
  if (value == null) return defaultDiscoveryPreferences();
  try {
    return parseDiscoveryPreferences(value);
  } catch {
    throw new PortalError(
      503,
      "These saved discovery choices need a review. Keep your entries and reload your settings."
    );
  }
}
export async function validateDiscoveryChoices(
  tx: PostTx,
  ownerId: string,
  preferences: DiscoveryPreferences
) {
  const context = await postContext(tx, ownerId);
  for (const filters of [
    preferences.filters,
    ...preferences.presets.map((preset) => preset.filters)
  ]) {
    if (
      filters.homeChurchId &&
      !context.churches.includes(filters.homeChurchId)
    )
      throw new PortalError(
        403,
        "Choose a current approved church connection. Following a church does not create membership."
      );
    await getDiscoveryPlace(filters.country, filters.placeId);
  }
}
export function getDiscoveryPreferences(db: PrismaClient, token: unknown) {
  return withPostRead(db, token, async (tx, context) => {
    if (!context.actorId)
      throw new PortalError(
        401,
        "Sign in to view your saved discovery choices."
      );
    const row = await tx.socialPreferences.findUnique({
      where: { ownerId: context.actorId },
      select: {
        discovery: true,
        discoveryVersion: true,
        discoveryRecoveryRequired: true,
        feedMode: true,
        feedVersion: true
      }
    });
    const preferences = storedDiscoveryPreferences(row?.discovery);
    const churches = await tx.church.findMany({
      where: { id: { in: context.churches } },
      select: { id: true, name: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: 200
    });
    const place = await getDiscoveryPlace(
      preferences.filters.country,
      preferences.filters.placeId
    );
    return {
      ownerId: context.actorId,
      preferences,
      version: row?.discoveryVersion ?? 0,
      mode: feedMode(row?.feedMode) ?? "latest",
      feedVersion: row?.feedVersion ?? 0,
      recoveryRequired: row?.discoveryRecoveryRequired ?? false,
      churches,
      place: place
        ? {
            id: place.id,
            country: place.country,
            label: discoveryPlaceLabel(place)
          }
        : null
    };
  });
}
export function saveDiscoveryPreferences(
  db: PrismaClient,
  token: unknown,
  input: Record<string, unknown>
) {
  socialInput(input, [
    "operation",
    "preferences",
    "topic",
    "choice",
    "expectedVersion",
    "mutationId",
    "mode",
    "expectedFeedVersion"
  ]);
  const operation = input.operation ?? "save";
  if (!["save", "feedback", "reset-feedback"].includes(String(operation)))
    throw new PortalError(400, "Choose a supported discovery change.");
  if (
    operation === "save" &&
    (input.topic !== undefined || input.choice !== undefined)
  )
    throw new PortalError(400, "Use the preference fields for this save.");
  if (operation !== "save" && input.preferences !== undefined)
    throw new PortalError(400, "Feedback does not replace your saved filters.");
  const value =
    operation === "save" ? parseDiscoveryPreferences(input.preferences) : null;
  const mode = input.mode === undefined ? undefined : feedMode(input.mode);
  if (input.mode !== undefined && (!mode || operation !== "save"))
    throw new PortalError(
      400,
      "Choose a supported feed when saving full preferences."
    );
  return socialCommand(
    db,
    token,
    "discovery-preferences",
    input,
    async (tx, ownerId) => {
      const old = await tx.socialPreferences.findUnique({
        where: { ownerId },
        select: {
          discovery: true,
          discoveryVersion: true,
          discoveryRecoveryRequired: true,
          feedVersion: true
        }
      });
      expected(input.expectedVersion, old?.discoveryVersion ?? 0);
      if (mode) expected(input.expectedFeedVersion, old?.feedVersion ?? 0);
      if (old?.discoveryRecoveryRequired && operation !== "save")
        throw new PortalError(
          409,
          "Review and save your discovery choices after recovery before changing recommendations."
        );
      let preferences = value ?? storedDiscoveryPreferences(old?.discovery);
      if (operation === "feedback") {
        if (
          !POST_TOPICS.includes(input.topic as (typeof POST_TOPICS)[number]) ||
          !["more", "less", "clear"].includes(String(input.choice))
        )
          throw new PortalError(
            400,
            "Choose More, Less or Clear for a supported topic."
          );
        const key = input.topic as (typeof POST_TOPICS)[number],
          feedback = { ...preferences.feedback };
        if (input.choice === "clear") delete feedback[key];
        else feedback[key] = input.choice === "more" ? 1 : -1;
        preferences = { ...preferences, feedback };
      } else if (operation === "reset-feedback") {
        if (input.topic !== undefined || input.choice !== undefined)
          throw new PortalError(
            400,
            "Reset clears recommendation feedback only."
          );
        preferences = { ...preferences, feedback: {} };
      }
      // Feedback is allowed even after a church preset becomes stale; it cannot
      // change that preset or grant membership. Full saves validate all choices.
      if (operation === "save")
        await validateDiscoveryChoices(tx, ownerId, preferences);
      const data = preferences as unknown as Prisma.InputJsonObject;
      const row = await tx.socialPreferences.upsert({
        where: { ownerId },
        create: {
          ownerId,
          discovery: data,
          discoveryVersion: 1,
          ...(mode ? { feedMode: mode, feedVersion: 1 } : {})
        },
        update: {
          discovery: data,
          discoveryVersion: { increment: 1 },
          discoveryRecoveryRequired: false,
          ...(mode ? { feedMode: mode, feedVersion: { increment: 1 } } : {})
        },
        select: { discoveryVersion: true }
      });
      await recordDiscoveryControl(
        tx,
        "DISCOVERY_PREFERENCES",
        ownerId,
        ownerId,
        row.discoveryVersion
      );
      return {
        id: ownerId,
        version: row.discoveryVersion,
        message:
          operation === "reset-feedback"
            ? "Recommendation feedback reset. Your filters, follows, favorites, blocks and saved posts are unchanged."
            : operation === "feedback"
              ? "Recommendation choice saved. Refresh posts when you are ready for a new order."
              : "Discovery choices saved."
      };
    },
    undefined,
    "shared"
  );
}
export function discoveryFiltersSummary(filters: DiscoveryFilters) {
  return [
    filters.geography,
    filters.denominations.length
      ? `${filters.denominations.length} selected traditions`
      : "all traditions",
    filters.languages.length
      ? `${filters.languages.length} selected languages`
      : "all languages"
  ].join(" · ");
}
