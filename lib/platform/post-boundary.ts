import type { PrismaClient } from "@prisma/client";
import { accountConfig } from "./account-config";
import { allowAccountAttempt } from "./account-limits";
import { requestSessionToken, readBody } from "./account-boundary";
import { readAccountSession } from "./accounts";
import { AccountError } from "./account-error";
import { PortalError } from "./portal-policy";
import { postCommand } from "./post-commands";
import { previewPostLink } from "./post-links";
import {
  getPostComposer,
  getPostEditor,
  getPostEventOptions
} from "./post-editor";
const headers = {
  "Cache-Control": "private, no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow",
  Vary: "Cookie"
};
export async function handlePostRequest(db: PrismaClient, request: Request) {
  try {
    const token = requestSessionToken(request),
      url = new URL(request.url);
    if (request.method === "GET") {
      const view = url.searchParams.get("view");
      const result =
        view === "composer"
          ? await getPostComposer(db, token)
          : view === "events"
            ? await getPostEventOptions(
                db,
                token,
                url.searchParams.get("churchId"),
                url.searchParams.get("cursor")
              )
            : await getPostEditor(
                db,
                token,
                url.searchParams.get("postId") ?? ""
              );
      return Response.json(result, { headers });
    }
    if (request.method !== "POST")
      throw new PortalError(405, "Use the publishing form.");
    const config = accountConfig();
    if (
      request.headers.get("origin") !== config.origin ||
      request.headers.get("sec-fetch-site") === "cross-site"
    )
      throw new PortalError(
        403,
        "Open this form on the website and try again."
      );
    let input: Record<string, unknown>;
    try {
      input = await readBody(request, 24576);
    } catch {
      throw new PortalError(
        400,
        "Check the post fields. Your draft has not been shortened."
      );
    }
    if (
      ![
        "create",
        "edit",
        "withdraw",
        "discussion",
        "pin",
        "preview-link"
      ].includes(String(input.operation))
    )
      throw new PortalError(400, "Choose a supported publishing action.");
    if (input.userId !== undefined || input.authorId !== undefined)
      throw new PortalError(
        400,
        "The acting account comes from your current sign-in."
      );
    // Scheduling remains domain-only until durable dispatch is available.
    if (input.scheduleLocal || input.scheduleZone)
      throw new PortalError(
        400,
        "Automatic scheduled publishing is not available yet."
      );
    const actor = await readAccountSession(db, token);
    if (!actor)
      throw new PortalError(
        401,
        "Sign in to continue. Your draft is still here."
      );
    const ip = process.env.VERCEL
      ? (request.headers.get("x-real-ip") ?? "unknown").slice(0, 64)
      : "local";
    if (
      !(await allowAccountAttempt(
        db,
        config.rateSecret +
          (input.operation === "preview-link" ? ":post-previews" : ":posts"),
        input.operation === "preview-link"
          ? "request-preview"
          : String(input.operation),
        ip,
        actor.id
      ))
    )
      throw new PortalError(
        429,
        "Too many changes. Wait 15 minutes and try again. Your draft is still here."
      );
    if (input.operation === "preview-link") {
      const result = await previewPostLink(
        actor.id,
        input.linkUrl,
        undefined,
        request.signal
      );
      const current = await readAccountSession(db, token);
      if (current?.id !== actor.id)
        throw new PortalError(
          401,
          "Sign in to continue. Your draft is still here."
        );
      return Response.json(result, { headers });
    }
    return Response.json(await postCommand(db, token, input), { headers });
  } catch (error) {
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
              ? "Sign in to continue. Your draft is still here."
              : "The post could not be loaded or saved. Your entries are still here; check your connection and try again."
      },
      { status, headers }
    );
  }
}
