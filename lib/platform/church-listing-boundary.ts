import type { PrismaClient } from "@prisma/client";
import { accountConfig } from "./account-config";
import { allowAccountAttempt } from "./account-limits";
import { requestSessionToken, readBody } from "./account-boundary";
import { readAccountSession } from "./accounts";
import { PortalError } from "./portal";
import { churchListingCommand, getChurchListings } from "./church-listings";

const headers = {
  "Cache-Control": "private, no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow",
  Vary: "Cookie"
};
export async function handleChurchListingRequest(
  db: PrismaClient,
  request: Request
) {
  try {
    const token = requestSessionToken(request);
    if (request.method === "GET") {
      const url = new URL(request.url);
      const id = url.searchParams.get("id") ?? undefined;
      const cursor = url.searchParams.get("cursor") ?? undefined;
      if (id && !/^[a-zA-Z0-9_-]{1,100}$/.test(id))
        throw new PortalError(400, "Check the listing link.");
      if (cursor && !/^[a-zA-Z0-9_-]{1,100}$/.test(cursor))
        throw new PortalError(400, "Check the listing link.");
      return Response.json(
        await getChurchListings(
          db,
          token,
          id,
          url.searchParams.get("review") === "1",
          cursor
        ),
        { headers }
      );
    }
    if (request.method !== "POST")
      return Response.json(
        { message: "Use the listing form." },
        { status: 405, headers }
      );
    const config = accountConfig();
    if (
      request.headers.get("origin") !== config.origin ||
      request.headers.get("sec-fetch-site") === "cross-site"
    )
      throw new PortalError(
        403,
        "Open the listing form on this website and try again."
      );
    let input: Record<string, unknown>;
    try {
      input = await readBody(request);
    } catch {
      throw new PortalError(400, "Check the listing fields.");
    }
    if (typeof input.operation !== "string" || input.operation.length > 30)
      throw new PortalError(400, "Choose a listing action.");
    const actor = await readAccountSession(db, token);
    if (!actor) throw new PortalError(401, "Sign in to continue.");
    const ip = process.env.VERCEL
      ? (request.headers.get("x-real-ip") ?? "unknown").slice(0, 64)
      : "local";
    if (
      !(await allowAccountAttempt(
        db,
        config.rateSecret + ":church-listings",
        input.operation,
        ip,
        actor.id
      ))
    )
      throw new PortalError(
        429,
        "Too many changes. Wait 15 minutes and try again."
      );
    return Response.json(await churchListingCommand(db, token, input), {
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
          "The listing service could not load or save this information. Please try again."
      },
      { status: 503, headers }
    );
  }
}
