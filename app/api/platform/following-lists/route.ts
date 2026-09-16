import { prisma } from "@/lib/prisma";
import { requestSessionToken } from "@/lib/platform/account-boundary";
import {
  socialError,
  socialHeaders,
  socialWriteInput
} from "@/lib/platform/social-boundary";
import { PortalError } from "@/lib/platform/portal-policy";
import {
  readFollowingLists,
  readFollowingListChoice,
  followingListCommand
} from "@/lib/platform/following-lists";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const query = new URL(request.url).searchParams;
    if (
      query.has("view") &&
      (query.get("view") !== "feed" || [...query].length !== 1)
    )
      throw new PortalError(
        400,
        "Choose the supported private feed choices view."
      );
    const result =
      query.get("view") === "feed"
        ? await readFollowingListChoice(prisma, requestSessionToken(request))
        : await readFollowingLists(
            prisma,
            requestSessionToken(request),
            Object.fromEntries(query)
          );
    const expected = request.headers.get("x-expected-account");
    if (expected && result.ownerId !== expected)
      throw new PortalError(
        401,
        "Your sign-in changed. Reload before continuing."
      );
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
        "Reload to confirm which account will save this private list."
      );
    const { input, token } = await socialWriteInput(
      prisma,
      request,
      "following-lists"
    );
    return Response.json(await followingListCommand(prisma, token, input), {
      headers: socialHeaders
    });
  } catch (error) {
    return socialError(error);
  }
}
