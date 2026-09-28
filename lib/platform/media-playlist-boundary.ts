import type { PrismaClient } from "@prisma/client";
import { requestSessionToken } from "./account-boundary";
import {
  socialError,
  socialHeaders,
  socialWriteInput
} from "./social-boundary";
import { PortalError } from "./portal-policy";
import { mediaPlaylistRead } from "./media-playlist-reads";
import { mediaPlaylistCommand } from "./media-playlist-commands";

export async function handleMediaPlaylistRequest(
  db: PrismaClient,
  request: Request
) {
  try {
    if (request.method === "GET")
      return Response.json(
        await mediaPlaylistRead(
          db,
          requestSessionToken(request),
          new URL(request.url).searchParams,
          request.headers.get("x-expected-account")
        ),
        { headers: socialHeaders }
      );
    if (request.method !== "POST")
      throw new PortalError(405, "Use the playlist controls to save changes.");
    if (!request.headers.get("x-expected-account"))
      throw new PortalError(401, "Reload your media workspace before saving.");
    const { input, token } = await socialWriteInput(
      db,
      request,
      "media-playlists"
    );
    return Response.json(await mediaPlaylistCommand(db, token, input), {
      headers: socialHeaders
    });
  } catch (error) {
    return socialError(error);
  }
}
