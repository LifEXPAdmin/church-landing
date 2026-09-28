import type { PrismaClient } from "@prisma/client";
import { requestSessionToken } from "./account-boundary";
import {
  socialError,
  socialHeaders,
  socialWriteInput
} from "./social-boundary";
import { artistRead } from "./artist-reads";
import { artistCommand } from "./artist-commands";
import { PortalError } from "./portal-policy";
export async function handleArtistRequest(db: PrismaClient, request: Request) {
  try {
    if (request.method === "GET")
      return Response.json(
        await artistRead(
          db,
          requestSessionToken(request),
          new URL(request.url).searchParams,
          request.headers.get("x-expected-account")
        ),
        { headers: socialHeaders }
      );
    if (request.method !== "POST")
      throw new PortalError(405, "Use the artist form to save changes.");
    if (!request.headers.get("x-expected-account"))
      throw new PortalError(401, "Reload the artist studio before saving.");
    const { input, token } = await socialWriteInput(db, request, "artists");
    return Response.json(await artistCommand(db, token, input), {
      headers: socialHeaders
    });
  } catch (e) {
    return socialError(e);
  }
}
