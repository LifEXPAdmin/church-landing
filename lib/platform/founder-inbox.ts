import { Prisma, type AdultConversation } from "@prisma/client";
import { PortalError } from "./portal-policy";
import { postId } from "./post-input";
export const founderInboxFilters = [
  "all",
  "welcome-replies",
  "unanswered",
  "sent-welcomes"
] as const;
export function founderInboxFilter(value: unknown) {
  if (value === undefined) return "all";
  if (
    !founderInboxFilters.includes(value as (typeof founderInboxFilters)[number])
  )
    throw new PortalError(400, "Choose a supported founder inbox filter.");
  return value as (typeof founderInboxFilters)[number];
}
// Filter before pagination. Two bounded index seeks compare personal messages;
// automatic welcome/announcement messages and read state never answer a reply.
export async function founderInboxRows(
  tx: Prisma.TransactionClient,
  ownerId: string,
  query: Record<string, unknown>,
  limit: number
) {
  const filter = founderInboxFilter(query.filter);
  const status =
    filter === "sent-welcomes"
      ? Prisma.sql`w.id IS NOT NULL`
      : filter === "unanswered"
        ? Prisma.sql`w.id IS NOT NULL AND inbound.sequence > COALESCE(response.sequence, 0)`
        : filter === "welcome-replies"
          ? Prisma.sql`w.id IS NOT NULL AND inbound.sequence IS NOT NULL`
          : Prisma.sql`(w.id IS NULL OR inbound.sequence IS NOT NULL)`;
  const read = (id?: string, after?: AdultConversation) => tx.$queryRaw<
    AdultConversation[]
  >`
    SELECT c.* FROM "AdultConversation" c
    LEFT JOIN "FounderWelcome" w ON w."conversationId" = c.id AND w."founderId" = ${ownerId}
    LEFT JOIN "AdultConversationState" s ON s."conversationId" = c.id AND s."ownerId" = ${ownerId}
    LEFT JOIN LATERAL (SELECT sequence FROM "AdultMessage" m WHERE m."conversationId" = c.id
      AND m."senderId" = w."recipientId" AND m.kind = 'TEXT' AND m.sequence > COALESCE(s."hiddenThrough", 0)
      ORDER BY sequence DESC LIMIT 1) inbound ON true
    LEFT JOIN LATERAL (SELECT sequence FROM "AdultMessage" m WHERE m."conversationId" = c.id
      AND m."senderId" = ${ownerId} AND m.kind = 'TEXT' ORDER BY sequence DESC LIMIT 1) response ON true
    WHERE (c."participantAId" = ${ownerId} OR c."participantBId" = ${ownerId})
      AND ${query.archived === "true" ? Prisma.sql`s."archivedAt" IS NOT NULL` : Prisma.sql`s."archivedAt" IS NULL`}
      AND ${status}
      ${id ? Prisma.sql`AND c.id = ${id}` : Prisma.empty}
      ${after ? Prisma.sql`AND (c."updatedAt", c.id) < (${after.updatedAt.toISOString()}::timestamp, ${after.id})` : Prisma.empty}
    ORDER BY c."updatedAt" DESC, c.id DESC LIMIT ${id ? 1 : limit}`;
  let cursor: AdultConversation | undefined;
  if (query.after) {
    [cursor] = await read(postId(query.after));
    if (!cursor)
      throw new PortalError(
        409,
        "This inbox page changed. Open Messages again."
      );
  }
  return read(undefined, cursor);
}
