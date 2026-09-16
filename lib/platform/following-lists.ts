import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import {
  withPostRead,
  postContext,
  type PostContext,
  type PostTx
} from "./post-access";
import { expected, PortalError } from "./portal-policy";
import { socialUserWhere } from "./social-policy";
import { socialCommand, socialInput } from "./social-operations";
import { recordDiscoveryControl } from "./retention-controls";
import { protectDiscoveryRecovery } from "./discovery-recovery";
import {
  followingListsSelect,
  followingFeedSelection
} from "./following-list-policy";
import {
  FOLLOWING_LIST_LIMIT,
  followingListName,
  followingListReference,
  followingListEntries,
  storedFollowingLists,
  type FollowingListEntry
} from "./following-list-options";

export type FollowingListMember = FollowingListEntry & {
  name: string;
  username?: string;
};
const personSelect = {
  id: true,
  followingId: true,
  following: { select: { name: true, username: true } }
} as const;
const churchSelect = {
  id: true,
  churchId: true,
  followingSince: true,
  church: { select: { name: true } }
} as const;
function people(
  rows: Array<{
    id: string;
    followingId: string;
    following: { name: string; username: string };
  }>
): FollowingListMember[] {
  return rows.map((r) => ({
    kind: "person",
    targetId: r.followingId,
    relationshipId: r.id,
    since: null,
    ...r.following
  }));
}
function churches(
  rows: Array<{
    id: string;
    churchId: string | null;
    followingSince: Date | null;
    church: { name: string } | null;
  }>
): FollowingListMember[] {
  return rows.flatMap((r) =>
    r.churchId && r.church
      ? [
          {
            kind: "church" as const,
            targetId: r.churchId,
            relationshipId: r.id,
            since: r.followingSince?.toISOString() ?? null,
            name: r.church.name
          }
        ]
      : []
  );
}
const entryKey = (e: FollowingListEntry) =>
  JSON.stringify([e.kind, e.targetId, e.relationshipId, e.since]);
export function readFollowingListChoice(db: PrismaClient, token: unknown) {
  return withPostRead(db, token, async (tx, context) => {
    if (!context.actorId)
      throw new PortalError(
        401,
        "Sign in to view your private following lists."
      );
    const row = await tx.socialPreferences.findUnique({
      where: { ownerId: context.actorId },
      select: followingListsSelect
    });
    const value = followingFeedSelection(context.actorId, row);
    return {
      ownerId: context.actorId,
      selectedId: value.selectedId,
      lists: value.lists,
      version: value.version
    };
  });
}
export async function currentFollowingListMembers(
  tx: PostTx,
  context: PostContext,
  entries: FollowingListEntry[]
) {
  const p = entries.filter((e) => e.kind === "person"),
    c = entries.filter((e) => e.kind === "church");
  const available = [
    ...(p.length
      ? people(
          await tx.platformFollow.findMany({
            where: {
              followerId: context.actorId!,
              id: { in: p.map((e) => e.relationshipId) },
              following: socialUserWhere(context)
            },
            select: personSelect,
            take: 100
          })
        )
      : []),
    ...(c.length
      ? churches(
          await tx.socialRelationship.findMany({
            where: {
              ownerId: context.actorId!,
              followingChurch: true,
              id: { in: c.map((e) => e.relationshipId) }
            },
            select: churchSelect,
            take: 100
          })
        )
      : [])
  ];
  const byKey = new Map(available.map((e) => [entryKey(e), e]));
  return entries.flatMap((e) =>
    byKey.has(entryKey(e)) ? [byKey.get(entryKey(e))!] : []
  );
}
export function readFollowingLists(
  db: PrismaClient,
  token: unknown,
  query: Record<string, unknown> = {}
) {
  socialInput(query, ["listId", "kind", "after", "q"]);
  const kind = query.kind ?? "person";
  if (kind !== "person" && kind !== "church")
    throw new PortalError(400, "Choose people or churches you follow.");
  for (const field of ["listId", "after"])
    if (query[field] !== undefined && !followingListReference(query[field]))
      throw new PortalError(
        400,
        "Use a current private list or page reference."
      );
  if (
    query.q !== undefined &&
    (typeof query.q !== "string" ||
      query.q.length > 100 ||
      /[\u0000-\u001f\u007f]/.test(query.q))
  )
    throw new PortalError(
      400,
      "Search your follows using up to 100 characters."
    );
  const search =
    typeof query.q === "string"
      ? query.q.trim().replace(/[\\%_]/g, "\\$&")
      : "";
  return withPostRead(db, token, async (tx, context) => {
    if (!context.actorId)
      throw new PortalError(
        401,
        "Sign in to view your private following lists."
      );
    const row = await tx.socialPreferences.findUnique({
      where: { ownerId: context.actorId },
      select: { ...followingListsSelect, feedVersion: true }
    });
    const value = storedFollowingLists(row?.followingLists);
    const list = query.listId
      ? value.lists.find((l) => l.id === query.listId)
      : null;
    if (query.listId && (!list || row?.followingListsRecoveryRequired))
      throw new PortalError(
        404,
        "This private list is unavailable. Open your current lists."
      );
    const after = query.after as string | undefined;
    const candidates =
      kind === "person"
        ? people(
            await tx.platformFollow.findMany({
              where: {
                followerId: context.actorId,
                ...(after ? { id: { gt: after } } : {}),
                following: {
                  AND: [
                    socialUserWhere(context),
                    ...(search
                      ? [
                          {
                            OR: [
                              {
                                name: {
                                  contains: search,
                                  mode: "insensitive" as const
                                }
                              },
                              {
                                username: {
                                  contains: search,
                                  mode: "insensitive" as const
                                }
                              }
                            ]
                          }
                        ]
                      : [])
                  ]
                }
              },
              select: personSelect,
              orderBy: { id: "asc" },
              take: 21
            })
          )
        : churches(
            await tx.socialRelationship.findMany({
              where: {
                ownerId: context.actorId,
                followingChurch: true,
                ...(after ? { id: { gt: after } } : {}),
                ...(search
                  ? {
                      church: {
                        name: { contains: search, mode: "insensitive" as const }
                      }
                    }
                  : {})
              },
              select: churchSelect,
              orderBy: { id: "asc" },
              take: 21
            })
          );
    return {
      ownerId: context.actorId,
      version: row?.followingListsVersion ?? 0,
      feedVersion: row?.feedVersion ?? 0,
      recoveryRequired: row?.followingListsRecoveryRequired ?? false,
      selectedId: value.selectedId,
      lists: value.lists.map(({ id, name }) => ({ id, name })),
      list: list
        ? {
            id: list.id,
            name: list.name,
            members: await currentFollowingListMembers(
              tx,
              context,
              list.members
            )
          }
        : null,
      candidates: candidates.slice(0, 20),
      nextCursor: candidates.length > 20 ? candidates[19].relationshipId : null
    };
  });
}
export async function followingListCommand(
  db: PrismaClient,
  token: unknown,
  input: Record<string, unknown>
) {
  const operation = input.operation;
  const fields =
    operation === "save"
      ? ["listId", "name", "members"]
      : operation === "create"
        ? ["name"]
        : operation === "rename"
          ? ["listId", "name"]
          : operation === "members"
            ? ["listId", "members"]
            : operation === "delete"
              ? ["listId"]
              : operation === "recover"
                ? []
                : null;
  if (!fields)
    throw new PortalError(400, "Choose a supported private list change.");
  socialInput(input, ["operation", "expectedVersion", "mutationId", ...fields]);
  const name = ["create", "rename", "save"].includes(String(operation))
    ? followingListName(input.name)
    : null;
  const members = ["members", "save"].includes(String(operation))
    ? followingListEntries(input.members)
    : null;
  if (fields.includes("listId") && !followingListReference(input.listId))
    throw new PortalError(400, "Choose one of your private lists.");
  let actor = "";
  const result = await socialCommand(
    db,
    token,
    "following-lists",
    input,
    async (tx, ownerId) => {
      const old = await tx.socialPreferences.findUnique({
        where: { ownerId },
        select: followingListsSelect
      });
      expected(input.expectedVersion, old?.followingListsVersion ?? 0);
      if (old?.followingListsRecoveryRequired && operation !== "recover")
        throw new PortalError(
          409,
          "Review and reset your private lists after recovery before editing them."
        );
      if (operation === "recover" && !old?.followingListsRecoveryRequired)
        throw new PortalError(
          409,
          "Your private lists do not need recovery. Reload your current lists."
        );
      const value = storedFollowingLists(old?.followingLists);
      const list = fields.includes("listId")
        ? value.lists.find((l) => l.id === input.listId)
        : null;
      if (fields.includes("listId") && !list)
        throw new PortalError(404, "This private list is unavailable.");
      if (
        name &&
        value.lists.some(
          (l) =>
            l.id !== list?.id &&
            l.name.toLocaleLowerCase("en-US") ===
              name.toLocaleLowerCase("en-US")
        )
      )
        throw new PortalError(
          409,
          "You already have a private list with that name."
        );
      let id = list?.id ?? ownerId;
      if (operation === "create") {
        if (value.lists.length >= FOLLOWING_LIST_LIMIT)
          throw new PortalError(
            409,
            "You can keep up to 20 private following lists."
          );
        id = randomUUID();
        value.lists.push({ id, name: name!, members: [] });
      } else if (operation === "rename") list!.name = name!;
      else if (operation === "members" || operation === "save") {
        const available = await currentFollowingListMembers(
          tx,
          await postContext(tx, ownerId),
          members!
        );
        if (available.length !== members!.length)
          throw new PortalError(
            409,
            "One of these follows changed. Refresh your followed accounts, then review and save the list."
          );
        list!.members = members!;
        if (name) list!.name = name;
      } else if (operation === "delete") {
        value.lists = value.lists.filter((l) => l.id !== list!.id);
        // Preserve a deleted selection as a tombstone until a deliberate new choice.
      } else {
        value.lists = [];
        value.selectedId = null;
      }
      const data = value as unknown as Prisma.InputJsonObject;
      const row = await tx.socialPreferences.upsert({
        where: { ownerId },
        create: { ownerId, followingLists: data, followingListsVersion: 1 },
        update: {
          followingLists: data,
          followingListsVersion: { increment: 1 },
          followingListsRecoveryRequired: false
        },
        select: { followingListsVersion: true }
      });
      await recordDiscoveryControl(
        tx,
        "FOLLOWING_LISTS",
        ownerId,
        ownerId,
        row.followingListsVersion
      );
      return {
        id,
        version: row.followingListsVersion,
        message:
          operation === "delete"
            ? "Private list deleted. Your follows are unchanged."
            : operation === "recover"
              ? "Private lists reset. Your follows are unchanged. Choose a list or All following when you are ready."
              : "Private following list saved."
      };
    },
    async (_tx, ownerId) => {
      actor = ownerId;
    }
  );
  if (!(await protectDiscoveryRecovery(db, actor)))
    throw new PortalError(
      503,
      "Your list change is saved; protected recovery needs confirmation. Retry the same change."
    );
  return result;
}
