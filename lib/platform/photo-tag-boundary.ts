import type { PrismaClient } from "@prisma/client";
import { requestSessionToken } from "./account-boundary";
import { PortalError } from "./portal-policy";
import {
  socialError,
  socialHeaders,
  socialWriteInput
} from "./social-boundary";
import { readPhotoTags } from "./photo-tag-reads";
import { photoTagCommand } from "./photo-tags";
import { scheduleDomainActivity } from "./notification-fanout";

export async function handlePhotoTagRequest(
  db: PrismaClient,
  request: Request,
  afterResponse?: (work: () => Promise<void>) => void
) {
  try {
    if (request.method === "GET") {
      const query = new URL(request.url).searchParams,
        view = query.get("view") ?? "inbox";
      const fields: Record<string, string[]> = {
        preferences: [],
        asset: ["assetId"],
        people: ["assetId", "q", "after"],
        inbox: ["id", "scope", "after"],
        profile: ["profileId", "after"]
      };
      if (
        !Object.hasOwn(fields, view) ||
        [...query.keys()].some(
          (k) => k !== "view" && !fields[view].includes(k)
        ) ||
        [...new Set(query.keys())].some((k) => query.getAll(k).length !== 1) ||
        (query.has("id") && (query.has("scope") || query.has("after")))
      )
        throw new PortalError(400, "Choose a supported photo tag view.");
      const result = await readPhotoTags(db, requestSessionToken(request), {
        view,
        ...Object.fromEntries([...query].filter(([key]) => key !== "view"))
      });
      if (request.headers.get("x-expected-account") !== result.ownerId)
        throw new PortalError(401, "Your sign-in changed. Reload photo tags.");
      return Response.json(result, { headers: socialHeaders });
    }
    const { input, token } = await socialWriteInput(db, request, "photo-tags");
    if (
      !request.headers.get("x-expected-account") ||
      request.headers.get("x-expected-account") !== input.ownerId
    )
      throw new PortalError(401, "Reload photo tags before saving.");
    const result = await photoTagCommand(db, token, input);
    scheduleDomainActivity(db, input.ownerId as string, afterResponse);
    return Response.json(result, { headers: socialHeaders });
  } catch (error) {
    return socialError(error);
  }
}
