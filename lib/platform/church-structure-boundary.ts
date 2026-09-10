import type { PrismaClient } from "@prisma/client";
import { accountConfig } from "./account-config";
import { allowAccountAttempt } from "./account-limits";
import { requestSessionToken, readBody } from "./account-boundary";
import { readAccountSession } from "./accounts";
import { PortalError } from "./portal";
import { churchStructureCommand, getChurchStructure } from "./church-structure";

const headers = {
  "Cache-Control": "private, no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow",
  Vary: "Cookie"
};
export async function handleChurchStructureRequest(
  db: PrismaClient,
  request: Request
) {
  try {
    const token = requestSessionToken(request);
    if (request.method === "GET") {
      const url = new URL(request.url);
      const view = url.searchParams.get("view") ?? "structure";
      if (
        ![
          "overview",
          "structure",
          "responsibilities",
          "access",
          "person"
        ].includes(view)
      )
        throw new PortalError(400, "Choose a church view.");
      return Response.json(
        await getChurchStructure(db, token, {
          churchId: url.searchParams.get("churchId") ?? "",
          view: view as import("./church-structure-types").StructureView,
          positionId: url.searchParams.get("positionId") ?? undefined,
          connectionId: url.searchParams.get("connectionId") ?? undefined,
          query: url.searchParams.get("q") ?? undefined,
          cursor: url.searchParams.get("cursor") ?? undefined,
          candidateCursor: url.searchParams.get("candidateCursor") ?? undefined
        }),
        { headers }
      );
    }
    if (request.method !== "POST")
      return Response.json(
        { message: "Use the church structure form." },
        { status: 405, headers }
      );
    const config = accountConfig();
    if (
      request.headers.get("origin") !== config.origin ||
      request.headers.get("sec-fetch-site") === "cross-site"
    )
      throw new PortalError(
        403,
        "Open the church structure form on this website and try again."
      );
    let input: Record<string, unknown>;
    try {
      input = await readBody(request);
    } catch {
      throw new PortalError(400, "Check the church structure fields.");
    }
    if (typeof input.operation !== "string" || input.operation.length > 30)
      throw new PortalError(400, "Choose a church structure action.");
    const actor = await readAccountSession(db, token);
    if (!actor) throw new PortalError(401, "Sign in to continue.");
    const ip = process.env.VERCEL
      ? (request.headers.get("x-real-ip") ?? "unknown").slice(0, 64)
      : "local";
    if (
      !(await allowAccountAttempt(
        db,
        config.rateSecret + ":church-structure",
        input.operation,
        ip,
        actor.id
      ))
    )
      throw new PortalError(
        429,
        "Too many changes. Wait 15 minutes and try again."
      );
    return Response.json(await churchStructureCommand(db, token, input), {
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
          "The church structure service could not load or save this information. Please try again."
      },
      { status: 503, headers }
    );
  }
}
