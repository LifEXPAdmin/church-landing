import type { Prisma, PrismaClient } from "@prisma/client";
import { withOwnedSession } from "./account-sessions";
import { requireContactActor } from "./adult-contact-policy";
import { communityReportIntakeAvailable } from "./community-reports";
import {
  exchangeAuthority,
  exchangeCanManage,
  exchangeReadableWhere
} from "./exchange-policy";
import {
  parsePantryCategory,
  parsePantryHub,
  parsePantrySession,
  pantryBoolean,
  pantryQuantity
} from "./pantry-input";
import {
  endPantryRequest,
  pantryNotice,
  recordPantryChange,
  revokePantryRequests,
  settlePantrySession
} from "./pantry-lifecycle";
import {
  PANTRY_CATEGORY_LIMIT,
  pantryActive,
  pantryOccupied
} from "./pantry-options";
import {
  currentPantryRequest,
  currentPantryCoordinator,
  pantryPair,
  requirePantryCoordinator,
  requirePantryManager,
  unavailablePantry
} from "./pantry-policy";
import { postContext, type PostTx } from "./post-access";
import { postField, postId } from "./post-input";
import { expected, PortalError } from "./portal-policy";
import { socialCommand, socialInput } from "./social-operations";

const specifics: Record<string, string[]> = {
  configure: ["churchId", "schema", "fields"],
  category: ["hubId", "id", "schema", "fields"],
  session: ["hubId", "id", "schema", "fields"],
  request: [
    "hubId",
    "id",
    "consentVersion",
    "coordinatorId",
    "accepted",
    "items",
    "note",
    "pickupContact"
  ],
  assign: ["id", "sessionId", "sessionVersion"],
  confirm: ["id", "sessionVersion"],
  cancel: ["id"],
  decline: ["id"],
  outcome: ["id", "state", "reason"],
  note: ["id", "note"],
  clear: ["id"],
  replenish: ["hubId", "id", "needId"]
};
async function hubRow(tx: PostTx, id: unknown) {
  const hub = await tx.pantryHub.findUnique({ where: { id: postId(id) } });
  if (!hub?.churchId || hub.recoveryRequired) throw unavailablePantry();
  return hub;
}
async function requestRow(
  tx: PostTx,
  id: unknown,
  actorId: string,
  own = false
) {
  const row = await tx.pantryRequest.findUnique({ where: { id: postId(id) } });
  if (
    !row ||
    (own
      ? row.requesterId !== actorId
      : ![row.requesterId, row.coordinatorId].includes(actorId))
  )
    throw unavailablePantry();
  return row;
}
async function authorize(
  tx: PostTx,
  actorId: string,
  op: string,
  input: Record<string, unknown>
) {
  await requireContactActor(tx, actorId);
  if (op === "configure") {
    await requirePantryManager(tx, postId(input.churchId), actorId);
    return;
  }
  if (["category", "session", "replenish"].includes(op)) {
    await requirePantryCoordinator(tx, await hubRow(tx, input.hubId), actorId);
    return;
  }
  if (op === "request") {
    if (!(await pantryPair(tx, await hubRow(tx, input.hubId), actorId, true)))
      throw unavailablePantry();
    return;
  }
  const row = await requestRow(
    tx,
    input.id,
    actorId,
    ["confirm", "cancel"].includes(op)
  );
  if (op === "cancel" || (op === "clear" && row.requesterId === actorId))
    return;
  const source = await currentPantryRequest(tx, row);
  if (!source) throw unavailablePantry();
  if (row.coordinatorId === actorId) {
    await requirePantryCoordinator(tx, source.hub, actorId);
    if (row.coordinatorClearedAt && op !== "clear") throw unavailablePantry();
  }
  if (
    ["assign", "decline", "outcome", "note"].includes(op) &&
    row.coordinatorId !== actorId
  )
    throw unavailablePantry();
}
function receipt(id: string, version: number, message: string) {
  return { id, version, message };
}
async function configure(
  tx: PostTx,
  actorId: string,
  input: Record<string, unknown>
) {
  const churchId = postId(input.churchId),
    fields = parsePantryHub(input.schema, input.fields);
  const managerKey = await requirePantryManager(tx, churchId, actorId);
  const church = await tx.church.findUnique({
    where: { id: churchId },
    select: { communityListed: true }
  });
  const prior = await tx.pantryHub.findUnique({ where: { id: churchId } });
  if (prior?.recoveryRequired)
    throw new PortalError(
      409,
      "Protected recovery requires review before this hub can be reopened."
    );
  expected(input.expectedVersion, prior?.version ?? 0);
  if (
    fields.published &&
    fields.audience === "PUBLIC" &&
    !church?.communityListed
  )
    throw new PortalError(409, "A public hub needs a currently listed church.");
  if (prior?.coordinatorId === actorId && !fields.acceptCoordinator)
    fields.intakeEnabled = false;
  if (
    fields.intakeEnabled &&
    !fields.acceptCoordinator &&
    !(
      prior &&
      prior.coordinatorId !== actorId &&
      prior.intakeEnabled &&
      (await currentPantryCoordinator(tx, prior))
    )
  )
    throw new PortalError(
      400,
      "Accept the named coordinator responsibility before opening intake."
    );
  if (fields.intakeEnabled && !(await communityReportIntakeAvailable(tx, null)))
    throw new PortalError(
      503,
      "Private assistance needs an available report reviewer. Keep your entries and try again later."
    );
  // A different manager can edit public configuration, but must not silently
  // replace someone else's consent. Explicit acceptance is a new appointment.
  const coordinatorId = fields.acceptCoordinator
    ? actorId
    : prior?.coordinatorId === actorId
      ? null
      : (prior?.coordinatorId ?? null);
  const coordinatorKey = fields.acceptCoordinator
    ? managerKey
    : prior?.coordinatorId === actorId
      ? null
      : (prior?.coordinatorKey ?? null);
  const changedConsent =
    !!prior &&
    (prior.coordinatorId !== coordinatorId ||
      prior.coordinatorKey !== coordinatorKey);
  const changedAccess =
    !!prior &&
    (prior.audience !== fields.audience ||
      prior.published !== fields.published);
  if (prior && (changedConsent || changedAccess))
    await revokePantryRequests(tx, { hubId: prior.id }, actorId);
  const {
    title,
    description,
    hours,
    accessInfo,
    eligibility,
    audience,
    published,
    intakeEnabled
  } = fields;
  const data = {
    title,
    description,
    hours,
    accessInfo,
    eligibility,
    audience,
    published,
    intakeEnabled
  };
  const hub = await tx.pantryHub.upsert({
    where: { id: churchId },
    create: { id: churchId, churchId, ...data, coordinatorId, coordinatorKey },
    update: {
      ...data,
      coordinatorId,
      coordinatorKey,
      ...(changedConsent ? { consentVersion: { increment: 1 } } : {}),
      ...(changedAccess ? { accessVersion: { increment: 1 } } : {})
    }
  });
  const saved = await recordPantryChange(tx, hub.id, actorId, "CONFIGURED");
  return receipt(
    saved.id,
    saved.version,
    "Your public hub information and intake choices are saved."
  );
}
async function request(
  tx: PostTx,
  actorId: string,
  input: Record<string, unknown>
) {
  const hub = await hubRow(tx, input.hubId),
    pair = await pantryPair(tx, hub, actorId, true);
  if (
    !pair ||
    input.coordinatorId !== hub.coordinatorId ||
    !pantryBoolean(input.accepted)
  )
    throw unavailablePantry();
  expected(input.consentVersion, hub.consentVersion);
  const items = input.items;
  if (
    !Array.isArray(items) ||
    !items.length ||
    items.length > PANTRY_CATEGORY_LIMIT
  )
    throw new PortalError(
      400,
      "Select from one to twelve available categories."
    );
  const normalized: {
    categoryId: string;
    version: number;
    label: string;
    unit: string;
    quantity: number;
  }[] = [];
  for (const item of items) {
    socialInput(item, ["categoryId", "version", "quantity"]);
    const id = postId(item.categoryId);
    if (normalized.some((i) => i.categoryId === id))
      throw new PortalError(400, "Choose each category once.");
    const row = await tx.pantryCategory.findFirst({
      where: {
        id,
        hubId: hub.id,
        active: true,
        availability: { not: "UNAVAILABLE" }
      }
    });
    if (!row)
      throw new PortalError(
        409,
        "A selected category changed. Review current availability."
      );
    expected(item.version, row.version);
    normalized.push({
      categoryId: row.id,
      version: row.version,
      label: row.label,
      unit: row.unit,
      quantity: pantryQuantity(item.quantity)
    });
  }
  const active = await tx.pantryRequest.findMany({
    where: { hubId: hub.id, requesterId: actorId, state: { in: pantryActive } },
    take: 21
  });
  for (const row of active) {
    if (await currentPantryRequest(tx, row, hub))
      throw new PortalError(
        409,
        "You already have an active request with this hub. Open it or cancel it before starting another."
      );
    await endPantryRequest(tx, row, actorId, "REVOKED");
  }
  const row = await tx.pantryRequest.create({
    data: {
      id: postId(input.id),
      hubId: hub.id,
      requesterId: actorId,
      coordinatorId: hub.coordinatorId,
      consentVersion: hub.consentVersion,
      authorityKey: pair.authorityKey,
      items: normalized,
      note: postField(input.note, 500),
      pickupContact: postField(input.pickupContact, 200)
    }
  });
  await recordPantryChange(tx, hub.id, actorId, "REQUESTED", {
    targetId: row.id
  });
  await pantryNotice(tx, row, actorId);
  return receipt(
    row.id,
    row.version,
    "Your private request is saved. A request does not guarantee supplies or a pickup."
  );
}

export async function pantryCommand(
  db: PrismaClient,
  token: unknown,
  input: Record<string, unknown>
) {
  const op = input.operation;
  if (typeof op !== "string" || !Object.hasOwn(specifics, op))
    throw new PortalError(400, "Choose a supported assistance action.");
  socialInput(input, [
    "operation",
    "mutationId",
    "expectedVersion",
    ...specifics[op]
  ]);
  // Release stale capacity separately so a stale form conflict cannot roll back
  // revocation. This takes the same current permission lock as other domains.
  await withOwnedSession(
    db,
    token,
    async (tx, session) => {
      await authorize(tx, session.userId, op, input);
      if (op === "assign") {
        const row = await requestRow(tx, input.id, session.userId);
        const pickup = await tx.pantrySession.findFirst({
          where: { id: postId(input.sessionId), hubId: row.hubId }
        });
        if (!pickup) throw unavailablePantry();
        await settlePantrySession(tx, pickup.id, session.userId);
      }
    },
    true
  );
  return socialCommand(
    db,
    token,
    "pantry",
    input,
    async (tx, actorId) => {
      if (op === "configure") return configure(tx, actorId, input);
      if (op === "request") return request(tx, actorId, input);
      if (["category", "session", "replenish"].includes(op)) {
        const hub = await hubRow(tx, input.hubId),
          id = postId(input.id);
        if (op === "category") {
          const prior = await tx.pantryCategory.findUnique({ where: { id } });
          if (prior && prior.hubId !== hub.id) throw unavailablePantry();
          expected(input.expectedVersion, prior?.version ?? 0);
          if (
            !prior &&
            (await tx.pantryCategory.count({ where: { hubId: hub.id } })) >=
              PANTRY_CATEGORY_LIMIT
          )
            throw new PortalError(
              409,
              "This hub already has twelve categories. Edit or reuse an existing category."
            );
          const { reason, ...fields } = parsePantryCategory(
            input.schema,
            input.fields
          );
          const row = await tx.pantryCategory.upsert({
            where: { id },
            create: { id, hubId: hub.id, ...fields },
            update: { ...fields, version: { increment: 1 } }
          });
          await recordPantryChange(tx, hub.id, actorId, "STOCK", {
            targetId: row.id,
            reason,
            ...(prior?.quantity !== null && prior?.quantity !== undefined
              ? { previousQuantity: prior.quantity }
              : {}),
            ...(row.quantity !== null ? { quantity: row.quantity } : {})
          });
          return receipt(
            row.id,
            row.version,
            "Availability is saved with its adjustment reason. It is not a reservation."
          );
        }
        if (op === "session") {
          const prior = await tx.pantrySession.findUnique({ where: { id } });
          if (prior && prior.hubId !== hub.id) throw unavailablePantry();
          expected(input.expectedVersion, prior?.version ?? 0);
          const fields = parsePantrySession(input.schema, input.fields);
          if (fields.capacity > 100)
            throw new PortalError(
              400,
              "Use at most 100 places in one pickup session."
            );
          const occupied = await tx.pantryRequest.count({
            where: { sessionId: id, state: { in: pantryOccupied } }
          });
          if (fields.capacity < occupied)
            throw new PortalError(
              409,
              "Resolve occupied places before reducing capacity."
            );
          if (
            prior &&
            occupied &&
            (fields.startLocal !== prior.startLocal ||
              fields.endLocal !== prior.endLocal ||
              fields.timeZone !== prior.timeZone ||
              fields.pickupDetails !== prior.pickupDetails ||
              !fields.active)
          )
            throw new PortalError(
              409,
              "This session has appointments. Make a new session and offer each change explicitly."
            );
          if (
            !prior &&
            (await tx.pantrySession.count({
              where: { hubId: hub.id, endsAt: { gt: new Date() }, active: true }
            })) >= 50
          )
            throw new PortalError(
              409,
              "This hub already has fifty upcoming pickup sessions."
            );
          const row = await tx.pantrySession.upsert({
            where: { id },
            create: { id, hubId: hub.id, ...fields },
            update: { ...fields, version: { increment: 1 } }
          });
          await recordPantryChange(tx, hub.id, actorId, "SESSION", {
            targetId: row.id
          });
          return receipt(row.id, row.version, "The pickup session is saved.");
        }
        const category = await tx.pantryCategory.findFirst({
          where: { id, hubId: hub.id }
        });
        if (!category) throw unavailablePantry();
        expected(input.expectedVersion, category.version);
        const needId = input.needId === null ? null : postId(input.needId);
        if (needId) {
          const context = await postContext(tx, actorId),
            authority = await exchangeAuthority(tx, context);
          const need = await tx.exchangeNeed.findFirst({
            where: {
              id: needId,
              recoveryRequired: false,
              closedAt: null,
              canceledAt: null,
              listing: {
                AND: [
                  exchangeReadableWhere(context),
                  { ownerChurchId: hub.churchId, state: "ACTIVE" }
                ]
              }
            },
            include: { listing: true }
          });
          if (
            !need?.listing ||
            !exchangeCanManage(context, authority, need.listing)
          )
            throw unavailablePantry();
        }
        const row = await tx.pantryCategory.update({
          where: { id },
          data: { replenishmentNeedId: needId, version: { increment: 1 } }
        });
        await recordPantryChange(tx, hub.id, actorId, "REPLENISHMENT", {
          targetId: row.id
        });
        return receipt(
          row.id,
          row.version,
          "The reviewed public replenishment link is saved."
        );
      }
      const row = await requestRow(tx, input.id, actorId),
        hub = await tx.pantryHub.findUnique({ where: { id: row.hubId } });
      expected(input.expectedVersion, row.version);
      if (op === "cancel" || op === "decline") {
        const saved = await endPantryRequest(
          tx,
          row,
          actorId,
          op === "cancel" ? "CANCELED" : "DECLINED"
        );
        return receipt(
          saved.id,
          saved.version,
          "This request is ended. Any active pickup place is released once."
        );
      }
      let data: Prisma.PantryRequestUpdateInput = { version: { increment: 1 } },
        action = op.toUpperCase(),
        reason: string | undefined;
      if (op === "clear") {
        if (row.coordinatorId === actorId)
          await tx.pantryEvent.updateMany({
            where: { hubId: row.hubId, targetId: row.id },
            data: { reason: "" }
          });
        if (pantryActive.includes(row.state))
          throw new PortalError(
            409,
            "End the active request before clearing it."
          );
        const reported =
          row.requesterId === actorId &&
          (await tx.communityReport.findFirst({
            where: { targetType: "PANTRY_REQUEST", targetId: row.id },
            select: { id: true }
          }));
        data =
          row.requesterId === actorId
            ? {
                ...data,
                ...(!reported ? { note: "", items: [] } : {}),
                pickupContact: "",
                requesterClearedAt: new Date()
              }
            : {
                ...data,
                coordinatorNote: "",
                coordinatorClearedAt: new Date()
              };
      } else if (op === "note")
        data.coordinatorNote = postField(input.note, 1000);
      else if (op === "assign") {
        if (!pantryActive.includes(row.state))
          throw new PortalError(
            409,
            "Only an active request can receive a pickup offer."
          );
        const session = await tx.pantrySession.findFirst({
          where: {
            id: postId(input.sessionId),
            hubId: row.hubId,
            active: true,
            startsAt: { gt: new Date() }
          }
        });
        if (!session) throw unavailablePantry();
        expected(input.sessionVersion, session.version);
        const occupied = await tx.pantryRequest.count({
          where: {
            sessionId: session.id,
            id: { not: row.id },
            state: { in: pantryOccupied }
          }
        });
        if (occupied >= session.capacity)
          throw new PortalError(
            409,
            "This pickup session is full. Choose another session."
          );
        data = {
          ...data,
          state: "ASSIGNED",
          session: { connect: { id: session.id } },
          sessionVersion: session.version,
          confirmedAt: null
        };
      } else if (op === "confirm") {
        if (row.state !== "ASSIGNED" || !row.sessionId)
          throw new PortalError(
            409,
            "Open the current pickup offer before confirming."
          );
        const session = await tx.pantrySession.findUnique({
          where: { id: row.sessionId }
        });
        if (!session?.active || session.endsAt <= new Date())
          throw new PortalError(
            409,
            "This pickup offer is no longer available."
          );
        expected(input.sessionVersion, row.sessionVersion ?? 0);
        // Capacity-only edits keep the offered directions/time unchanged.
        data.confirmedAt = row.confirmedAt ?? new Date();
      } else if (op === "outcome") {
        if (
          !row.sessionId ||
          !["ASSIGNED", "COLLECTED", "MISSED"].includes(row.state) ||
          !["COLLECTED", "MISSED"].includes(String(input.state))
        )
          throw new PortalError(
            409,
            "Record an outcome for an offered pickup."
          );
        const session = await tx.pantrySession.findUnique({
          where: { id: row.sessionId }
        });
        const state = input.state as "COLLECTED" | "MISSED";
        if (
          !session ||
          (state === "COLLECTED" ? session.startsAt : session.endsAt) >
            new Date()
        )
          throw new PortalError(
            409,
            state === "COLLECTED"
              ? "Collection cannot be recorded before the pickup starts."
              : "A pickup cannot be marked missed before it ends."
          );
        reason = postField(input.reason, 300, 3);
        data = { ...data, state, endedAt: row.endedAt ?? new Date() };
        action = state;
      } else throw new PortalError(400, "Choose a supported request action.");
      const saved = await tx.pantryRequest.update({
        where: { id: row.id },
        data
      });
      if (!hub) throw unavailablePantry();
      await recordPantryChange(tx, hub.id, actorId, action, {
        targetId: row.id,
        ...(reason ? { reason } : {})
      });
      if (!["clear", "note"].includes(op))
        await pantryNotice(tx, saved, actorId);
      return receipt(
        saved.id,
        saved.version,
        op === "clear"
          ? "Your private request details are cleared."
          : "The private assistance record is saved."
      );
    },
    (tx, actorId) => authorize(tx, actorId, op, input)
  );
}
