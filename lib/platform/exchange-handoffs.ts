import type { ExchangeInquiry, PrismaClient } from "@prisma/client";
import { withOwnedSession } from "./account-sessions";
import { withAccountRead } from "./account-read";
import { accountConfig } from "./account-config";
import { activityBudget } from "./account-limits";
import { requireContactActor } from "./adult-contact-policy";
import { communityReportIntakeAvailable } from "./community-reports";
import { postContext, type PostTx } from "./post-access";
import { postId, postField } from "./post-input";
import { expected, PortalError } from "./portal-policy";
import { socialCommand, socialInput } from "./social-operations";
import {
  exchangeAuthority,
  exchangeCanManage,
  requireExchangeActor
} from "./exchange-policy";
import {
  privilegedMode,
  requirePrivilegedAuthentication
} from "./privileged-auth-policy";
import { recordDiscoveryControl } from "./retention-controls";
import {
  parseExchangeHandoffPlan,
  parseExchangeCancellation
} from "./exchange-handoff-input";
import {
  activeExchangeInquiry,
  heldExchangeInquiry,
  currentExchangeInquiry,
  exchangeInquiryReadSources,
  exchangeInquirySource,
  exchangeReceiverKey,
  exchangeInquiryParticipant,
  exchangeInquiryCleared
} from "./exchange-handoff-policy";
import {
  clearExchangeInquiry,
  endExchangeInquiry,
  recordExchangeInquiry,
  revokeExchangeInquiries,
  settleExchangeInquiry
} from "./exchange-handoff-lifecycle";
import {
  EXCHANGE_CONFIRM_HOURS,
  EXCHANGE_INQUIRY_DAYS,
  EXCHANGE_RECOVERY_HOURS,
  EXCHANGE_INQUIRY_PAGE
} from "./exchange-handoff-options";

const HOUR = 3600000,
  DAY = 24 * HOUR;
const unavailable = () =>
  new PortalError(404, "This inquiry is unavailable to your current account.");
const receipt = (row: ExchangeInquiry, message: string) => ({
  id: row.id,
  version: row.version,
  message
});
async function available(tx: PostTx) {
  if (!(await communityReportIntakeAvailable(tx, null)))
    throw new PortalError(
      503,
      "Private inquiries need an available report reviewer. Keep your unsent entries and try again later."
    );
}
// An expired operator proof blocks that adult's church duty; it must never
// revoke the pair's consent or change another participant's agreed handoff.
async function requireReceiverSession(
  tx: PostTx,
  rows: ExchangeInquiry[],
  ownerId: string
) {
  if (privilegedMode() !== "enforce") return;
  const listingIds = rows.flatMap((row) =>
    row.receiverId === ownerId && row.listingId ? [row.listingId] : []
  );
  if (
    listingIds.length &&
    (await tx.exchangeListing.findFirst({
      where: { id: { in: listingIds }, ownerChurchId: { not: null } },
      select: { id: true }
    }))
  )
    await requirePrivilegedAuthentication(tx, ownerId);
}
async function owned(tx: PostTx, id: unknown, ownerId: string) {
  const row = await tx.exchangeInquiry.findUnique({
    where: { id: postId(id) }
  });
  if (
    !row ||
    !exchangeInquiryParticipant(row, ownerId) ||
    row.recoveryRequired ||
    exchangeInquiryCleared(row, ownerId)
  )
    throw unavailable();
  await requireReceiverSession(tx, [row], ownerId);
  return row;
}
async function manager(tx: PostTx, id: unknown, ownerId: string) {
  const context = await postContext(tx, ownerId);
  requireExchangeActor(context);
  const listing = await tx.exchangeListing.findUnique({
    where: { id: postId(id) }
  });
  if (
    !listing ||
    !exchangeCanManage(context, await exchangeAuthority(tx, context), listing)
  )
    throw new PortalError(
      404,
      "This listing is unavailable to your current account or church duties."
    );
  if (listing.ownerChurchId) await requirePrivilegedAuthentication(tx, ownerId);
  return listing;
}

export async function exchangeHandoffCommand(
  db: PrismaClient,
  token: unknown,
  input: Record<string, unknown>
) {
  const op = input.operation;
  const common = ["operation", "mutationId", "expectedVersion"];
  const specific: Record<string, string[]> = {
    contact: ["listingId", "listingVersion", "enabled"],
    inquire: ["id", "listingId", "listingVersion", "contactVersion", "purpose"],
    select: ["id", "schema", "plan"],
    plan: ["id", "schema", "plan"],
    confirm: ["id", "planVersion"],
    decline: ["id"],
    withdraw: ["id"],
    complete: ["id"],
    cancel: ["id", "reason", "note"],
    clear: ["id"]
  };
  if (typeof op !== "string" || !Object.hasOwn(specific, op))
    throw new PortalError(400, "Choose a supported inquiry or handoff action.");
  socialInput(input, [...common, ...specific[op]]);

  // Expiry/revocation settlement commits before a stale-input conflict. Otherwise
  // throwing for the original command would roll the cleanup back indefinitely.
  await withOwnedSession(
    db,
    token,
    async (tx, session) => {
      await requireContactActor(tx, session.userId);
      if (op === "contact") {
        await manager(tx, input.listingId, session.userId);
        return;
      }
      let listingId: string | null;
      if (op === "inquire") {
        listingId = postId(input.listingId);
        if (!(await exchangeInquirySource(tx, listingId, session.userId)))
          throw unavailable();
        const prior = await tx.exchangeInquiry.findFirst({
          where: {
            listingId,
            requesterId: session.userId,
            state: { in: ["INQUIRED", "SELECTED", "RESERVED"] }
          }
        });
        if (prior) await settleExchangeInquiry(tx, prior);
      } else {
        const row =
          op === "clear"
            ? await tx.exchangeInquiry.findFirst({
                where: {
                  id: postId(input.id),
                  OR: [
                    { requesterId: session.userId },
                    { receiverId: session.userId }
                  ],
                  recoveryRequired: false
                }
              })
            : await owned(tx, input.id, session.userId);
        if (!row) throw unavailable();
        await requireReceiverSession(tx, [row], session.userId);
        listingId = row.listingId;
        await settleExchangeInquiry(tx, row);
      }
      if (listingId) {
        const held = await tx.exchangeInquiry.findFirst({
          where: { listingId, state: { in: ["SELECTED", "RESERVED"] } }
        });
        if (held) await settleExchangeInquiry(tx, held);
      }
    },
    true
  );

  return socialCommand(
    db,
    token,
    "exchange-handoff",
    input,
    async (tx, ownerId) => {
      const now = new Date();
      if (op === "contact") {
        const listing = await manager(tx, input.listingId, ownerId);
        expected(input.expectedVersion, listing.inquiryContactVersion);
        expected(input.listingVersion, listing.version);
        if (typeof input.enabled !== "boolean")
          throw new PortalError(
            400,
            "Choose whether this listing accepts inquiries."
          );
        let key: string | null = null;
        if (input.enabled) {
          await available(tx);
          if (
            listing.state !== "ACTIVE" ||
            listing.recoveryRequired ||
            listing.moderationState !== "VISIBLE"
          )
            throw new PortalError(
              409,
              "Publish an available listing before enabling its inquiries."
            );
          key = await exchangeReceiverKey(tx, listing, ownerId);
          if (!key)
            throw new PortalError(
              403,
              "Only the personal owner or a current church Exchange manager may volunteer to receive these inquiries."
            );
        }
        await revokeExchangeInquiries(tx, { listingId: listing.id }, ownerId);
        const saved = await tx.exchangeListing.update({
          where: { id: listing.id },
          data: {
            inquiriesEnabled: input.enabled,
            inquiryReceiverId: input.enabled ? ownerId : null,
            inquiryAuthorityKey: key,
            inquiryContactVersion: { increment: 1 },
            version: { increment: 1 }
          }
        });
        await recordDiscoveryControl(
          tx,
          "EXCHANGE_CONTACT",
          ownerId,
          saved.id,
          saved.inquiryContactVersion
        );
        return {
          id: saved.id,
          version: saved.inquiryContactVersion,
          message: input.enabled
            ? "You are the receiving adult for this listing. Your current contact choices still govern new inquiries."
            : "New inquiries are off and active handoffs have ended. Review the listing before reopening it."
        };
      }
      if (op === "inquire") {
        expected(input.expectedVersion, 0);
        const id = postId(input.id),
          listingId = postId(input.listingId);
        if (
          await tx.exchangeInquiry.findUnique({
            where: { id },
            select: { id: true }
          })
        )
          throw new PortalError(
            409,
            "This inquiry reference is already used or retired. Refresh before creating a new inquiry."
          );
        const source = await exchangeInquirySource(tx, listingId, ownerId);
        if (!source || source.listing.state !== "ACTIVE") throw unavailable();
        expected(input.listingVersion, source.listing.version);
        expected(input.contactVersion, source.listing.inquiryContactVersion);
        await available(tx);
        const purpose = postField(input.purpose, 1000, 1);
        if (
          await tx.exchangeInquiry.findFirst({
            where: {
              listingId,
              requesterId: ownerId,
              OR: [
                { state: { in: ["INQUIRED", "SELECTED", "RESERVED"] } },
                {
                  state: "DECLINED",
                  endedAt: { gt: new Date(now.getTime() - 7 * DAY) }
                }
              ]
            },
            select: { id: true }
          })
        )
          throw new PortalError(
            409,
            "You already have an active inquiry, or this listing's seven-day decline cooldown has not ended."
          );
        const live = {
          state: {
            in: ["INQUIRED", "SELECTED", "RESERVED"] as Array<
              "INQUIRED" | "SELECTED" | "RESERVED"
            >
          },
          expiresAt: { gt: now }
        };
        if (
          (await tx.exchangeInquiry.count({
            where: { requesterId: ownerId, ...live }
          })) >= 20 ||
          (await tx.exchangeInquiry.count({
            where: { receiverId: source.receiver.id, ...live }
          })) >= 200 ||
          (await tx.exchangeInquiry.count({ where: { listingId, ...live } })) >=
            100
        )
          throw new PortalError(
            429,
            "A new inquiry is unavailable right now. Review your existing handoffs or try again later."
          );
        if (
          (await tx.exchangeInquiry.count({
            where: {
              OR: [{ requesterId: ownerId }, { receiverId: source.receiver.id }]
            }
          })) >= 10000
        )
          throw new PortalError(
            429,
            "This inquiry history needs a storage review before adding another."
          );
        for (const [name, maximum, seconds] of [
          ["short", 5, 600],
          ["daily", 20, 86400]
        ] as const) {
          const retry = await activityBudget(
            tx,
            accountConfig().rateSecret,
            ownerId,
            `exchange-inquiry-${name}`,
            maximum,
            seconds
          );
          if (retry)
            throw new PortalError(
              429,
              "You have reached the inquiry limit. Keep your unsent entries and try again later.",
              retry
            );
        }
        const expiresAt = new Date(now.getTime() + EXCHANGE_INQUIRY_DAYS * DAY);
        const saved = await tx.exchangeInquiry.create({
          data: {
            id,
            listingId,
            requesterId: ownerId,
            receiverId: source.receiver.id,
            contactVersion: source.listing.inquiryContactVersion,
            authorityKey: source.authorityKey,
            listingVersion: source.listing.version,
            purpose,
            expiresAt,
            wakeAt: expiresAt
          }
        });
        await recordExchangeInquiry(tx, saved, ownerId, "INQUIRE");
        return receipt(
          saved,
          "Private inquiry sent. No pickup or general conversation access has been granted."
        );
      }
      const row = await owned(tx, input.id, ownerId);
      expected(input.expectedVersion, row.version);
      if (op === "clear") {
        if (activeExchangeInquiry(row.state))
          throw new PortalError(
            409,
            "End this inquiry before clearing your history."
          );
        return receipt(
          await clearExchangeInquiry(tx, row, ownerId, now),
          "Cleared for your account. The other participant's receipt and deliberately selected report evidence are unchanged."
        );
      }
      if (!activeExchangeInquiry(row.state))
        throw new PortalError(
          409,
          "This inquiry has ended. Refresh its current receipt."
        );
      const source = await currentExchangeInquiry(tx, row, now);
      if (!source) throw unavailable();
      if (op === "decline" || op === "withdraw") {
        if (
          row.state !== "INQUIRED" ||
          (op === "decline" ? row.receiverId : row.requesterId) !== ownerId
        )
          throw new PortalError(
            409,
            "This inquiry cannot be changed with that action."
          );
        return receipt(
          await endExchangeInquiry(
            tx,
            row,
            op === "decline" ? "DECLINED" : "WITHDRAWN",
            ownerId,
            now
          ),
          op === "decline" ? "Inquiry declined." : "Inquiry withdrawn."
        );
      }
      if (op === "select" || op === "plan") {
        if (
          row.receiverId !== ownerId ||
          row.state !== (op === "select" ? "INQUIRED" : "SELECTED")
        )
          throw new PortalError(
            409,
            "Only the receiving adult may choose an inquirer or replace an unconfirmed pickup plan."
          );
        await available(tx);
        const plan = parseExchangeHandoffPlan(input.schema, input.plan, now);
        if (op === "select") {
          if (
            source.listing.state !== "ACTIVE" ||
            (await tx.exchangeInquiry.findFirst({
              where: {
                listingId: row.listingId,
                state: { in: ["SELECTED", "RESERVED"] }
              },
              select: { id: true }
            }))
          )
            throw new PortalError(
              409,
              "This listing already has a hold or is no longer available. Refresh before choosing someone."
            );
          const listing = await tx.exchangeListing.update({
            where: { id: source.listing.id },
            data: {
              state: "RESERVED",
              version: { increment: 1 },
              visibilityVersion: { increment: 1 }
            }
          });
          await tx.exchangeListingAudit.create({
            data: {
              listingId: listing.id,
              actorId: ownerId,
              action: "HANDOFF_SELECTED",
              version: listing.version
            }
          });
          await recordDiscoveryControl(
            tx,
            "EXCHANGE_VISIBILITY",
            ownerId,
            listing.id,
            listing.visibilityVersion
          );
        }
        const expiresAt = new Date(
          Math.min(
            now.getTime() + EXCHANGE_CONFIRM_HOURS * HOUR,
            plan.endAt.getTime()
          )
        );
        const saved = await tx.exchangeInquiry.update({
          where: { id: row.id },
          data: {
            state: "SELECTED",
            version: { increment: 1 },
            planVersion: { increment: 1 },
            selectedAt: now,
            windowStart: plan.startAt,
            windowEnd: plan.endAt,
            timeZone: plan.timeZone,
            pickupDetails: plan.pickupDetails,
            expiresAt,
            wakeAt: expiresAt,
            dispatchedAt: null,
            dispatchClaimedAt: null
          }
        });
        await recordExchangeInquiry(tx, saved, ownerId, op.toUpperCase());
        return receipt(
          saved,
          "Pickup window proposed. The inquirer must confirm this plan before private instructions are shared."
        );
      }
      if (op === "confirm") {
        if (
          row.requesterId !== ownerId ||
          row.state !== "SELECTED" ||
          !row.windowEnd ||
          row.windowEnd <= now
        )
          throw new PortalError(
            409,
            "This pickup plan is no longer available for confirmation."
          );
        expected(input.planVersion, row.planVersion);
        const expiresAt = new Date(
          row.windowEnd.getTime() + EXCHANGE_RECOVERY_HOURS * HOUR
        );
        const reminderAt = new Date(
          Math.max(now.getTime(), row.windowStart!.getTime() - 24 * HOUR)
        );
        const saved = await tx.exchangeInquiry.update({
          where: { id: row.id },
          data: {
            state: "RESERVED",
            confirmedAt: now,
            version: { increment: 1 },
            expiresAt,
            wakeAt: reminderAt,
            dispatchedAt: null,
            dispatchClaimedAt: null
          }
        });
        await recordExchangeInquiry(tx, saved, ownerId, "CONFIRM");
        return receipt(
          saved,
          "Pickup agreed. Private instructions are available to the two current participants."
        );
      }
      if (
        !heldExchangeInquiry(row.state) ||
        (op === "complete" && row.state !== "RESERVED")
      )
        throw new PortalError(
          409,
          "Agree to a handoff before recording its completion, or withdraw an unselected inquiry."
        );
      const cancellation =
        op === "cancel"
          ? parseExchangeCancellation(input.reason, input.note)
          : undefined;
      if (
        cancellation?.reason === "NO_SHOW" &&
        (row.state !== "RESERVED" || !row.windowEnd || row.windowEnd > now)
      )
        throw new PortalError(
          409,
          "A missed handoff can be recorded after the agreed pickup window ends."
        );
      const saved = await endExchangeInquiry(
        tx,
        row,
        op === "complete" ? "COMPLETED" : "CANCELED",
        ownerId,
        now,
        cancellation
      );
      return receipt(
        saved,
        op === "complete"
          ? "You marked this handoff complete. The listing is closed."
          : "Handoff canceled. The listing stays closed until its owner deliberately reopens it."
      );
    },
    async (tx, ownerId) => {
      await requireContactActor(tx, ownerId);
      if (op === "contact") await manager(tx, input.listingId, ownerId);
      else if (op === "inquire") {
        if (
          !(await exchangeInquirySource(tx, postId(input.listingId), ownerId))
        )
          throw unavailable();
      } else {
        const row = await tx.exchangeInquiry.findUnique({
          where: { id: postId(input.id) }
        });
        if (
          !row ||
          !exchangeInquiryParticipant(row, ownerId) ||
          row.recoveryRequired
        )
          throw unavailable();
        await requireReceiverSession(tx, [row], ownerId);
      }
    }
  );
}

async function projection(
  tx: PostTx,
  row: ExchangeInquiry,
  ownerId: string,
  now: Date
) {
  const source = await currentExchangeInquiry(tx, row, now);
  const expired = activeExchangeInquiry(row.state) && row.expiresAt <= now;
  const state = expired
    ? "EXPIRED"
    : !source && activeExchangeInquiry(row.state)
      ? "REVOKED"
      : row.state;
  const canRead = !!source && !row.bodyPurgedAt;
  return {
    id: row.id,
    version: row.version,
    planVersion: row.planVersion,
    state,
    side:
      row.requesterId === ownerId
        ? ("outgoing" as const)
        : ("incoming" as const),
    listing: source
      ? { id: source.listing.id, title: source.listing.title }
      : null,
    person: canRead
      ? await tx.platformUser.findUnique({
          where: {
            id: (row.requesterId === ownerId
              ? row.receiverId
              : row.requesterId)!
          },
          select: { name: true, username: true }
        })
      : null,
    purpose: canRead ? row.purpose : "",
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    windowStart: canRead ? (row.windowStart?.toISOString() ?? null) : null,
    windowEnd: canRead ? (row.windowEnd?.toISOString() ?? null) : null,
    timeZone: canRead ? row.timeZone : null,
    pickupDetails:
      canRead &&
      (state === "RESERVED" ||
        (state === "SELECTED" && row.receiverId === ownerId))
        ? row.pickupDetails
        : "",
    cancelReason: canRead ? row.cancelReason : null,
    cancelNote: canRead ? row.cancelNote : "",
    available: !!source,
    reportable: !row.bodyPurgedAt && !row.recoveryRequired,
    pickupReportable: state === "RESERVED" && !!source,
    noShowAvailable:
      state === "RESERVED" &&
      !!source &&
      !!row.windowEnd &&
      row.windowEnd <= now,
    history: canRead
      ? (
          await tx.exchangeInquiryAudit.findMany({
            where: { inquiryId: row.id, action: { not: "CLEAR" } },
            orderBy: { version: "desc" },
            take: 20,
            select: { action: true, version: true, createdAt: true }
          })
        )
          .reverse()
          .map((item) => ({
            action: item.action,
            version: item.version,
            at: item.createdAt.toISOString()
          }))
      : [],
    canClear: !activeExchangeInquiry(state),
    completionRecordedBy:
      row.state === "COMPLETED"
        ? (
            await tx.exchangeInquiryAudit.findFirst({
              where: { inquiryId: row.id, action: "COMPLETED" },
              select: { actorId: true }
            })
          )?.actorId === ownerId
          ? "you"
          : "the other participant"
        : null,
    endedAt: row.endedAt?.toISOString() ?? null
  };
}

export function readExchangeHandoffs(
  db: PrismaClient,
  token: unknown,
  query: Record<string, unknown>
) {
  socialInput(query, ["view", "id", "listingId", "after"]);
  return withAccountRead(db, token, async (tx, ownerId) => {
    if (!ownerId)
      throw new PortalError(401, "Sign in to read your Exchange inquiries.");
    await requireContactActor(tx, ownerId);
    const now = new Date();
    if (query.view === "contact") {
      const listing = await manager(tx, query.listingId, ownerId);
      const key = listing.inquiryReceiverId
        ? await exchangeReceiverKey(tx, listing, listing.inquiryReceiverId)
        : null;
      return {
        ownerId,
        contact: {
          listingId: listing.id,
          listingVersion: listing.version,
          version: listing.inquiryContactVersion,
          enabled:
            listing.inquiriesEnabled &&
            !!key &&
            key === listing.inquiryAuthorityKey,
          receiving: listing.inquiryReceiverId === ownerId,
          canEnable:
            listing.state === "ACTIVE" &&
            !!(await exchangeReceiverKey(tx, listing, ownerId))
        },
        intake: await communityReportIntakeAvailable(tx, null)
      };
    }
    if (query.view === "target") {
      const source = await exchangeInquirySource(
        tx,
        postId(query.listingId),
        ownerId
      );
      if (!source) return { ownerId, target: null };
      const prior = await tx.exchangeInquiry.findFirst({
        where: {
          listingId: source.listing.id,
          requesterId: ownerId,
          state: { in: ["INQUIRED", "SELECTED", "RESERVED"] },
          expiresAt: { gt: now }
        },
        select: { id: true }
      });
      return {
        ownerId,
        target: {
          listingId: source.listing.id,
          listingVersion: source.listing.version,
          contactVersion: source.listing.inquiryContactVersion,
          available:
            source.listing.state === "ACTIVE" &&
            (await communityReportIntakeAvailable(tx, null)),
          activeId: prior?.id ?? null,
          receiver: source.receiver
        }
      };
    }
    if (query.view === "detail")
      return {
        ownerId,
        inquiry: await projection(
          tx,
          await owned(tx, query.id, ownerId),
          ownerId,
          now
        )
      };
    if (query.view !== "incoming" && query.view !== "outgoing")
      throw new PortalError(400, "Choose incoming or outgoing inquiries.");
    const where =
      query.view === "incoming"
        ? { receiverId: ownerId, receiverClearedAt: null }
        : { requesterId: ownerId, requesterClearedAt: null };
    const after = query.after
      ? await tx.exchangeInquiry.findFirst({
          where: { id: postId(query.after), ...where },
          select: { id: true, createdAt: true }
        })
      : null;
    if (query.after && !after)
      throw new PortalError(
        409,
        "Your inquiry history changed. Start again from its first page."
      );
    const rows = await tx.exchangeInquiry.findMany({
      where: {
        ...where,
        recoveryRequired: false,
        ...(query.listingId ? { listingId: postId(query.listingId) } : {}),
        ...(after
          ? {
              OR: [
                { createdAt: { lt: after.createdAt } },
                { createdAt: after.createdAt, id: { lt: after.id } }
              ]
            }
          : {})
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: EXCHANGE_INQUIRY_PAGE + 1
    });
    const page = rows.slice(0, EXCHANGE_INQUIRY_PAGE);
    await requireReceiverSession(tx, page, ownerId);
    const { sourceFor, people } = await exchangeInquiryReadSources(tx, page);
    const inquiries = [];
    for (const row of page) {
      const source = await currentExchangeInquiry(tx, row, now, sourceFor);
      const state =
        activeExchangeInquiry(row.state) && row.expiresAt <= now
          ? "EXPIRED"
          : !source && activeExchangeInquiry(row.state)
            ? "REVOKED"
            : row.state;
      const person =
        source && !row.bodyPurgedAt
          ? people.get(
              (row.requesterId === ownerId ? row.receiverId : row.requesterId)!
            )
          : null;
      inquiries.push({
        id: row.id,
        version: row.version,
        state,
        side:
          row.requesterId === ownerId
            ? ("outgoing" as const)
            : ("incoming" as const),
        listing: source
          ? { id: source.listing.id, title: source.listing.title }
          : null,
        person: person
          ? { name: person.name, username: person.username }
          : null,
        createdAt: row.createdAt.toISOString()
      });
    }
    return {
      ownerId,
      inquiries,
      after:
        rows.length > EXCHANGE_INQUIRY_PAGE
          ? rows[EXCHANGE_INQUIRY_PAGE - 1].id
          : null
    };
  });
}
export type ExchangeHandoffView = Awaited<
  ReturnType<typeof readExchangeHandoffs>
>;
