import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { accountConfig } from "./account-config";
import { commentVisibleWhere } from "./comment-policy";
import type { PostContext, PostTx } from "./post-access";
import { PortalError } from "./portal-policy";
import { postId } from "./post-input";

type Position = { id: string; createdAt: Date };
type Proof = {
  ownerId: string;
  postId: string;
  postVersion: number;
  ids: string[];
  scope: string;
  until: number;
};
export function groupReadScope(
  context: PostContext,
  post: { version: number; groupId: string | null }
) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        blocked: [...(context.blockedIds ?? [])].sort(),
        post: post.version,
        group: context.groupReadEpochs?.get(post.groupId ?? "") ?? null
      })
    )
    .digest("hex");
}
const signature = (body: string) =>
  createHmac("sha256", accountConfig().rateSecret)
    .update("gather-read-v1:" + body)
    .digest("hex");
export function groupReadProof(
  context: PostContext,
  post: { id: string; version: number; groupId: string | null },
  ids: string[]
) {
  if (
    !post.groupId ||
    !context.actorId ||
    !context.groupReaders?.has(post.groupId)
  )
    return null;
  if (ids.length > 50)
    throw new PortalError(400, "This discussion page is too large.");
  const proof: Proof = {
    ownerId: context.actorId,
    postId: post.id,
    postVersion: post.version,
    ids: [...new Set(ids)],
    scope: groupReadScope(context, post),
    until: Date.now() + 10 * 60000
  };
  const body = Buffer.from(JSON.stringify(proof)).toString("base64url");
  return body + "." + signature(body);
}
function decodeProof(
  value: unknown,
  context: PostContext,
  post: { id: string; version: number; groupId: string | null }
): Proof {
  try {
    if (typeof value !== "string" || value.length > 16000) throw Error();
    const [body, mac, extra] = value.split(".");
    if (
      extra ||
      !/^[a-f0-9]{64}$/.test(mac) ||
      !timingSafeEqual(Buffer.from(mac), Buffer.from(signature(body)))
    )
      throw Error();
    const proof = JSON.parse(
      Buffer.from(body, "base64url").toString()
    ) as Proof;
    if (
      proof.ownerId !== context.actorId ||
      proof.postId !== post.id ||
      proof.until < Date.now() ||
      proof.scope !== groupReadScope(context, post) ||
      !Array.isArray(proof.ids) ||
      proof.ids.length > 50
    )
      throw Error();
    proof.ids.forEach(postId);
    return proof;
  } catch {
    throw new PortalError(
      409,
      "Reload the current discussion page before saving its read progress."
    );
  }
}
export function afterGroupPosition(position: Position | null) {
  return position
    ? {
        OR: [
          { createdAt: { gt: position.createdAt } },
          { createdAt: position.createdAt, id: { gt: position.id } }
        ]
      }
    : {};
}
// Marks only signed, actually returned comment IDs. A later root/deep link does
// not mark an unseen earlier reply page read. Compact only a contiguous visible
// prefix; retain a bounded set of shown positions beyond a gap. No follow change.
export async function saveGroupReadProgress(
  tx: PostTx,
  context: PostContext,
  post: { id: string; version: number; groupId: string | null },
  value: unknown
) {
  const proof = decodeProof(value, context, post);
  if (proof.postVersion !== post.version)
    throw new PortalError(
      409,
      "This discussion changed. Reload before recording its read progress."
    );
  const where = {
      ownerId_postId: { ownerId: context.actorId!, postId: post.id }
    },
    old = await tx.conversationPreference.findUnique({ where });
  const sameScope = old?.readScope === proof.scope;
  let position =
    sameScope && old?.readCommentAt && old.readCommentId
      ? { id: old.readCommentId, createdAt: old.readCommentAt }
      : null;
  const supplied = new Set([
    ...(sameScope ? (old?.readCommentIds ?? []) : []),
    ...proof.ids
  ]);
  const visible = await tx.platformPostComment.findMany({
    where: {
      AND: [
        { postId: post.id, id: { in: [...supplied] } },
        commentVisibleWhere(context),
        afterGroupPosition(position)
      ]
    },
    select: { id: true },
    take: 551
  });
  const seen = new Set(visible.map((row) => row.id));
  const prefix = await tx.platformPostComment.findMany({
    where: {
      AND: [
        { postId: post.id },
        commentVisibleWhere(context),
        afterGroupPosition(position)
      ]
    },
    select: { id: true, createdAt: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: 551
  });
  for (const row of prefix) {
    if (!seen.has(row.id)) break;
    position = row;
    seen.delete(row.id);
  }
  // Keep earlier pending positions when the bound is reached; a future display
  // can acknowledge any omitted later positions again without inventing reads.
  const retained = await tx.platformPostComment.findMany({
    where: { postId: post.id, id: { in: [...seen] } },
    select: { id: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: 500
  });
  const data = {
    readPostVersion: post.version,
    readScope: proof.scope,
    readCommentAt: position?.createdAt ?? null,
    readCommentId: position?.id ?? null,
    readCommentIds: retained.map((r) => r.id)
  };
  if (
    sameScope &&
    old?.readPostVersion === data.readPostVersion &&
    old.readCommentId === data.readCommentId &&
    JSON.stringify(old.readCommentIds) === JSON.stringify(data.readCommentIds)
  )
    return old.readVersion;
  const saved = await tx.conversationPreference.upsert({
    where,
    create: {
      ownerId: context.actorId!,
      postId: post.id,
      ...data,
      readVersion: 1
    },
    update: { ...data, readVersion: { increment: 1 } }
  });
  return saved.readVersion;
}
