import { postField, postId } from "./post-input";
import { PortalError } from "./portal-policy";
import { socialInput } from "./social-operations";

import {
  GROUP_SCHEMA,
  groupKinds,
  groupFormats,
  groupJoinPolicies
} from "./group-options";
export {
  GROUP_SCHEMA,
  groupKinds,
  groupFormats,
  groupJoinPolicies,
  groupCategories
} from "./group-options";
export function groupChoice<T extends string>(
  value: unknown,
  values: Record<T, unknown>
): T {
  if (typeof value !== "string" || !Object.hasOwn(values, value))
    throw new PortalError(400, "Choose a supported group option.");
  return value as T;
}
export function groupBoolean(value: unknown) {
  if (typeof value !== "boolean")
    throw new PortalError(400, "Choose each group option explicitly.");
  return value;
}
export function groupSlug(value: unknown) {
  if (
    typeof value !== "string" ||
    value.length < 3 ||
    value.length > 60 ||
    ["new", "mine", "manage", "invitations", "following"].includes(value) ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)
  )
    throw new PortalError(
      400,
      "Use a group address of 3 to 60 lowercase letters, numbers and single hyphens."
    );
  return value;
}
export function groupIdentity(schema: unknown, value: unknown) {
  if (
    schema !== GROUP_SCHEMA ||
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  )
    throw new PortalError(
      400,
      "Reload the current group form. Keep your entries."
    );
  const f = value as Record<string, unknown>;
  const keys = [
    "name",
    "purpose",
    "rules",
    "kind",
    "discovery",
    "joinPolicy",
    "format",
    "area",
    "topic",
    "churchId"
  ];
  socialInput(f, keys);
  if (keys.some((k) => !Object.hasOwn(f, k)))
    throw new PortalError(400, "Keep every field from the current group form.");
  const name = postField(f.name, 80, 3)
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim();
  if (name.length < 3 || name.length > 80)
    throw new PortalError(400, "Use a group name of 3 to 80 characters.");
  const kind = groupChoice(f.kind, groupKinds),
    discovery = groupChoice(f.discovery, { LISTED: true, UNLISTED: true }),
    joinPolicy = groupChoice(f.joinPolicy, groupJoinPolicies),
    churchId = f.churchId === null ? null : postId(f.churchId);
  if ((kind === "CHURCH_LIFE" || kind === "MINISTRY_TEAM") !== !!churchId)
    throw new PortalError(
      400,
      "Church life groups and ministry teams require an explicitly permitted church. Other groups do not appoint church duties."
    );
  if (discovery === "UNLISTED" && joinPolicy !== "INVITE_ONLY")
    throw new PortalError(400, "Unlisted groups require named invitations.");
  if (
    kind === "PRIVATE_COHORT" &&
    (discovery !== "UNLISTED" || joinPolicy !== "INVITE_ONLY")
  )
    throw new PortalError(
      400,
      "Private cohorts use unlisted discovery and named invitations."
    );
  return {
    name,
    nameKey: name.toLowerCase(),
    purpose: postField(f.purpose, 2000, 3),
    rules: postField(f.rules, 4000, 3),
    kind,
    discovery,
    joinPolicy,
    format: groupChoice(f.format, groupFormats),
    area: postField(f.area, 100),
    topic: postField(f.topic, 80),
    churchId
  };
}
export const groupMemberKey = (groupId: string, userId: string) => ({
  groupId_userId: { groupId, userId }
});
