import { prisma } from "@/lib/prisma";
import { requestSessionToken } from "@/lib/platform/account-boundary";
import { readAccountSession } from "@/lib/platform/accounts";
import {
  socialError,
  socialHeaders,
  socialWriteInput
} from "@/lib/platform/social-boundary";
import {
  getDiscoveryPreferences,
  saveDiscoveryPreferences
} from "@/lib/platform/discovery-preferences";
import {
  getDiscoveryPlace,
  discoveryPlaceLabel,
  searchDiscoveryPlaces
} from "@/lib/platform/discovery-places";
import { PortalError } from "@/lib/platform/portal-policy";
import { protectDiscoveryRecovery } from "@/lib/platform/discovery-recovery";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const token = requestSessionToken(request),
      expected = request.headers.get("x-expected-account"),
      q = new URL(request.url).searchParams;
    if (expected && (await readAccountSession(prisma, token))?.id !== expected)
      throw new PortalError(
        401,
        "Your sign-in changed. Reload before continuing."
      );
    let result;
    if (q.get("view") === "places")
      result = await searchDiscoveryPlaces(q.get("country"), q.get("q"));
    else if (q.get("view") === "place") {
      const place = await getDiscoveryPlace(
        q.get("country"),
        Number(q.get("id"))
      );
      result = {
        place: place
          ? {
              id: place.id,
              country: place.country,
              label: discoveryPlaceLabel(place)
            }
          : null
      };
    } else if (!q.get("view") || q.get("view") === "preferences")
      result = await getDiscoveryPreferences(prisma, token);
    else throw new PortalError(400, "Choose a supported discovery view.");
    return Response.json(result, { headers: socialHeaders });
  } catch (error) {
    return socialError(error);
  }
}
export async function POST(request: Request) {
  try {
    if (!request.headers.get("x-expected-account"))
      throw new PortalError(
        401,
        "Reload to confirm which account will save these choices."
      );
    const { input, token } = await socialWriteInput(
      prisma,
      request,
      "discovery-preferences"
    );
    const result = await saveDiscoveryPreferences(prisma, token, input),
      protectedRecovery = await protectDiscoveryRecovery(
        prisma,
        result.id,
        request.signal
      );
    return Response.json(
      protectedRecovery
        ? result
        : {
            ...result,
            message:
              result.message +
              " Protected recovery is pending and will be retried automatically."
          },
      { status: protectedRecovery ? 200 : 202, headers: socialHeaders }
    );
  } catch (error) {
    return socialError(error);
  }
}
