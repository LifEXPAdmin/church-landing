import type { PrismaClient } from "@prisma/client";
import { requestSessionToken } from "./account-boundary";
import { PortalError } from "./portal-policy";
import {
  socialError,
  socialHeaders,
  socialWriteInput
} from "./social-boundary";
import {
  readReactionPreferences,
  saveReactionPreferences
} from "./reaction-preferences";
const headers = { ...socialHeaders, Vary: "Cookie, X-Expected-Account" };
export async function handleReactionPreferences(
  db: PrismaClient,
  request: Request
) {
  try {
    const owner = request.headers.get("x-expected-account");
    if (!owner || new URL(request.url).search)
      throw new PortalError(
        400,
        "Open your reaction-count choices before continuing."
      );
    const token = requestSessionToken(request);
    if (request.method === "GET")
      return Response.json(await readReactionPreferences(db, token, owner), {
        headers
      });
    const { input } = await socialWriteInput(
      db,
      request,
      "reaction-count-preferences"
    );
    return Response.json(
      await saveReactionPreferences(db, token, input, owner),
      { headers }
    );
  } catch (error) {
    const response = socialError(error);
    for (const [key, value] of Object.entries(headers))
      response.headers.set(key, value);
    return response;
  }
}
