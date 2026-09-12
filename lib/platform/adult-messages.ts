import {
  Prisma,
  type PrismaClient,
  type AdultConversation
} from "@prisma/client";
import { withAccountRead } from "./account-read";
import { accountConfig } from "./account-config";
import { activityBudget } from "./account-limits";
import { requireContactActor } from "./adult-contact-policy";
import {
  adultMemberWhere,
  adultOtherId,
  adultMessageCursor,
  ownedAdultConversation,
  defaultConversationChoice
} from "./adult-message-policy";
import type {
  AdultMessageItem,
  AdultMessageView,
  AdultConversationChoice,
  AdultConversationSummary
} from "./adult-message-types";
import { communityReportIntakeAvailable } from "./community-reports";
import { eligibleWhere, expected, PortalError } from "./portal-policy";
import { postField, postId } from "./post-input";
import { socialCommand, socialInput } from "./social-operations";
type Tx = Prisma.TransactionClient;
const PAGE = 50,
  INBOX = 30;
const messageSelect = {
  id: true,
  senderId: true,
  sequence: true,
  content: true,
  createdAt: true
} satisfies Prisma.AdultMessageSelect;
type MessageRow = Prisma.AdultMessageGetPayload<{
  select: typeof messageSelect;
}>;
const item = (row: MessageRow, ownerId: string): AdultMessageItem => ({
  id: row.id,
  sequence: row.sequence,
  content: row.content,
  mine: row.senderId === ownerId,
  createdAt: row.createdAt.toISOString()
});
const blockWhere = (ownerId: string, others: string[]) => ({
  blocked: true,
  OR: [
    { ownerId, targetUserId: { in: others } },
    { targetUserId: ownerId, ownerId: { in: others } }
  ]
});
async function stateIn(
  tx: Tx,
  conversationId: string,
  ownerId: string
): Promise<AdultConversationChoice> {
  const row = await tx.adultConversationState.findUnique({
    where: { conversationId_ownerId: { conversationId, ownerId } }
  });
  return row
    ? {
        version: row.version,
        muted: row.muted,
        archived: !!row.archivedAt,
        readThrough: row.readThrough,
        hiddenThrough: row.hiddenThrough
      }
    : { ...defaultConversationChoice };
}
async function requireSending(tx: Tx, row: AdultConversation, ownerId: string) {
  const otherId = adultOtherId(row, ownerId);
  if (
    !row.sendingAllowed ||
    !(await tx.platformUser.findFirst({
      where: { id: otherId, ...eligibleWhere },
      select: { id: true }
    })) ||
    (await tx.socialRelationship.findFirst({
      where: blockWhere(ownerId, [otherId]),
      select: { id: true }
    }))
  )
    throw new PortalError(
      403,
      "New messages are unavailable for this conversation. Your text is kept."
    );
  if (!(await communityReportIntakeAvailable(tx, null)))
    throw new PortalError(
      503,
      "New messages are unavailable while reporting operations are unavailable. Your text is kept."
    );
}

export function adultMessageCommand(
  db: PrismaClient,
  token: unknown,
  input: Record<string, unknown>
) {
  socialInput(input, [
    "operation",
    "mutationId",
    "conversationId",
    "expectedVersion",
    "content",
    "value",
    "through"
  ]);
  return socialCommand(
    db,
    token,
    "adult-message",
    input,
    async (tx, ownerId) => {
      const row = await ownedAdultConversation(
        tx,
        ownerId,
        input.conversationId
      );
      if (input.operation === "send") {
        expected(input.expectedVersion, row.version);
        const content = postField(input.content, 4000, 1);
        await requireSending(tx, row, ownerId);
        if (row.lastSequence >= 2147483647)
          throw new PortalError(
            503,
            "This conversation needs a storage review. Your text is kept."
          );
        for (const [scope, maximum, seconds] of [
          ["minute", 30, 60],
          ["day", 500, 86400]
        ] as const) {
          const retry = await activityBudget(
            tx,
            accountConfig().rateSecret,
            ownerId,
            `adult-message-${scope}`,
            maximum,
            seconds
          );
          if (retry)
            throw new PortalError(
              429,
              "Pause before sending another message. Your unsent text is kept.",
              retry
            );
        }
        const current = await tx.adultConversation.update({
          where: { id: row.id },
          data: { lastSequence: { increment: 1 } }
        });
        const message = await tx.adultMessage.create({
          data: {
            conversationId: row.id,
            senderId: ownerId,
            sequence: current.lastSequence,
            content
          }
        });
        await tx.adultConversationState.updateMany({
          where: {
            conversationId: row.id,
            ownerId: adultOtherId(row, ownerId),
            archivedAt: { not: null }
          },
          data: { archivedAt: null, version: { increment: 1 } }
        });
        return {
          id: message.id,
          version: message.sequence,
          message: "Message saved. This does not confirm delivery or reading."
        };
      }
      const current = await stateIn(tx, row.id, ownerId);
      const key = { conversationId: row.id, ownerId };
      if (input.operation === "read") {
        const through = await adultMessageCursor(
          tx,
          row.id,
          input.through,
          current.hiddenThrough
        );
        // Read position is independent from preference conflicts and never regresses.
        const saved = await tx.adultConversationState.upsert({
          where: { conversationId_ownerId: key },
          create: { ...key, readThrough: through.sequence },
          update: {
            readThrough: Math.max(current.readThrough, through.sequence)
          }
        });
        return {
          id: row.id,
          version: saved.version,
          message: "Your visible message position is saved."
        };
      }
      expected(input.expectedVersion, current.version);
      let change: Prisma.AdultConversationStateUpdateInput;
      let create: Prisma.AdultConversationStateUncheckedCreateInput = key;
      if (input.operation === "mute" || input.operation === "archive") {
        if (typeof input.value !== "boolean")
          throw new PortalError(
            400,
            "Choose a supported conversation setting."
          );
        const fields =
          input.operation === "mute"
            ? { muted: input.value }
            : { archivedAt: input.value ? new Date() : null };
        create = { ...create, ...fields };
        change = fields;
      } else if (input.operation === "clear") {
        const through = await adultMessageCursor(
          tx,
          row.id,
          input.through,
          current.hiddenThrough
        );
        const fields = {
          hiddenThrough: Math.max(current.hiddenThrough, through.sequence),
          readThrough: Math.max(current.readThrough, through.sequence)
        };
        create = { ...create, ...fields };
        change = fields;
      } else
        throw new PortalError(400, "Choose a supported conversation action.");
      const saved = await tx.adultConversationState.upsert({
        where: { conversationId_ownerId: key },
        create,
        update: { ...change, version: { increment: 1 } }
      });
      return {
        id: row.id,
        version: saved.version,
        message:
          input.operation === "clear"
            ? "These messages are hidden from your view. The other participant's history is unchanged."
            : "Your conversation choice is saved."
      };
    },
    requireContactActor
  );
}

async function summaries(
  tx: Tx,
  ownerId: string,
  rows: AdultConversation[],
  available: boolean
): Promise<AdultConversationSummary[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id),
    otherIds = rows.map((r) => adultOtherId(r, ownerId));
  const states = await tx.adultConversationState.findMany({
    where: { ownerId, conversationId: { in: ids } }
  });
  const choices = new Map(
    states.map((s) => [
      s.conversationId,
      {
        version: s.version,
        muted: s.muted,
        archived: !!s.archivedAt,
        readThrough: s.readThrough,
        hiddenThrough: s.hiddenThrough
      }
    ])
  );
  const people = await tx.platformUser.findMany({
    where: { id: { in: otherIds }, ...eligibleWhere },
    select: { id: true, name: true, username: true }
  });
  const blocks = await tx.socialRelationship.findMany({
    where: blockWhere(ownerId, otherIds),
    select: { ownerId: true, targetUserId: true }
  });
  const blocked = new Set(
    blocks.map((b) => (b.ownerId === ownerId ? b.targetUserId : b.ownerId))
  );
  const peopleById = new Map(
    people.filter((p) => !blocked.has(p.id)).map((p) => [p.id, p])
  );
  // One index seek per already-authorized conversation; never fetch all history
  // to pick its last message or store a duplicate preview body.
  const latest = await tx.$queryRaw<
    (MessageRow & { conversationId: string })[]
  >`
    SELECT c."id" AS "conversationId", m."id", m."senderId", m."sequence", m."content", m."createdAt"
    FROM "AdultConversation" c
    JOIN LATERAL (SELECT "id", "senderId", "sequence", "content", "createdAt" FROM "AdultMessage"
      WHERE "conversationId" = c."id" ORDER BY "sequence" DESC LIMIT 1) m ON true
    WHERE c."id" IN (${Prisma.join(ids)})`;
  const lastById = new Map(latest.map((m) => [m.conversationId, m]));
  const counts = await tx.adultMessage.groupBy({
    by: ["conversationId"],
    where: {
      senderId: { not: ownerId },
      OR: rows.map((r) => ({
        conversationId: r.id,
        sequence: {
          gt: Math.max(
            choices.get(r.id)?.readThrough ?? 0,
            choices.get(r.id)?.hiddenThrough ?? 0
          )
        }
      }))
    },
    _count: { _all: true }
  });
  const unread = new Map(counts.map((c) => [c.conversationId, c._count._all]));
  return rows.map((row) => {
    const preferences = choices.get(row.id) ?? { ...defaultConversationChoice },
      last = lastById.get(row.id);
    const person = peopleById.get(adultOtherId(row, ownerId)) ?? null;
    return {
      id: row.id,
      version: row.version,
      person,
      sendingAllowed: available && row.sendingAllowed && !!person,
      updatedAt: row.updatedAt.toISOString(),
      latest:
        last && last.sequence > preferences.hiddenThrough
          ? item(last, ownerId)
          : null,
      unread: unread.get(row.id) ?? 0,
      preferences
    };
  });
}

export function readAdultMessages(
  db: PrismaClient,
  token: unknown,
  query: Record<string, unknown>
): Promise<AdultMessageView> {
  socialInput(query, ["view", "conversationId", "before", "after", "archived"]);
  return withAccountRead(db, token, async (tx, ownerId) => {
    if (!ownerId)
      throw new PortalError(401, "Sign in to use private conversations.");
    await requireContactActor(tx, ownerId);
    const available = await communityReportIntakeAvailable(tx, null);
    if (!query.view || query.view === "inbox") {
      if (query.archived !== undefined && query.archived !== "true")
        throw new PortalError(400, "Choose a supported inbox view.");
      const archived = { ownerId, archivedAt: { not: null } };
      const where = {
        ...adultMemberWhere(ownerId),
        states:
          query.archived === "true" ? { some: archived } : { none: archived }
      };
      const after = query.after ? postId(query.after) : null;
      if (
        after &&
        !(await tx.adultConversation.findFirst({
          where: { ...where, id: after },
          select: { id: true }
        }))
      )
        throw new PortalError(
          409,
          "This inbox page changed. Open Messages again."
        );
      const rows = await tx.adultConversation.findMany({
        where,
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        take: INBOX + 1,
        ...(after ? { cursor: { id: after }, skip: 1 } : {})
      });
      const page = rows.slice(0, INBOX);
      return {
        ownerId,
        available,
        conversations: await summaries(tx, ownerId, page, available),
        after: rows.length > INBOX ? page.at(-1)!.id : null
      };
    }
    if (query.view !== "conversation" || (query.before && query.after))
      throw new PortalError(400, "Choose one supported conversation position.");
    const row = await ownedAdultConversation(tx, ownerId, query.conversationId);
    const [conversation] = await summaries(tx, ownerId, [row], available);
    const hidden = conversation.preferences.hiddenThrough;
    const cursor =
      query.before || query.after
        ? await adultMessageCursor(
            tx,
            row.id,
            query.before ?? query.after,
            hidden
          )
        : null;
    const forward = !!query.after;
    const rows = await tx.adultMessage.findMany({
      where: {
        conversationId: row.id,
        sequence: {
          gt: forward ? Math.max(hidden, cursor!.sequence) : hidden,
          ...(query.before ? { lt: cursor!.sequence } : {})
        }
      },
      orderBy: { sequence: forward ? "asc" : "desc" },
      take: PAGE + 1,
      select: messageSelect
    });
    const page = rows.slice(0, PAGE);
    if (!forward) page.reverse();
    const context = await tx.adultContactRequest.findFirst({
      where: { conversationId: row.id, status: "ACCEPTED" },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      select: { id: true, purpose: true, createdAt: true }
    });
    return {
      ownerId,
      available,
      conversation,
      context: context
        ? { ...context, createdAt: context.createdAt.toISOString() }
        : null,
      messages: page.map((m) => item(m, ownerId)),
      older: !forward && rows.length > PAGE ? page[0].id : null,
      newer: forward && rows.length > PAGE ? page.at(-1)!.id : null
    };
  });
}
