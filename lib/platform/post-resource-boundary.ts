import type { PrismaClient } from "@prisma/client";
import { requestSessionToken } from "./account-boundary";
import { withPostRead } from "./post-access";
import { PortalError } from "./portal-policy";
import { socialError, socialHeaders } from "./social-boundary";
import { postResourceReferences } from "./post-resource-input";
import {
  resolvePostResourcesIn,
  resourceCards
} from "./post-resource-attachments";

/** An owner-pinned preview of exact references, never an unbounded source search. */
export async function handlePostResourceRequest(
  db: PrismaClient,
  request: Request
) {
  try {
    if (request.method !== "GET")
      throw new PortalError(405, "Use the resource card chooser.");
    const query = new URL(request.url).searchParams;
    if (
      [...query.keys()].some((k) => k !== "references") ||
      query.getAll("references").length !== 1
    )
      throw new PortalError(400, "Choose supported resource card fields.");
    const raw = query.get("references") ?? "";
    if (raw.length > 1024)
      throw new PortalError(400, "Choose up to three resource cards.");
    let input: unknown;
    try {
      input = JSON.parse(raw);
    } catch {
      throw new PortalError(400, "Choose valid resource references.");
    }
    const references = postResourceReferences(input);
    const expected = request.headers.get("x-expected-account");
    const result = await withPostRead(
      db,
      requestSessionToken(request),
      async (tx, context) => {
        if (!expected || context.actorId !== expected)
          throw new PortalError(
            401,
            "Your sign-in changed. Reload before choosing resource cards."
          );
        if (!context.eligible)
          throw new PortalError(
            403,
            "A verified adult account is required to choose resource cards."
          );
        return {
          resources: resourceCards(
            references,
            await resolvePostResourcesIn(tx, context, references)
          )
        };
      }
    );
    return Response.json(result, { headers: socialHeaders });
  } catch (error) {
    return socialError(error);
  }
}
