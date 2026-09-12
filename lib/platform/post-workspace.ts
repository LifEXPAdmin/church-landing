import { postInteractionIdIn } from "./post-reads";
import {
  savedPhotoReferences,
  type SavedPhotoReference
} from "./post-photo-references";
import { createHash } from "node:crypto";
import { Prisma, PlatformPostType, type PrismaClient } from "@prisma/client";
import { withOwnedSession } from "./account-sessions";
import { expected, PortalError } from "./portal";
import {
  postContext,
  postId,
  postReadableWhere,
  type PostTx
} from "./post-access";
import { postCommandIn } from "./post-commands";
import { preparePostLink, type PostLink } from "./post-links";
import { POST_TOPICS } from "./post-options";

export const WORKSPACE_PAGE_SIZE = 20;
export type PrivateDraftPayload = {
  content: string;
  scripture: string;
  type: PlatformPostType;
  topics: string[];
  audience: "PUBLIC" | "CHURCH";
  replyAudience: "VIEWERS" | "CHURCH_MEMBERS" | null;
  authorChurchId: string | null;
  audienceChurchId: string | null;
  eventOccurrenceId: string | null;
  linkUrl: string;
  photos?: SavedPhotoReference[];
  quoteSourceId?: string | null;
};
const draftFields = [
  "content",
  "scripture",
  "type",
  "topics",
  "audience",
  "replyAudience",
  "authorChurchId",
  "audienceChurchId",
  "eventOccurrenceId",
  "linkUrl",
  "photos",
  "quoteSourceId"
];
function plain(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new PortalError(
      400,
      "Use an object containing the supported fields."
    );
  return value as Record<string, unknown>;
}
function text(value: unknown, max: number) {
  if (typeof value !== "string" || value.length > max)
    throw new PortalError(
      400,
      `Use at most ${max} characters. Nothing has been shortened.`
    );
  return value; // Incomplete and whitespace-only work is still a private draft.
}
export function privateDraftPayload(value: unknown): PrivateDraftPayload {
  const p = plain(value);
  if (Object.keys(p).some((k) => !draftFields.includes(k)))
    throw new PortalError(
      400,
      "This draft contains unsupported fields. Keep the unsaved entries and refresh."
    );
  const type = p.type ?? "UPDATE";
  if (
    typeof type !== "string" ||
    !Object.values(PlatformPostType).includes(type as PlatformPostType)
  )
    throw new PortalError(400, "Choose a supported post category.");
  const topics = p.topics ?? [];
  if (
    !Array.isArray(topics) ||
    topics.length > 5 ||
    new Set(topics).size !== topics.length ||
    topics.some((t) => !POST_TOPICS.includes(t))
  )
    throw new PortalError(400, "Choose up to five different supported topics.");
  const audience = p.audience ?? "PUBLIC";
  if (audience !== "PUBLIC" && audience !== "CHURCH")
    throw new PortalError(400, "Choose Public or Church.");
  // Old snapshots never recorded this choice. Keep it unresolved, not public.
  const replyAudience = p.replyAudience ?? null;
  if (
    replyAudience !== null &&
    replyAudience !== "VIEWERS" &&
    replyAudience !== "CHURCH_MEMBERS"
  )
    throw new PortalError(400, "Choose a supported reply permission.");
  const reference = (v: unknown) => (v == null || v === "" ? null : postId(v));
  return {
    content: text(p.content ?? "", 20000),
    scripture: text(p.scripture ?? "", 1000),
    type: type as PlatformPostType,
    topics,
    audience,
    replyAudience,
    authorChurchId: reference(p.authorChurchId),
    audienceChurchId: reference(p.audienceChurchId),
    eventOccurrenceId: reference(p.eventOccurrenceId),
    linkUrl: text(p.linkUrl ?? "", 2048),
    ...(p.quoteSourceId !== undefined
      ? { quoteSourceId: reference(p.quoteSourceId) }
      : {}),
    ...(p.photos !== undefined
      ? { photos: savedPhotoReferences(p.photos) }
      : {})
  };
}
function publicationPayload(value: unknown) {
  const payload = privateDraftPayload(value);
  if (payload.replyAudience === null)
    throw new PortalError(
      400,
      "This draft has no saved reply permission. Choose who may reply and save the draft before publishing."
    );
  return payload;
}
function fingerprint(value: unknown): string {
  function ordered(v: unknown, depth = 0): unknown {
    if (depth > 8) throw new PortalError(400, "Too many nested fields.");
    if (Array.isArray(v)) return v.map((i) => ordered(i, depth + 1));
    if (v && typeof v === "object")
      return Object.fromEntries(
        Object.entries(v)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, i]) => [k, ordered(i, depth + 1)])
      );
    return v;
  }
  const body = JSON.stringify(ordered(value));
  if (Buffer.byteLength(body) > 65536)
    throw new PortalError(
      400,
      "This draft is too large. Nothing has been shortened."
    );
  return createHash("sha256").update(body).digest("hex");
}
function key(value: unknown) {
  const id = postId(value);
  if (id.length > 80)
    throw new PortalError(
      400,
      "Use a stable reference of at most 80 characters."
    );
  return id;
}
const draftSelect = {
  id: true,
  version: true,
  payload: true,
  createdAt: true,
  updatedAt: true
} as const;
const collectionSelect = {
  id: true,
  name: true,
  version: true,
  createdAt: true,
  updatedAt: true
} as const;
// All private reads filter by the session owner, including cursor and empty-state paths.
export function readPostWorkspace(
  db: PrismaClient,
  token: unknown,
  query: {
    view: string;
    id?: unknown;
    postId?: unknown;
    collectionId?: unknown;
    after?: unknown;
  }
) {
  return withOwnedSession(
    db,
    token,
    async (tx, session) => {
      const ownerId = session.userId;
      const after = query.after ? key(query.after) : undefined;
      const page = <T extends { id: string }>(rows: T[]) => ({
        items: rows.slice(0, WORKSPACE_PAGE_SIZE),
        nextCursor:
          rows.length > WORKSPACE_PAGE_SIZE
            ? rows[WORKSPACE_PAGE_SIZE - 1].id
            : null
      });
      const paging = {
        orderBy: { id: "asc" as const },
        take: WORKSPACE_PAGE_SIZE + 1
      };
      if (query.view === "draft") {
        const draft = await tx.privatePostDraft.findFirst({
          where: { ownerId, id: key(query.id), deletedAt: null },
          select: draftSelect
        });
        return {
          draft: draft
            ? { ...draft, payload: privateDraftPayload(draft.payload) }
            : null
        };
      }
      if (query.view === "drafts")
        return page(
          (
            await tx.privatePostDraft.findMany({
              where: {
                ownerId,
                deletedAt: null,
                ...(after ? { id: { gt: after } } : {})
              },
              select: draftSelect,
              ...paging
            })
          ).map((draft) => ({
            ...draft,
            payload: privateDraftPayload(draft.payload)
          }))
        );
      if (query.view === "collections")
        return page(
          await tx.savedPostCollection.findMany({
            where: {
              ownerId,
              deletedAt: null,
              ...(after ? { id: { gt: after } } : {})
            },
            select: collectionSelect,
            ...paging
          })
        );
      if (query.view === "saved-status") {
        const requested = postId(query.postId);
        const entry = await tx.platformPost.findUnique({
          where: { id: requested },
          select: { repostKind: true }
        });
        const id =
          entry?.repostKind === "PLAIN"
            ? await postInteractionIdIn(
                tx,
                await postContext(tx, ownerId),
                requested
              )
            : requested;
        return {
          item: await tx.savedPostItem.findFirst({
            where: { ownerId, postId: id },
            select: { id: true, version: true, collectionId: true }
          })
        };
      }
      if (query.view !== "saved")
        throw new PortalError(
          400,
          "Choose a supported private workspace view."
        );
      const collectionId =
        query.collectionId === "unfiled"
          ? null
          : query.collectionId
            ? key(query.collectionId)
            : undefined;
      if (collectionId) await ownedCollection(tx, ownerId, collectionId);
      const rows = await tx.savedPostItem.findMany({
        where: {
          ownerId,
          ...(collectionId !== undefined ? { collectionId } : {}),
          ...(after ? { id: { gt: after } } : {})
        },
        ...paging
      });
      const context = await postContext(tx, ownerId);
      const visible = await tx.platformPost.findMany({
        where: {
          AND: [
            { id: { in: rows.flatMap((r) => (r.postId ? [r.postId] : [])) } },
            postReadableWhere(context)
          ]
        },
        select: { id: true, content: true, type: true, publishedAt: true }
      });
      return page(
        rows.map((row) => {
          const post = visible.find((p) => p.id === row.postId);
          return {
            id: row.id,
            version: row.version,
            collectionId: row.collectionId,
            available: !!post,
            ...(post
              ? {
                  post: {
                    id: post.id,
                    excerpt: post.content.slice(0, 300),
                    type: post.type,
                    publishedAt: post.publishedAt,
                    href: `/platform/posts/${post.id}`
                  }
                }
              : {})
          };
        })
      );
    },
    true
  );
}
async function ownedCollection(tx: PostTx, ownerId: string, id: string) {
  const row = await tx.savedPostCollection.findFirst({
    where: { ownerId, id, deletedAt: null }
  });
  if (!row) throw new PortalError(404, "Collection unavailable.");
  return row;
}
type Receipt = {
  id: string;
  version: number;
  message: string;
  postId?: string;
};
export async function postWorkspaceCommand(
  db: PrismaClient,
  token: unknown,
  value: Record<string, unknown>
): Promise<Receipt> {
  const input = plain(value);
  if (
    Object.keys(input).some(
      (k) =>
        ![
          "operation",
          "mutationId",
          "id",
          "expectedVersion",
          "payload",
          "name",
          "postId",
          "collectionId",
          "linkReceipt",
          "keepLinkPreview"
        ].includes(k)
    )
  )
    throw new PortalError(
      400,
      "Only supported fields are accepted. Your sign-in determines ownership."
    );
  const op = input.operation;
  if (
    ![
      "save-draft",
      "delete-draft",
      "publish-draft",
      "create-collection",
      "rename-collection",
      "delete-collection",
      "save-item",
      "move-item",
      "remove-item"
    ].includes(String(op))
  )
    throw new PortalError(400, "Choose a supported workspace action.");
  const mutationId = key(input.mutationId),
    digest = fingerprint(input);
  let preparedLink: PostLink | undefined;
  if (op === "publish-draft") {
    const preflight = await withOwnedSession(db, token, async (tx, session) => {
      const receipt = await tx.postWorkspaceOperation.findUnique({
        where: { ownerId_key: { ownerId: session.userId, key: mutationId } }
      });
      if (receipt) {
        if (receipt.fingerprint !== digest)
          throw new PortalError(
            409,
            "This retry key was used for different work."
          );
        return { receipt: receipt.result as unknown as Receipt };
      }
      const row = await tx.privatePostDraft.findFirst({
        where: { ownerId: session.userId, id: key(input.id), deletedAt: null }
      });
      if (!row) throw new PortalError(404, "Draft unavailable.");
      expected(input.expectedVersion, row.version);
      return {
        ownerId: session.userId,
        payload: publicationPayload(row.payload)
      };
    });
    if (preflight.receipt) return preflight.receipt;
    // Network/DNS work precedes the locked write; the draft version is checked again below.
    preparedLink = await preparePostLink(preflight.ownerId!, {
      ...preflight.payload,
      linkReceipt: input.linkReceipt,
      keepLinkPreview: input.keepLinkPreview
    });
  }
  return withOwnedSession(
    db,
    token,
    async (tx, session) => {
      const ownerId = session.userId;
      const receipt = await tx.postWorkspaceOperation.findUnique({
        where: { ownerId_key: { ownerId, key: mutationId } }
      });
      if (receipt) {
        if (receipt.fingerprint !== digest)
          throw new PortalError(
            409,
            "This retry key was used for different work."
          );
        return receipt.result as unknown as Receipt;
      }
      if (
        (await tx.postWorkspaceOperation.count({ where: { ownerId } })) >= 20000
      )
        throw new PortalError(
          429,
          "Your workspace needs a storage review before more changes can be saved."
        );
      let result: Receipt;
      if (
        op === "save-draft" ||
        op === "delete-draft" ||
        op === "publish-draft"
      ) {
        const id = key(input.id);
        const row = await tx.privatePostDraft.findUnique({
          where: { ownerId_id: { ownerId, id } }
        });
        if (row?.deletedAt)
          throw new PortalError(
            409,
            "This draft was discarded or published. Start a new draft."
          );
        if (!row && op !== "save-draft")
          throw new PortalError(404, "Draft unavailable.");
        expected(input.expectedVersion, row?.version ?? 0);
        if (op === "save-draft") {
          const payload = privateDraftPayload(input.payload);
          if (
            !row &&
            (await tx.privatePostDraft.count({
              where: { ownerId, deletedAt: null }
            })) >= 100
          )
            throw new PortalError(
              409,
              "Keep up to 100 active drafts. Finish or discard one first."
            );
          const saved = row
            ? await tx.privatePostDraft.update({
                where: { ownerId_id: { ownerId, id } },
                data: { payload, version: { increment: 1 } }
              })
            : await tx.privatePostDraft.create({
                data: { id, ownerId, payload }
              });
          result = {
            id,
            version: saved.version,
            message: "Draft saved privately."
          };
        } else {
          let published: { id: string } | undefined;
          if (op === "publish-draft")
            published = await postCommandIn(
              tx,
              await postContext(tx, ownerId),
              {
                ...publicationPayload(row!.payload),
                operation: "create",
                requestKey: `draft-${row!.publicationKey}`
              },
              preparedLink
            );
          const saved = await tx.privatePostDraft.update({
            where: { ownerId_id: { ownerId, id } },
            data: {
              payload: Prisma.JsonNull,
              deletedAt: new Date(),
              publishedPostId: published?.id,
              version: { increment: 1 }
            }
          });
          result = {
            id,
            version: saved.version,
            ...(published ? { postId: published.id } : {}),
            message: published ? "Draft published once." : "Draft discarded."
          };
        }
      } else if (
        op === "create-collection" ||
        op === "rename-collection" ||
        op === "delete-collection"
      ) {
        const id = key(input.id);
        const row = await tx.savedPostCollection.findUnique({
          where: { ownerId_id: { ownerId, id } }
        });
        if (row?.deletedAt)
          throw new PortalError(
            409,
            "This collection was deleted. Use a new reference."
          );
        if (!row && op !== "create-collection")
          throw new PortalError(404, "Collection unavailable.");
        expected(input.expectedVersion, row?.version ?? 0);
        if (op === "create-collection" && row)
          throw new PortalError(409, "This collection already exists.");
        if (op === "delete-collection") {
          await tx.savedPostItem.updateMany({
            where: { ownerId, collectionId: id },
            data: { collectionId: null, version: { increment: 1 } }
          });
          const saved = await tx.savedPostCollection.update({
            where: { ownerId_id: { ownerId, id } },
            data: { name: "", deletedAt: new Date(), version: { increment: 1 } }
          });
          result = {
            id,
            version: saved.version,
            message: "Collection deleted. Its saved posts are now unfiled."
          };
        } else {
          const name = text(input.name, 80).trim();
          if (!name) throw new PortalError(400, "Give the collection a name.");
          if (
            !row &&
            (await tx.savedPostCollection.count({
              where: { ownerId, deletedAt: null }
            })) >= 100
          )
            throw new PortalError(409, "Keep up to 100 collections.");
          const saved = row
            ? await tx.savedPostCollection.update({
                where: { ownerId_id: { ownerId, id } },
                data: { name, version: { increment: 1 } }
              })
            : await tx.savedPostCollection.create({
                data: { id, ownerId, name }
              });
          result = {
            id,
            version: saved.version,
            message: "Private collection saved."
          };
        }
      } else {
        const collectionId =
          input.collectionId == null || input.collectionId === ""
            ? null
            : key(input.collectionId);
        if (collectionId && op !== "remove-item")
          await ownedCollection(tx, ownerId, collectionId);
        if (op === "save-item") {
          const context = await postContext(tx, ownerId);
          const id = await postInteractionIdIn(
            tx,
            context,
            postId(input.postId)
          );
          if (
            !(await tx.platformPost.findFirst({
              where: { AND: [{ id }, postReadableWhere(context)] },
              select: { id: true }
            }))
          )
            throw new PortalError(404, "Post unavailable.");
          const row = await tx.savedPostItem.findUnique({
            where: { ownerId_postId: { ownerId, postId: id } }
          });
          expected(input.expectedVersion, row?.version ?? 0);
          if (row && row.collectionId !== collectionId)
            throw new PortalError(
              409,
              "This post is already saved. Use Move to change its collection."
            );
          if (
            !row &&
            (await tx.savedPostItem.count({ where: { ownerId } })) >= 2000
          )
            throw new PortalError(409, "Keep up to 2,000 saved posts.");
          const saved =
            row ??
            (await tx.savedPostItem.create({
              data: { ownerId, postId: id, collectionId }
            }));
          result = {
            id: saved.id,
            version: saved.version,
            message: "Post saved privately."
          };
        } else {
          const row = await tx.savedPostItem.findFirst({
            where: { ownerId, id: postId(input.id) }
          });
          if (!row) throw new PortalError(404, "Saved item unavailable.");
          expected(input.expectedVersion, row.version);
          if (op === "remove-item")
            await tx.savedPostItem.delete({ where: { id: row.id } });
          else
            await tx.savedPostItem.update({
              where: { id: row.id },
              data: { collectionId, version: { increment: 1 } }
            });
          result = {
            id: row.id,
            version: row.version + 1,
            message:
              op === "remove-item" ? "Saved item removed." : "Saved item moved."
          };
        }
      }
      await tx.postWorkspaceOperation.create({
        data: {
          ownerId,
          key: mutationId,
          fingerprint: digest,
          result: result as unknown as Prisma.InputJsonObject
        }
      });
      return result;
    },
    true
  );
}
