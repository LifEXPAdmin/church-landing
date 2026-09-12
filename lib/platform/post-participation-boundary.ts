import type { PrismaClient } from "@prisma/client";
import { accountConfig } from "./account-config";
import { allowAccountAttempt } from "./account-limits";
import { requestSessionToken, readBody } from "./account-boundary";
import { readAccountSession } from "./accounts";
import { AccountError } from "./account-error";
import { PortalError } from "./portal-policy";
import { participationCommand } from "./post-participation";
import {
  getPostParticipation,
  getVolunteerRoster
} from "./post-participation-reads";
const headers = {
  "Cache-Control": "private, no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow",
  Vary: "Cookie"
};
export async function handleParticipationRequest(
  db: PrismaClient,
  request: Request
) {
  try {
    const token = requestSessionToken(request),
      url = new URL(request.url);
    if (request.method === "GET") {
      const result =
        url.searchParams.get("view") === "roster"
          ? await getVolunteerRoster(
              db,
              token,
              url.searchParams.get("slotId") ?? "",
              url.searchParams.get("cursor") ?? undefined
            )
          : await getPostParticipation(
              db,
              token,
              url.searchParams.get("postId") ?? ""
            );
      return Response.json(result, { headers });
    }
    if (request.method !== "POST")
      throw new PortalError(405, "Use the participation form.");
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
      input = await readBody(request, 16384);
    } catch {
      throw new PortalError(400, "Check the participation fields.");
    }
    if (typeof input.operation !== "string" || input.operation.length > 30)
      throw new PortalError(400, "Choose a participation action.");
    const actor = await readAccountSession(db, token);
    if (!actor) throw new PortalError(401, "Sign in to continue.");
    const ip = process.env.VERCEL
      ? (request.headers.get("x-real-ip") ?? "unknown").slice(0, 64)
      : "local";
    if (
      !(await allowAccountAttempt(
        db,
        config.rateSecret + ":participation",
        input.operation,
        ip,
        actor.id
      ))
    )
      throw new PortalError(
        429,
        "Too many changes. Wait 15 minutes and try again."
      );
    return Response.json(await participationCommand(db, token, input), {
      headers
    });
  } catch (error) {
    if (error instanceof PortalError)
      return Response.json(
        { message: error.message },
        { status: error.status, headers }
      );
    if (error instanceof AccountError && error.code === "session")
      return Response.json(
        { message: "Sign in to continue." },
        { status: 401, headers }
      );
    return Response.json(
      {
        message:
          "Participation could not be loaded or saved. Your form is still here; refresh to check whether a submission was saved."
      },
      { status: 503, headers }
    );
  }
}
