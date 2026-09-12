import type { PrismaClient } from "@prisma/client";
import { accountConfig } from "./account-config";
import { allowWorkspaceAttempt } from "./account-limits";
import { requestSessionToken, readBody } from "./account-boundary";
import { readAccountSession } from "./accounts";
import { AccountError } from "./account-error";
import { PortalError } from "./portal-policy";
import { postWorkspaceCommand, readPostWorkspace } from "./post-workspace";

export const workspaceHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow",
  Vary: "Cookie"
};
export function workspaceError(error: unknown) {
  const status =
    error instanceof PortalError
      ? error.status
      : error instanceof AccountError && error.code === "session"
        ? 401
        : 503;
  return Response.json(
    {
      message:
        error instanceof PortalError
          ? error.message
          : status === 401
            ? "Sign in to continue. Keep your unsaved entries."
            : "This work could not be loaded or saved. Keep your entries and try again."
    },
    { status, headers: workspaceHeaders }
  );
}
export async function handlePostWorkspaceRequest(
  db: PrismaClient,
  request: Request
) {
  try {
    const token = requestSessionToken(request),
      q = new URL(request.url).searchParams;
    if (request.method === "GET")
      return Response.json(
        await readPostWorkspace(db, token, {
          view: q.get("view") ?? "drafts",
          id: q.get("id"),
          postId: q.get("postId"),
          collectionId: q.get("collectionId"),
          after: q.get("after")
        }),
        { headers: workspaceHeaders }
      );
    if (request.method !== "POST")
      throw new PortalError(405, "Use the workspace form.");
    const config = accountConfig();
    if (
      request.headers.get("origin") !== config.origin ||
      request.headers.get("sec-fetch-site") === "cross-site"
    )
      throw new PortalError(
        403,
        "Open this form on the website and try again."
      );
    const actor = await readAccountSession(db, token);
    if (!actor)
      throw new PortalError(
        401,
        "Sign in to continue. Keep your unsaved entries."
      );
    const expectedAccount = request.headers.get("x-expected-account");
    if (expectedAccount && expectedAccount !== actor.id)
      throw new PortalError(
        401,
        "Your sign-in changed. Reload before continuing."
      );
    let input: Record<string, unknown>;
    try {
      input = await readBody(request, 65536);
    } catch {
      throw new PortalError(
        400,
        "Check these entries. Nothing has been shortened."
      );
    }
    if (!(await allowWorkspaceAttempt(db, config.rateSecret, actor.id)))
      throw new PortalError(
        429,
        "Too many saves. Keep your entries and retry in 15 minutes."
      );
    return Response.json(await postWorkspaceCommand(db, token, input), {
      headers: workspaceHeaders
    });
  } catch (error) {
    return workspaceError(error);
  }
}
