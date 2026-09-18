import type { PrismaClient } from "@prisma/client";
import { withOwnedSession } from "./account-sessions";
import { requireContactActor } from "./adult-contact-policy";
import { communityReportIntakeAvailable } from "./community-reports";
import { exchangeReceiverKey } from "./exchange-handoff-policy";
import { revokeExchangeInquiries } from "./exchange-handoff-lifecycle";
import {
  needBoolean,
  needDeadline,
  needQuantity,
  needQuote,
  parseNeedSlot
} from "./exchange-need-input";
import { activeNeedStates, NEED_SLOT_LIMIT } from "./exchange-need-options";
import {
  currentNeedContribution,
  managedNeedListing,
  needPair,
  requireNeedCoordinator,
  requireNeedOpen,
  unavailableNeed
} from "./exchange-need-policy";
import {
  endNeedContribution,
  recordNeedChange,
  revokeNeedContributions,
  settleNeedContributions
} from "./exchange-need-lifecycle";
import {
  canOrganize,
  participationActive,
  participationCommandIn,
  participationPost
} from "./post-participation";
import { postContext, type PostTx } from "./post-access";
import { postField, postId } from "./post-input";
import { expected, PortalError } from "./portal-policy";
import { recordDiscoveryControl } from "./retention-controls";
import { socialCommand, socialInput } from "./social-operations";

const specifics: Record<string, string[]> = {
  configure: [
    "listingId",
    "listingVersion",
    "deadlineLocal",
    "timeZone",
    "acceptCoordinator"
  ],
  slot: ["needId", "slotId", "schema", "fields"],
  "close-slot": ["needId", "slotId", "reason"],
  claim: [
    "needId",
    "slotId",
    "slotVersion",
    "consentVersion",
    "id",
    "quantity",
    "note",
    "price",
    "currency",
    "shareName",
    "loanAccepted",
    "waitlist"
  ],
  volunteer: ["needId", "slotId", "slotVersion", "signupVersion"],
  accept: ["id"],
  decline: ["id"],
  withdraw: ["id"],
  "confirm-return": ["id", "quantity"],
  receive: ["id", "quantity", "reason"],
  "return-loan": ["id", "quantity", "reason"],
  attribution: ["id", "shareName"],
  dispute: ["id", "note"],
  update: ["needId", "text"],
  close: ["needId", "reason", "cancel"],
  "complete-volunteer": ["needId", "signupId", "completed", "reason"],
  "link-post": ["needId", "postId", "postVersion", "linked"]
};
async function needRow(tx: PostTx, id: unknown) {
  const row = await tx.exchangeNeed.findUnique({ where: { id: postId(id) } });
  if (!row || row.recoveryRequired) throw unavailableNeed();
  return row;
}
async function contribution(
  tx: PostTx,
  id: unknown,
  ownerId: string,
  ownOnly = false
) {
  const row = await tx.exchangeNeedContribution.findUnique({
    where: { id: postId(id) }
  });
  if (
    !row ||
    (ownOnly
      ? row.contributorId !== ownerId
      : row.contributorId !== ownerId && row.coordinatorId !== ownerId)
  )
    throw unavailableNeed();
  const need = await needRow(tx, row.needId);
  if (row.coordinatorId === ownerId)
    await requireNeedCoordinator(tx, need, ownerId);
  return { row, need };
}
async function authorized(
  tx: PostTx,
  ownerId: string,
  op: string,
  input: Record<string, unknown>
) {
  await requireContactActor(tx, ownerId);
  if (op === "configure") {
    const result = await managedNeedListing(tx, ownerId, input.listingId);
    if (
      !result.listing.ownerChurchId ||
      !(await exchangeReceiverKey(tx, result.listing, ownerId))
    )
      throw unavailableNeed();
    return;
  }
  if (["claim", "volunteer"].includes(op)) {
    if (!(await needPair(tx, postId(input.needId), ownerId)))
      throw unavailableNeed();
  } else if (
    ["withdraw", "attribution", "dispute", "confirm-return"].includes(op)
  ) {
    await contribution(tx, input.id, ownerId, true);
  } else if (["accept", "decline", "receive", "return-loan"].includes(op)) {
    const { row, need } = await contribution(tx, input.id, ownerId);
    await requireNeedCoordinator(tx, need, ownerId);
    if (!(await currentNeedContribution(tx, row))) throw unavailableNeed();
  } else {
    const need = await needRow(tx, input.needId);
    await requireNeedCoordinator(tx, need, ownerId);
  }
}
export async function needSlotCounts(tx: PostTx, slotId: string) {
  const groups = await tx.exchangeNeedContribution.groupBy({
    by: ["state"],
    where: { slotId },
    _sum: { quantity: true, received: true, returned: true }
  });
  return groups.reduce(
    (v, g) => ({
      committed:
        v.committed +
        (g.state === "COMMITTED"
          ? (g._sum.quantity ?? 0)
          : (g._sum.received ?? 0)),
      received: v.received + (g._sum.received ?? 0),
      returned: v.returned + (g._sum.returned ?? 0)
    }),
    { committed: 0, received: 0, returned: 0 }
  );
}
async function configure(
  tx: PostTx,
  actorId: string,
  input: Record<string, unknown>
) {
  const { listing } = await managedNeedListing(tx, actorId, input.listingId);
  expected(input.listingVersion, listing.version);
  const prior = await tx.exchangeNeed.findUnique({
    where: { listingId: listing.id }
  });
  if (prior?.recoveryRequired)
    throw new PortalError(
      409,
      "This need is quarantined by protected recovery. Keep its retained obligations for a recovery review."
    );
  expected(input.expectedVersion, prior?.version ?? 0);
  if (prior?.closedAt || prior?.canceledAt)
    throw new PortalError(
      409,
      "Repeat this closed need as a new private draft to request more help."
    );
  const deadline = needDeadline(input.deadlineLocal, input.timeZone),
    accepts = needBoolean(input.acceptCoordinator);
  const key = accepts ? await exchangeReceiverKey(tx, listing, actorId) : null;
  if (accepts && !key) throw unavailableNeed();
  if (accepts && !(await communityReportIntakeAvailable(tx, null)))
    throw new PortalError(
      503,
      "Private contributions need an available report reviewer. Keep your entries and try again later."
    );
  const changed =
    prior &&
    (prior.coordinatorId !== (accepts ? actorId : null) ||
      prior.coordinatorKey !== key);
  if (changed) await revokeNeedContributions(tx, { needId: prior.id }, actorId);
  if (
    prior &&
    (await tx.exchangeNeedSlot.findFirst({
      where: { needId: prior.id, loan: true, returnAt: { lte: deadline.at } },
      select: { id: true }
    }))
  )
    throw new PortalError(
      409,
      "The need deadline must precede every equipment return. Review the loan terms first."
    );
  const data = {
    deadlineLocal: deadline.local,
    timeZone: deadline.timeZone,
    deadlineAt: deadline.at,
    deadlineNoticeAt: null,
    coordinatorId: accepts ? actorId : null,
    coordinatorKey: key
  };
  const need = prior
    ? await tx.exchangeNeed.update({
        where: { id: prior.id },
        data: {
          ...data,
          ...(changed ? { consentVersion: { increment: 1 } } : {})
        }
      })
    : await tx.exchangeNeed.create({
        data: {
          id: listing.id,
          listingId: listing.id,
          ...data,
          consentVersion: 1
        }
      });
  await revokeExchangeInquiries(tx, { listingId: listing.id }, actorId);
  const savedListing = await tx.exchangeListing.update({
    where: { id: listing.id },
    data: {
      neededBy: deadline.local.slice(0, 10),
      inquiriesEnabled: false,
      inquiryContactVersion: { increment: 1 },
      version: { increment: 1 },
      visibilityVersion: { increment: 1 },
      ...(!prior ? { state: "DRAFT" } : {})
    }
  });
  await recordDiscoveryControl(
    tx,
    "EXCHANGE_VISIBILITY",
    actorId,
    listing.id,
    savedListing.visibilityVersion
  );
  await recordDiscoveryControl(
    tx,
    "EXCHANGE_CONTACT",
    actorId,
    listing.id,
    savedListing.inquiryContactVersion
  );
  const saved = await recordNeedChange(
    tx,
    need.id,
    actorId,
    prior ? "DEADLINE" : "CONFIGURE"
  );
  return {
    id: saved.id,
    version: saved.version,
    message: prior
      ? "Need deadline and coordinator choice saved."
      : "Structured need saved privately. Add action slots and review before publishing."
  };
}

export async function exchangeNeedCommand(
  db: PrismaClient,
  token: unknown,
  input: Record<string, unknown>
) {
  const op = input.operation;
  if (typeof op !== "string" || !Object.hasOwn(specifics, op))
    throw new PortalError(400, "Choose a supported need action.");
  socialInput(input, [
    "operation",
    "mutationId",
    "expectedVersion",
    ...specifics[op]
  ]);
  // Commit permission expiry before an expected-version error, just as the
  // canonical handoff flow does. Own withdrawals do not disclose the source.
  await withOwnedSession(
    db,
    token,
    async (tx, session) => {
      await authorized(tx, session.userId, op, input);
      const id = input.needId ?? (op === "configure" ? input.listingId : null);
      if (id) await settleNeedContributions(tx, postId(id));
      else if (input.id) {
        const row = await tx.exchangeNeedContribution.findUnique({
          where: { id: postId(input.id) }
        });
        if (
          row &&
          activeNeedStates.includes(row.state) &&
          !(await currentNeedContribution(tx, row))
        )
          await endNeedContribution(tx, row, "REVOKED", session.userId);
      }
    },
    true
  );
  return socialCommand(
    db,
    token,
    "exchange-need",
    input,
    async (tx, actorId) => {
      if (op === "configure") return configure(tx, actorId, input);
      if (["claim", "volunteer"].includes(op)) {
        const source = await needPair(tx, postId(input.needId), actorId);
        if (!source) throw unavailableNeed();
        const { need, context } = source;
        requireNeedOpen(need);
        const slot = await tx.exchangeNeedSlot.findFirst({
          where: { id: postId(input.slotId), needId: need.id, closedAt: null }
        });
        if (!slot)
          throw new PortalError(
            409,
            "This action slot is closed or unavailable."
          );
        expected(input.slotVersion, slot.version);
        if (op === "volunteer") {
          if (slot.action !== "VOLUNTEER" || !slot.volunteerSlotId)
            throw new PortalError(400, "Choose a volunteer role.");
          const role = await tx.postVolunteerSlot.findUniqueOrThrow({
            where: { id: slot.volunteerSlotId }
          });
          expected(input.expectedVersion, need.consentVersion);
          return participationCommandIn(tx, context, {
            operation: "volunteer",
            postId: role.postId,
            slotId: role.id,
            slotVersion: role.version,
            expectedVersion: input.signupVersion
          });
        }
        if (slot.action === "VOLUNTEER")
          throw new PortalError(
            400,
            "Use the existing event role to reserve a volunteer place."
          );
        expected(input.expectedVersion, 0);
        expected(input.consentVersion, need.consentVersion);
        const quantity = needQuantity(input.quantity),
          shareName = needBoolean(input.shareName),
          waitlist = needBoolean(input.waitlist);
        if (needBoolean(input.loanAccepted) !== slot.loan)
          throw new PortalError(
            400,
            "Review and explicitly accept the equipment return responsibility."
          );
        const quote =
          slot.action === "SELL"
            ? needQuote(input.price, input.currency)
            : { quoteMinor: null, quoteCurrency: null };
        if (
          slot.action !== "SELL" &&
          (input.price !== null || input.currency !== null)
        )
          throw new PortalError(400, "Only Sell to us accepts a paid quote.");
        if (waitlist && slot.action === "SELL")
          throw new PortalError(
            400,
            "Submit a quote without reserving quantity. A coordinator must accept it."
          );
        const totals = await needSlotCounts(tx, slot.id);
        if (waitlist && totals.committed < slot.target)
          throw new PortalError(
            409,
            "This slot has room. Choose a commitment instead of joining its waitlist."
          );
        if (
          !waitlist &&
          slot.action !== "SELL" &&
          quantity > slot.target - totals.committed
        )
          throw new PortalError(
            409,
            "That quantity is no longer available. Refresh the remaining amount. A full slot offers a separate waitlist choice."
          );
        if (quantity > slot.target)
          throw new PortalError(
            400,
            "The quantity cannot exceed this slot's target."
          );
        if (
          (await tx.exchangeNeedContribution.count({
            where: { needId: need.id }
          })) >= 1000
        )
          throw new PortalError(
            429,
            "This need requires a contribution storage review before more entries can be added."
          );
        if (
          await tx.exchangeNeedContribution.findFirst({
            where: {
              slotId: slot.id,
              contributorId: actorId,
              state: { in: activeNeedStates }
            },
            select: { id: true }
          })
        )
          throw new PortalError(
            409,
            "You already have an active entry for this slot. Withdraw it before making a new promise or quote."
          );
        const row = await tx.exchangeNeedContribution.create({
          data: {
            id: postId(input.id),
            needId: need.id,
            slotId: slot.id,
            contributorId: actorId,
            coordinatorId: need.coordinatorId,
            authorityKey: source.authorityKey,
            consentVersion: need.consentVersion,
            state: waitlist
              ? "WAITLISTED"
              : slot.action === "SELL"
                ? "QUOTED"
                : "COMMITTED",
            quantity,
            note: postField(input.note, 2000, slot.action === "SELL" ? 3 : 0),
            ...quote,
            shareName,
            loanReturnAt: slot.returnAt,
            loanResponsibility: slot.returnResponsibility
          }
        });
        await recordNeedChange(tx, need.id, actorId, row.state, {
          targetId: row.id,
          quantity
        });
        return {
          id: row.id,
          version: row.version,
          message: waitlist
            ? "Waitlist entry saved. No quantity is reserved and no automatic promotion will occur."
            : slot.action === "SELL"
              ? "Private quote saved. No quantity is reserved until the coordinator accepts."
              : "Your quantity is committed. Receipt remains unconfirmed."
        };
      }
      if (
        [
          "withdraw",
          "decline",
          "accept",
          "receive",
          "return-loan",
          "attribution",
          "dispute",
          "confirm-return"
        ].includes(op)
      ) {
        const { row, need } = await contribution(
          tx,
          input.id,
          actorId,
          ["withdraw", "attribution", "dispute", "confirm-return"].includes(op)
        );
        expected(input.expectedVersion, row.version);
        if (op === "confirm-return") {
          const quantity = needQuantity(input.quantity, true);
          if (
            !row.loanReturnAt ||
            quantity < row.returned ||
            quantity > row.received
          )
            throw new PortalError(
              409,
              "Confirm only the equipment actually returned to you, within the recorded loan receipt. Ask the coordinator to correct a mistaken earlier return."
            );
          const saved = await tx.exchangeNeedContribution.update({
            where: { id: row.id },
            data: { returned: quantity, version: { increment: 1 } }
          });
          await recordNeedChange(tx, need.id, actorId, "LENDER_RETURN", {
            targetId: row.id,
            previousQuantity: row.returned,
            quantity
          });
          return {
            id: row.id,
            version: saved.version,
            message:
              "Your received equipment return is confirmed. No withdrawn source details are revealed."
          };
        }
        if (op === "withdraw" || op === "decline") {
          if (op === "decline" && row.state === "COMMITTED")
            throw new PortalError(
              409,
              "Received help is not a declined proposal. Close the need or let the contributor withdraw its unreceived portion."
            );
          const saved = await endNeedContribution(
            tx,
            row,
            op === "withdraw" ? "CANCELED" : "DECLINED",
            actorId
          );
          return {
            id: saved.id,
            version: saved.version,
            message:
              "The remaining promise is released. Recorded receipt and outstanding equipment returns are preserved."
          };
        }
        if (op === "attribution" || op === "dispute") {
          if (!(await currentNeedContribution(tx, row)))
            throw unavailableNeed();
          const saved = await tx.exchangeNeedContribution.update({
            where: { id: row.id },
            data: {
              ...(op === "attribution"
                ? { shareName: needBoolean(input.shareName) }
                : {
                    disputedAt: new Date(),
                    disputeNote: postField(input.note, 500, 3)
                  }),
              version: { increment: 1 }
            }
          });
          await recordNeedChange(tx, need.id, actorId, op.toUpperCase(), {
            targetId: row.id
          });
          return {
            id: saved.id,
            version: saved.version,
            message:
              op === "attribution"
                ? "Your contributor-name choice is saved."
                : "Your private dispute flag is saved. Use Report to submit selected evidence for review."
          };
        }
        const current = await currentNeedContribution(tx, row);
        if (!current) throw unavailableNeed();
        await requireNeedCoordinator(tx, need, actorId);
        const slot = await tx.exchangeNeedSlot.findUniqueOrThrow({
          where: { id: row.slotId }
        });
        let data;
        let change: {
          previousQuantity?: number;
          quantity?: number;
          text?: string;
        } = {};
        if (op === "accept") {
          requireNeedOpen(current.need);
          if (row.state !== "QUOTED" || slot.action !== "SELL" || slot.closedAt)
            throw new PortalError(
              409,
              "Only a current paid quote for an open slot can be accepted."
            );
          if (
            row.quantity >
            slot.target - (await needSlotCounts(tx, slot.id)).committed
          )
            throw new PortalError(
              409,
              "This quote exceeds the remaining quantity. No quantity was reserved."
            );
          data = { state: "COMMITTED" };
        } else {
          const quantity = needQuantity(input.quantity, true),
            returning = op === "return-loan";
          const before = returning ? row.returned : row.received;
          const limit = returning
            ? row.received
            : row.state === "COMMITTED"
              ? row.quantity
              : row.received;
          const reason = postField(
            input.reason,
            500,
            quantity < before ? 3 : 0
          );
          if (returning && !row.loanReturnAt)
            throw new PortalError(
              400,
              "This contribution is not an equipment loan."
            );
          if (quantity > limit || (!returning && quantity < row.returned))
            throw new PortalError(
              409,
              "The recorded amount must fit the retained commitment, receipts and equipment returns."
            );
          data = returning ? { returned: quantity } : { received: quantity };
          change = { previousQuantity: before, quantity, text: reason };
        }
        const saved = await tx.exchangeNeedContribution.update({
          where: { id: row.id },
          data: { ...data, version: { increment: 1 } }
        });
        await recordNeedChange(tx, need.id, actorId, op.toUpperCase(), {
          targetId: row.id,
          ...change
        });
        return {
          id: saved.id,
          version: saved.version,
          message:
            op === "accept"
              ? "Quote accepted and quantity reserved. No payment or receipt is recorded."
              : op === "return-loan"
                ? "Actual equipment return saved."
                : "Actual receipt saved separately from the promise."
        };
      }
      const need = await needRow(tx, input.needId);
      await requireNeedCoordinator(tx, need, actorId);
      if (op === "slot") {
        const id = postId(input.slotId),
          prior = await tx.exchangeNeedSlot.findUnique({ where: { id } });
        if (prior && prior.needId !== need.id) throw unavailableNeed();
        expected(input.expectedVersion, prior?.version ?? 0);
        if (need.closedAt || need.canceledAt)
          throw new PortalError(
            409,
            "Repeat a closed need as a new private draft."
          );
        const fields = parseNeedSlot(
          input.schema,
          input.fields,
          need.deadlineAt
        );
        if (prior) {
          const hasEntries =
            !!(await tx.exchangeNeedContribution.findFirst({
              where: { slotId: id },
              select: { id: true }
            })) || !!prior.volunteerSlotId;
          if (
            hasEntries &&
            (
              [
                "action",
                "unit",
                "loan",
                "volunteerSlotId",
                "returnLocal",
                "returnTimeZone",
                "returnResponsibility",
                "label"
              ] as const
            ).some((k) => prior[k] !== fields[k])
          )
            throw new PortalError(
              409,
              "This slot has participation or a linked event role. Keep its action and terms, or add a new slot."
            );
          if (fields.target < (await needSlotCounts(tx, id)).committed)
            throw new PortalError(
              409,
              "The target cannot fall below receipts and outstanding promises."
            );
        } else if (
          (await tx.exchangeNeedSlot.count({ where: { needId: need.id } })) >=
          NEED_SLOT_LIMIT
        )
          throw new PortalError(
            409,
            "Use up to twelve action slots on one need."
          );
        if (fields.volunteerSlotId) {
          const role = await tx.postVolunteerSlot.findUnique({
            where: { id: fields.volunteerSlotId }
          });
          if (!role || role.closedAt)
            throw new PortalError(409, "Choose an open event volunteer role.");
          const context = await postContext(tx, actorId),
            post = await participationPost(tx, context, role.postId);
          const { listing } = await managedNeedListing(
            tx,
            actorId,
            need.listingId
          );
          if (
            post.authorChurchId !== listing.ownerChurchId ||
            !canOrganize(context, post) ||
            !participationActive(post)
          )
            throw new PortalError(
              403,
              "Link a current event role for this church using your separate volunteer organizer duty."
            );
          if (fields.target !== role.capacity || fields.unit !== "places")
            throw new PortalError(
              400,
              "Volunteer targets use the canonical event role capacity and the unit places."
            );
          const linked = await tx.exchangeNeedSlot.findUnique({
            where: { volunteerSlotId: role.id }
          });
          if (linked && linked.id !== id)
            throw new PortalError(
              409,
              "This volunteer role is already linked to a need. It cannot hold a second pool of places."
            );
        }
        const saved = prior
          ? await tx.exchangeNeedSlot.update({
              where: { id },
              data: { ...fields, version: { increment: 1 } }
            })
          : await tx.exchangeNeedSlot.create({
              data: { id, needId: need.id, ...fields }
            });
        await recordNeedChange(tx, need.id, actorId, "SLOT", { targetId: id });
        return {
          id,
          version: saved.version,
          message:
            "Need action slot saved. Existing contributions are preserved."
        };
      }
      if (op === "close-slot") {
        const slot = await tx.exchangeNeedSlot.findFirst({
          where: { id: postId(input.slotId), needId: need.id }
        });
        if (!slot) throw unavailableNeed();
        expected(input.expectedVersion, slot.version);
        const saved = await tx.exchangeNeedSlot.update({
          where: { id: slot.id },
          data: {
            closedAt: new Date(),
            closeReason: postField(input.reason, 500, 3),
            version: { increment: 1 }
          }
        });
        await recordNeedChange(tx, need.id, actorId, "SLOT_CLOSED", {
          targetId: slot.id,
          text: saved.closeReason
        });
        return {
          id: saved.id,
          version: saved.version,
          message:
            "Slot closed with its unmet quantity preserved. Outstanding promises and equipment returns remain visible."
        };
      }
      if (op === "complete-volunteer") {
        const signup = await tx.postVolunteerSignup.findUnique({
          where: { id: postId(input.signupId) },
          include: { slot: { include: { exchangeNeedSlot: true } } }
        });
        if (!signup || signup.slot.exchangeNeedSlot?.needId !== need.id)
          throw unavailableNeed();
        const context = await postContext(tx, actorId);
        const result = await participationCommandIn(tx, context, {
          operation: "complete-volunteer",
          postId: signup.slot.postId,
          signupId: signup.id,
          expectedVersion: input.expectedVersion,
          completed: input.completed,
          reason: input.reason
        });
        return result;
      }
      if (op === "link-post") {
        expected(input.expectedVersion, need.version);
        const context = await postContext(tx, actorId),
          post = await participationPost(tx, context, input.postId);
        const { listing } = await managedNeedListing(
          tx,
          actorId,
          need.listingId
        );
        if (
          post.type !== "NEED" ||
          post.authorChurchId !== listing.ownerChurchId ||
          !context.publishers.has(listing.ownerChurchId!)
        )
          throw new PortalError(
            403,
            "An authorized publisher may link only this church's Need post."
          );
        expected(input.postVersion, post.version);
        const linked = needBoolean(input.linked);
        if (post.exchangeNeedId && post.exchangeNeedId !== need.id)
          throw new PortalError(
            409,
            "This post already links another need. Remove that link first."
          );
        await tx.platformPost.update({
          where: { id: post.id },
          data: {
            exchangeNeedId: linked ? need.id : null,
            version: { increment: 1 }
          }
        });
        const saved = await recordNeedChange(
          tx,
          need.id,
          actorId,
          linked ? "LINK_POST" : "UNLINK_POST",
          { targetId: post.id }
        );
        return {
          id: need.id,
          version: saved.version,
          message: linked
            ? "Church Need post linked to the canonical need."
            : "Need link removed from the post."
        };
      }
      expected(input.expectedVersion, need.version);
      if (op === "update") {
        if (need.canceledAt)
          throw new PortalError(
            409,
            "This canceled need cannot publish further updates."
          );
        const saved = await recordNeedChange(tx, need.id, actorId, "UPDATE", {
          text: postField(input.text, 2000, 3)
        });
        return {
          id: need.id,
          version: saved.version,
          message: "Organizer update saved."
        };
      }
      const cancel = needBoolean(input.cancel),
        reason = postField(input.reason, 500, 3);
      await tx.exchangeNeed.update({
        where: { id: need.id },
        data: {
          closedAt: new Date(),
          ...(cancel ? { canceledAt: new Date() } : {}),
          closeReason: reason
        }
      });
      if (cancel) {
        const rows = await tx.exchangeNeedContribution.findMany({
          where: { needId: need.id, state: { in: activeNeedStates } },
          take: 1001
        });
        if (rows.length > 1000)
          throw new PortalError(
            409,
            "This need requires a size review before cancellation."
          );
        for (const row of rows)
          await endNeedContribution(tx, row, "CANCELED", actorId);
      }
      const saved = await recordNeedChange(
        tx,
        need.id,
        actorId,
        cancel ? "CANCELED_NEED" : "CLOSED_NEED",
        { text: reason }
      );
      return {
        id: need.id,
        version: saved.version,
        message: cancel
          ? "Need canceled. Unreceived promises are released. Receipt and equipment return history is preserved."
          : "Need closed with truthful received and unmet quantities. Existing promises may still be received or withdrawn."
      };
    },
    (tx, ownerId) => authorized(tx, ownerId, op, input)
  );
}
