import type { PrismaClient } from "@prisma/client";
import { accountConfig } from "./account-config";
import { readBody, requestSessionToken } from "./account-boundary";
import { readAccountSession } from "./accounts";
import { allowWorkspaceAttempt } from "./account-limits";
import { volunteerCommand } from "./volunteer-commands";
import { readVolunteers } from "./volunteer-reads";
import { PortalError } from "./portal-policy";
import { workspaceError, workspaceHeaders } from "./post-workspace-boundary";
import {
  journalRetentionControls,
  protectedRetentionControls
} from "./retention-controls";
import { scheduleDomainActivity } from "./notification-fanout";

const headers = {
  ...workspaceHeaders,
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  Vary: "Cookie, X-Expected-Account"
};
export async function handleVolunteerRequest(
  db: PrismaClient,
  request: Request,
  afterResponse?: (work: () => Promise<void>) => void
) {
  try {
    const token = requestSessionToken(request),
      q = new URL(request.url).searchParams;
    const expectedOwner = request.headers.get("x-expected-account");
    const actor =
      expectedOwner || request.method !== "GET"
        ? await readAccountSession(db, token)
        : null;
    if (expectedOwner && actor?.id !== expectedOwner)
      throw new PortalError(
        401,
        "Your sign-in changed. Reload before continuing."
      );
    if (request.method === "GET") {
      if (
        [...q.keys()].some(
          (k) =>
            !["view", "id", "postId", "after", "churchId", "q"].includes(k) ||
            q.getAll(k).length !== 1
        )
      )
        throw new PortalError(400, "Use only the supported volunteer filters.");
      return Response.json(
        await readVolunteers(db, token, {
          view: q.get("view") ?? "list",
          id: q.get("id"),
          after: q.get("after"),
          postId: q.get("postId"),
          churchId: q.get("churchId"),
          q: q.get("q")
        }),
        { headers }
      );
    }
    if (request.method !== "POST" || q.size)
      throw new PortalError(405, "Use the current volunteer form.");
    const config = accountConfig();
    if (
      request.headers.get("origin") !== config.origin ||
      request.headers.get("sec-fetch-site") === "cross-site"
    )
      throw new PortalError(
        403,
        "Open the volunteer form on this website and try again."
      );
    if (!actor || actor.id !== expectedOwner)
      throw new PortalError(
        401,
        "Check your current sign-in before saving. Keep your entries."
      );
    if (
      !(await allowWorkspaceAttempt(
        db,
        config.rateSecret + ":volunteer",
        actor.id
      ))
    )
      throw new PortalError(
        429,
        "Too many volunteer changes. Keep your entries and retry in fifteen minutes.",
        900
      );
    let input: Record<string, unknown>;
    try {
      input = await readBody(request, 16384);
    } catch {
      throw new PortalError(
        400,
        "Check the volunteer entries. Nothing has been shortened."
      );
    }
    const result = await volunteerCommand(db, token, input);
    scheduleDomainActivity(db, actor.id, afterResponse);
    let protectedRecovery = false;
    try {
      const controls = await journalRetentionControls(
        db,
        protectedRetentionControls(),
        actor.id,
        request.signal
      );
      protectedRecovery = !controls.failed && !controls.pending;
    } catch {
      /* Durable receipt stays retryable. */
    }
    return Response.json(
      protectedRecovery
        ? result
        : {
            ...result,
            message:
              result.message +
              " Protected recovery is pending and will be retried automatically."
          },
      { status: protectedRecovery ? 200 : 202, headers }
    );
  } catch (error) {
    const response = workspaceError(error);
    for (const [key, value] of Object.entries(headers))
      response.headers.set(key, value);
    return response;
  }
}
