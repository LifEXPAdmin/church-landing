import type { PrismaClient } from "@prisma/client";
import { withAccountRead } from "./account-read";
import { postContext } from "./post-access";
import { requireExchangeActor } from "./exchange-policy";
import { expected, PortalError } from "./portal-policy";
import { socialCommand, socialInput } from "./social-operations";
import { recordDiscoveryControl } from "./retention-controls";
import { getDiscoveryPlace, discoveryPlaceLabel } from "./discovery-places";
import {
  parseExchangeDefaults,
  exchangeDefaultDraftFields
} from "./exchange-handoff-input";
import {
  emptyExchangeDefaults,
  type ExchangeDefaultFields
} from "./exchange-handoff-options";

export function exchangeDefaultsCommand(
  db: PrismaClient,
  token: unknown,
  input: Record<string, unknown>
) {
  socialInput(input, [
    "operation",
    "mutationId",
    "expectedVersion",
    "schema",
    "fields"
  ]);
  if (input.operation !== "defaults-save")
    throw new PortalError(400, "Choose a supported listing-defaults action.");
  return socialCommand(
    db,
    token,
    "exchange-defaults",
    input,
    async (tx, ownerId) => {
      const context = await postContext(tx, ownerId);
      requireExchangeActor(context);
      const prior = await tx.exchangeDefaults.findUnique({
        where: { ownerId }
      });
      expected(input.expectedVersion, prior?.version ?? 0);
      const fields = parseExchangeDefaults(input.schema, input.fields);
      exchangeDefaultDraftFields(fields, context.churches);
      if (fields.country || fields.placeId)
        await getDiscoveryPlace(fields.country, fields.placeId);
      const data = { ...fields, recoveryRequired: false };
      const saved = await tx.exchangeDefaults.upsert({
        where: { ownerId },
        create: { ownerId, ...data },
        update: { ...data, version: { increment: 1 } }
      });
      await recordDiscoveryControl(
        tx,
        "EXCHANGE_DEFAULTS",
        ownerId,
        ownerId,
        saved.version
      );
      return {
        id: ownerId,
        version: saved.version,
        message:
          "Personal listing defaults saved privately. Existing listings and inquiry consent are unchanged."
      };
    },
    async (tx, ownerId) => {
      requireExchangeActor(await postContext(tx, ownerId));
    }
  );
}

export function readExchangeDefaults(db: PrismaClient, token: unknown) {
  return withAccountRead(db, token, async (tx, ownerId) => {
    const context = await postContext(tx, ownerId);
    const actorId = requireExchangeActor(context);
    const row = await tx.exchangeDefaults.findUnique({
      where: { ownerId: actorId }
    });
    const fields: ExchangeDefaultFields =
      row && !row.recoveryRequired
        ? {
            intent: row.intent as ExchangeDefaultFields["intent"],
            audience: row.audience as ExchangeDefaultFields["audience"],
            audienceChurchId: row.audienceChurchId,
            country: row.country,
            placeId: row.placeId,
            pickupDetails: row.pickupDetails
          }
        : emptyExchangeDefaults();
    const available =
      !row?.recoveryRequired &&
      (fields.audience !== "CHURCH" ||
        context.churches.includes(fields.audienceChurchId!));
    const place = fields.placeId
      ? await getDiscoveryPlace(fields.country, fields.placeId)
      : null;
    const churches = await tx.church.findMany({
      where: { id: { in: context.churches } },
      select: { id: true, name: true },
      orderBy: { name: "asc" }
    });
    return {
      ownerId: actorId,
      version: row?.version ?? 0,
      fields,
      churches,
      available,
      recoveryRequired: !!row?.recoveryRequired,
      placeLabel: place ? discoveryPlaceLabel(place) : null,
      draftFields: available
        ? exchangeDefaultDraftFields(fields, context.churches)
        : null
    };
  });
}
