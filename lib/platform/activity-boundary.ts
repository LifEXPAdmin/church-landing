import type { PrismaClient } from "@prisma/client";
import { requestSessionToken } from "./account-boundary";
import {
  socialError,
  socialHeaders,
  socialWriteInput
} from "./social-boundary";
import { PortalError } from "./portal-policy";
import { activityCommand, openActivity, readActivity } from "./activity";
export async function handleActivityRequest(
  db: PrismaClient,
  request: Request
) {
  try {
    if (request.method === "GET") {
      const query = new URL(request.url).searchParams;
      if (
        [...query.keys()].some(
          (key) => !["view", "category", "cursor", "id"].includes(key)
        ) ||
        [...new Set(query.keys())].some((key) => query.getAll(key).length > 1)
      )
        throw new PortalError(400, "Use a supported activity view.");
      const token = requestSessionToken(request);
      const view = query.get("view") ?? "inbox";
      if (
        (view === "inbox" && query.has("id")) ||
        (view === "open" && (query.has("category") || query.has("cursor")))
      )
        throw new PortalError(400, "Use a supported activity view.");
      const result =
        view === "inbox"
          ? await readActivity(db, token, {
              category: query.get("category"),
              cursor: query.get("cursor")
            })
          : view === "open"
            ? await openActivity(db, token, query.get("id"))
            : null;
      if (!result) throw new PortalError(400, "Use a supported activity view.");
      return Response.json(result, { headers: socialHeaders });
    }
    const { input, token } = await socialWriteInput(db, request, "activity");
    return Response.json(await activityCommand(db, token, input), {
      headers: socialHeaders
    });
  } catch (error) {
    return socialError(error);
  }
}
