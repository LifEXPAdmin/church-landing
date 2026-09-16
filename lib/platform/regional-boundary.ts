import type { PrismaClient } from "@prisma/client";
import { requestSessionToken } from "./account-boundary";
import { readAccountSession } from "./accounts";
import { PortalError } from "./portal-policy";
import {
  socialError,
  socialHeaders,
  socialWriteInput
} from "./social-boundary";
import {
  readRegionalPreferences,
  saveRegionalPreferences
} from "./regional-preferences";

export async function handleRegionalRequest(
  db: PrismaClient,
  request: Request
) {
  try {
    const token = requestSessionToken(request),
      owner = request.headers.get("x-expected-account");
    if (new URL(request.url).search || !owner)
      throw new PortalError(
        400,
        "Reload this account's date and time formats before continuing."
      );
    if ((await readAccountSession(db, token))?.id !== owner)
      throw new PortalError(
        401,
        "Your sign-in changed. Reload before continuing."
      );
    if (request.method === "GET")
      return Response.json(await readRegionalPreferences(db, token), {
        headers: socialHeaders
      });
    const { input } = await socialWriteInput(
      db,
      request,
      "regional-preferences"
    );
    return Response.json(await saveRegionalPreferences(db, token, input), {
      headers: socialHeaders
    });
  } catch (error) {
    const response = socialError(error);
    for (const [key, value] of Object.entries(socialHeaders))
      response.headers.set(key, value);
    return response;
  }
}
