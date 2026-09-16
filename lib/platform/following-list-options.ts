import { PortalError } from "./portal-policy";

export const FOLLOWING_LIST_LIMIT = 20;
export const FOLLOWING_LIST_MEMBER_LIMIT = 100;
export type FollowingListEntry = {
  kind: "person" | "church";
  targetId: string;
  relationshipId: string;
  since: string | null;
};
export type FollowingList = {
  id: string;
  name: string;
  members: FollowingListEntry[];
};
export type FollowingLists = {
  lists: FollowingList[];
  selectedId: string | null;
};
export const followingListReference = (v: unknown): v is string =>
  typeof v === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(v);
export function followingListName(value: unknown) {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.trim().length > 60 ||
    /[\u0000-\u001f\u007f]/.test(value)
  )
    throw new PortalError(
      400,
      "Name your private list using 1 to 60 characters on one line."
    );
  return value.trim();
}
export function followingListEntries(value: unknown): FollowingListEntry[] {
  if (!Array.isArray(value) || value.length > FOLLOWING_LIST_MEMBER_LIMIT)
    throw new PortalError(
      400,
      "Choose up to 100 currently followed people or churches."
    );
  const keys = new Set<string>();
  return value.map((entry) => {
    if (
      !entry ||
      typeof entry !== "object" ||
      Array.isArray(entry) ||
      Object.keys(entry).sort().join() !==
        "kind,relationshipId,since,targetId" ||
      !["person", "church"].includes(entry.kind) ||
      !followingListReference(entry.targetId) ||
      !followingListReference(entry.relationshipId) ||
      (entry.kind === "person"
        ? entry.since !== null
        : entry.since !== null &&
          (typeof entry.since !== "string" ||
            !Number.isFinite(Date.parse(entry.since)) ||
            new Date(entry.since).toISOString() !== entry.since))
    )
      throw new PortalError(
        400,
        "Choose a current entry from your followed accounts or churches."
      );
    const key = entry.kind + ":" + entry.targetId;
    if (keys.has(key))
      throw new PortalError(400, "Include each person or church only once.");
    keys.add(key);
    return {
      kind: entry.kind,
      targetId: entry.targetId,
      relationshipId: entry.relationshipId,
      since: entry.since
    };
  });
}
export function storedFollowingLists(value: unknown): FollowingLists {
  if (value == null) return { lists: [], selectedId: null };
  try {
    const row = value as FollowingLists;
    if (
      !row ||
      typeof row !== "object" ||
      Array.isArray(row) ||
      Object.keys(row).sort().join() !== "lists,selectedId" ||
      !Array.isArray(row.lists) ||
      row.lists.length > FOLLOWING_LIST_LIMIT ||
      (row.selectedId !== null && !followingListReference(row.selectedId))
    )
      throw Error();
    const ids = new Set<string>(),
      names = new Set<string>();
    const lists = row.lists.map((list) => {
      if (
        !list ||
        Object.keys(list).sort().join() !== "id,members,name" ||
        !followingListReference(list.id) ||
        ids.has(list.id)
      )
        throw Error();
      const name = followingListName(list.name);
      if (names.has(name.toLocaleLowerCase("en-US"))) throw Error();
      ids.add(list.id);
      names.add(name.toLocaleLowerCase("en-US"));
      return { id: list.id, name, members: followingListEntries(list.members) };
    });
    return { lists, selectedId: row.selectedId };
  } catch {
    throw new PortalError(
      503,
      "Your private following lists need a storage review. Keep your entries."
    );
  }
}
