import type { PrismaClient } from "@prisma/client";
import { accountConfig } from "./account-config";
import { allowAccountAttempt } from "./account-limits";
import { requestSessionToken, readBody } from "./account-boundary";
import { readAccountSession } from "./accounts";
import { getPortalSnapshot, portalCommand, publicChurches } from "./portal";
import { PortalError } from "./portal-policy";
import type { PortalView } from "./portal-types";
import { churchSearchQuery } from "./church-search";

const headers = {
  "Cache-Control": "private, no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow",
  Vary: "Cookie"
};
export async function handlePortalRequest(db: PrismaClient, request: Request) {
  try {
    const token = requestSessionToken(request);
    if (request.method === "GET") {
      const url = new URL(request.url);
      const view = url.searchParams.get("view") ?? "my-church";
      const query = churchSearchQuery(url.searchParams.get("q"));
      const rawCursor = url.searchParams.get("cursor");
      const cursor =
        rawCursor && /^[a-zA-Z0-9_-]{1,100}$/.test(rawCursor)
          ? rawCursor
          : undefined;
      if (view === "public")
        return Response.json(
          { churches: await publicChurches(db, undefined, cursor, query) },
          { headers }
        );
      if (
        ![
          "discover",
          "my-church",
          "sharing",
          "directory",
          "review",
          "help",
          "operator"
        ].includes(view)
      )
        throw new PortalError(400, "Choose a supported church view.");
      const churchId = url.searchParams.get("churchId") ?? undefined;
      if (churchId && churchId.length > 100)
        throw new PortalError(400, "Check the church link.");
      return Response.json(
        await getPortalSnapshot(
          db,
          token,
          view as PortalView,
          churchId,
          query,
          cursor
        ),
        { headers }
      );
    }
    if (request.method !== "POST")
      return Response.json(
        { message: "Use the church form to continue." },
        { status: 405, headers }
      );
    const config = accountConfig();
    if (
      request.headers.get("origin") !== config.origin ||
      request.headers.get("sec-fetch-site") === "cross-site"
    )
      throw new PortalError(
        403,
        "Open the church form on this website and try again."
      );
    let body: Record<string, unknown>;
    try {
      body = await readBody(request);
    } catch {
      throw new PortalError(400, "Check the fields and try again.");
    }
    const actor = await readAccountSession(db, token);
    if (!actor) throw new PortalError(401, "Sign in to continue.");
    if (typeof body.operation !== "string" || body.operation.length > 40)
      throw new PortalError(400, "Check the church action.");
    const ip = process.env.VERCEL
      ? (request.headers.get("x-real-ip") ?? "unknown").slice(0, 64)
      : "local";
    if (
      !(await allowAccountAttempt(
        db,
        config.rateSecret + ":portal",
        body.operation,
        ip,
        actor.id
      ))
    )
      throw new PortalError(
        429,
        "Too many changes. Wait 15 minutes before trying again."
      );
    const message = await portalCommand(db, token, body);
    return Response.json({ message }, { headers });
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
            "A conflicting record already exists. Refresh and check the current state."
        },
        { status: 409, headers }
      );
    // Never serialize Prisma errors or request bodies containing private contacts.
    return Response.json(
      {
        message:
          "The church service could not load or save this information. Please try again; no empty result is implied."
      },
      { status: 503, headers }
    );
  }
}
