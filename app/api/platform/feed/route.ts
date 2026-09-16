import { prisma } from "@/lib/prisma";
import {
  socialWriteInput,
  socialHeaders,
  socialError
} from "@/lib/platform/social-boundary";
import { saveFeedPreference } from "@/lib/platform/feed-preferences";
import { PortalError } from "@/lib/platform/portal-policy";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    const { input, token } = await socialWriteInput(
      prisma,
      request,
      "feed-choice"
    );
    if (
      input.followingListId !== undefined &&
      !request.headers.get("x-expected-account")
    )
      throw new PortalError(
        401,
        "Reload to confirm which account will choose this private list."
      );
    return Response.json(await saveFeedPreference(prisma, token, input), {
      headers: socialHeaders
    });
  } catch (error) {
    return socialError(error);
  }
}
