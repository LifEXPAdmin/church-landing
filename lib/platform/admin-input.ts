import { PortalError } from "./portal-policy";
import { postField, postId } from "./post-input";
import {
  adminPriorities,
  adminQueueStates,
  adminSourceTypes,
  defaultAdminFilters,
  type AdminQueueFilters,
  type AdminSource,
  type AdminSourceType
} from "./admin-types";

export function adminFields(input: Record<string, unknown>, fields: string[]) {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.keys(input).some((k) => !fields.includes(k))
  )
    throw new PortalError(
      400,
      "Use the supported admin fields. Nothing was shortened."
    );
}
function choice<T extends string>(
  value: unknown,
  choices: readonly T[],
  fallback: T
): T {
  if (value == null || value === "") return fallback;
  if (typeof value !== "string" || !choices.includes(value as T))
    throw new PortalError(400, "Choose a supported admin filter.");
  return value as T;
}
export function adminFilters(
  input: Record<string, unknown> = {}
): AdminQueueFilters {
  adminFields(input, Object.keys(defaultAdminFilters));
  if (
    input.due != null &&
    ![true, false, "1", "0", ""].includes(input.due as never)
  )
    throw new PortalError(400, "Choose a supported reminder filter.");
  return {
    type: choice(
      input.type,
      ["ALL", "SUPPORT", "REPORT", "CLAIM", "BUG", "SUGGESTION", "FEEDBACK"],
      "ALL"
    ),
    state: choice(
      input.state,
      Object.keys(adminQueueStates) as AdminQueueFilters["state"][],
      "OPEN"
    ),
    priority: choice(
      input.priority,
      [
        "ALL",
        ...Object.keys(adminPriorities)
      ] as AdminQueueFilters["priority"][],
      "ALL"
    ),
    owner: choice(input.owner, ["ALL", "ME", "UNASSIGNED"], "ALL"),
    age: choice(input.age, ["ALL", "1", "7", "30"], "ALL"),
    churchId: input.churchId ? postId(input.churchId) : "",
    topicId: input.topicId ? postId(input.topicId) : "",
    q: postField(input.q ?? "", 100),
    tag: postField(input.tag ?? "", 30).toLowerCase(),
    due: input.due === true || input.due === "1"
  };
}
export function adminSource(input: {
  sourceType?: unknown;
  sourceId?: unknown;
}): AdminSource {
  if (
    typeof input.sourceType !== "string" ||
    !Object.hasOwn(adminSourceTypes, input.sourceType)
  )
    throw new PortalError(400, "Choose a supported request type.");
  return {
    sourceType: input.sourceType as AdminSourceType,
    sourceId: postId(input.sourceId)
  };
}
export type AdminCursor = {
  at: string;
  id: string;
  type: AdminSourceType;
  asOf: string;
};
export function adminCursor(value: unknown): AdminCursor | null {
  if (value == null || value === "") return null;
  try {
    if (
      typeof value !== "string" ||
      value.length > 600 ||
      !/^[A-Za-z0-9_-]+$/.test(value)
    )
      throw Error();
    const raw = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    adminFields(raw, ["at", "id", "type", "asOf"]);
    const source = adminSource({ sourceType: raw.type, sourceId: raw.id });
    for (const date of [raw.at, raw.asOf])
      if (
        typeof date !== "string" ||
        !Number.isFinite(Date.parse(date)) ||
        new Date(date).toISOString() !== date
      )
        throw Error();
    if (raw.at > raw.asOf || Date.parse(raw.asOf) > Date.now() + 60000)
      throw Error();
    return {
      at: raw.at,
      id: source.sourceId,
      type: source.sourceType,
      asOf: raw.asOf
    };
  } catch {
    throw new PortalError(
      400,
      "This queue continuation is invalid. Open the filtered queue again."
    );
  }
}
export function encodeAdminCursor(cursor: AdminCursor) {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}
export function adminRequestKey(value: unknown) {
  if (
    typeof value !== "string" ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
      value
    )
  )
    throw new PortalError(400, "Refresh this action before saving.");
  return value;
}
export function adminTags(value: unknown) {
  if (!Array.isArray(value) || value.length > 8)
    throw new PortalError(400, "Choose up to eight short internal tags.");
  return [
    ...new Set(
      value.map((v) => {
        const tag = postField(v, 30, 1).toLowerCase();
        if (!/^[a-z0-9][a-z0-9 -]*$/.test(tag))
          throw new PortalError(
            400,
            "Use ordinary letters, numbers, spaces or hyphens in tags."
          );
        return tag;
      })
    )
  ];
}
export function adminEngineeringUrl(value: unknown) {
  const raw = postField(value ?? "", 500);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.hash ||
      url.search ||
      url.hostname !== "github.com" ||
      !/^\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/(issues|pull)\/\d+$/.test(
        url.pathname
      )
    )
      throw Error();
    return url.href;
  } catch {
    throw new PortalError(
      400,
      "Use the HTTPS link to an existing GitHub issue or pull request, without private tokens."
    );
  }
}
