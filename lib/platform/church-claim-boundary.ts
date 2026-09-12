import type { PrismaClient } from "@prisma/client";
import { accountConfig } from "./account-config";
import { allowAccountAttempt } from "./account-limits";
import { requestSessionToken, readBody } from "./account-boundary";
import { readAccountSession } from "./accounts";
import { PortalError } from "./portal-policy";
import { churchClaimCommand, getChurchClaims } from "./church-claims";

const headers = {
  "Cache-Control": "private, no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow",
  Vary: "Cookie"
};
export async function handleChurchClaimRequest(
  db: PrismaClient,
  request: Request
) {
  try {
    const token = requestSessionToken(request);
    if (request.method === "GET") {
      const url = new URL(request.url);
      const id = url.searchParams.get("id") ?? undefined;
      const cursor = url.searchParams.get("cursor") ?? undefined;
      const churchId = url.searchParams.get("churchId") ?? undefined;
      if (churchId && !/^[a-zA-Z0-9_-]{1,100}$/.test(churchId))
        throw new PortalError(400, "Check the church link.");
      if (id && !/^[a-zA-Z0-9_-]{1,100}$/.test(id))
        throw new PortalError(400, "Check the setup link.");
      if (cursor && !/^[a-zA-Z0-9_-]{1,100}$/.test(cursor))
        throw new PortalError(400, "Check the setup link.");
      return Response.json(
        await getChurchClaims(db, token, {
          id,
          cursor,
          review: url.searchParams.get("review") === "1",
          churchId
        }),
        { headers }
      );
    }
    if (request.method !== "POST")
      return Response.json(
        { message: "Use the setup form." },
        { status: 405, headers }
      );
    const config = accountConfig();
    if (
      request.headers.get("origin") !== config.origin ||
      request.headers.get("sec-fetch-site") === "cross-site"
    )
      throw new PortalError(
        403,
        "Open the setup form on this website and try again."
      );
    let input: Record<string, unknown>;
    try {
      input = await readBody(request);
    } catch {
      throw new PortalError(400, "Check the setup fields.");
    }
    if (typeof input.operation !== "string" || input.operation.length > 30)
      throw new PortalError(400, "Choose a setup action.");
    const actor = await readAccountSession(db, token);
    if (!actor) throw new PortalError(401, "Sign in to continue.");
    const ip = process.env.VERCEL
      ? (request.headers.get("x-real-ip") ?? "unknown").slice(0, 64)
      : "local";
    if (
      !(await allowAccountAttempt(
        db,
        config.rateSecret + ":church-claims",
        input.operation,
        ip,
        actor.id
      ))
    )
      throw new PortalError(
        429,
        "Too many changes. Wait 15 minutes and try again."
      );
    return Response.json(await churchClaimCommand(db, token, input), {
      headers
    });
  } catch (error) {
    if (error instanceof PortalError)
      return Response.json(
        { message: error.message },
        { status: error.status, headers }
      );
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "P2002"
    )
      return Response.json(
        {
          message:
            "This submission conflicts with a saved change. Refresh and check its status."
        },
        { status: 409, headers }
      );
    return Response.json(
      {
        message:
          "The setup service could not load or save this information. Please try again."
      },
      { status: 503, headers }
    );
  }
}
