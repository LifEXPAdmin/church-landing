import type { PrismaClient } from "@prisma/client";
import { requestSessionToken } from "./account-boundary";
import { readAccountSession } from "./accounts";
import { PortalError } from "./portal-policy";
import {
  socialError,
  socialHeaders,
  socialWriteInput
} from "./social-boundary";
import { readMenuShortcuts, saveMenuShortcuts } from "./menu-shortcuts";

export async function handleMenuShortcutsRequest(
  db: PrismaClient,
  request: Request
) {
  try {
    const token = requestSessionToken(request),
      owner = request.headers.get("x-expected-account");
    if (
      new URL(request.url).search ||
      !owner ||
      !["GET", "POST"].includes(request.method)
    )
      throw new PortalError(
        400,
        "Reload this account's Menu shortcuts before continuing."
      );
    if ((await readAccountSession(db, token))?.id !== owner)
      throw new PortalError(
        401,
        "Your sign-in changed. Reload before continuing."
      );
    if (request.method === "GET")
      return Response.json(await readMenuShortcuts(db, token), {
        headers: socialHeaders
      });
    const { input } = await socialWriteInput(db, request, "menu-shortcuts");
    return Response.json(await saveMenuShortcuts(db, token, input), {
      headers: socialHeaders
    });
  } catch (error) {
    const response = socialError(error);
    for (const [key, value] of Object.entries(socialHeaders))
      response.headers.set(key, value);
    return response;
  }
}
