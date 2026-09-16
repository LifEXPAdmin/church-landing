import type { PrismaClient } from "@prisma/client";
import { requestSessionToken } from "./account-boundary";
import { withAccountRead } from "./account-read";
import { eligibleWhere, PortalError } from "./portal-policy";
import {
  socialError,
  socialHeaders,
  socialWriteInput
} from "./social-boundary";
import { nearbyDiscoveryPlaces } from "./discovery-places";

async function deviceOwner(db: PrismaClient, token: unknown, expected: string) {
  return withAccountRead(db, token, async (tx, owner) => {
    if (!owner || owner !== expected)
      throw new PortalError(
        401,
        "Your sign-in changed. Reload before continuing."
      );
    if (
      !(await tx.platformUser.findFirst({
        where: { id: owner, ...eligibleWhere },
        select: { id: true }
      }))
    )
      throw new PortalError(
        403,
        "Verify your email and confirm adult eligibility to use device location. You can still choose an area manually."
      );
    return owner;
  });
}

export async function handleDiscoveryDeviceRequest(
  db: PrismaClient,
  request: Request
) {
  try {
    const expected = request.headers.get("x-expected-account");
    if (new URL(request.url).search || !expected)
      throw new PortalError(
        400,
        "Open your discovery settings to request approximate area suggestions."
      );
    const token = requestSessionToken(request);
    if (request.method === "GET") {
      const ownerId = await deviceOwner(db, token, expected);
      return Response.json(
        { ownerId, available: true },
        { headers: socialHeaders }
      );
    }
    const { input } = await socialWriteInput(
      db,
      request,
      "discovery-device-area"
    );
    const ownerId = await deviceOwner(db, token, expected);
    // This lookup creates no preference, command receipt, coordinate record or journal.
    const places = await nearbyDiscoveryPlaces(input);
    return Response.json({ ownerId, places }, { headers: socialHeaders });
  } catch (error) {
    const response = socialError(error);
    for (const [key, value] of Object.entries(socialHeaders))
      response.headers.set(key, value);
    return response;
  }
}
