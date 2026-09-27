import type { PrismaClient } from "@prisma/client";
import { requestSessionToken } from "./account-boundary";
import {
  socialError,
  socialHeaders,
  socialWriteInput
} from "./social-boundary";
import { mediaCatalogRead } from "./media-catalog-reads";
import { mediaCatalogCommand } from "./media-catalog-commands";
import { PortalError } from "./portal-policy";
export async function handleMediaCatalogRequest(
  db: PrismaClient,
  request: Request
) {
  try {
    if (request.method === "GET")
      return Response.json(
        await mediaCatalogRead(
          db,
          requestSessionToken(request),
          new URL(request.url).searchParams,
          request.headers.get("x-expected-account")
        ),
        { headers: socialHeaders }
      );
    if (request.method !== "POST")
      throw new PortalError(405, "Use the media form to save changes.");
    if (!request.headers.get("x-expected-account"))
      throw new PortalError(401, "Reload your media studio before saving.");
    const { input, token } = await socialWriteInput(
      db,
      request,
      "media-catalog"
    );
    return Response.json(await mediaCatalogCommand(db, token, input), {
      headers: socialHeaders
    });
  } catch (error) {
    return socialError(error);
  }
}
