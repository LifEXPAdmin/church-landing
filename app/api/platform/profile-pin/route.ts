import { prisma } from "@/lib/prisma";
import { readProfilePin, saveProfilePin } from "@/lib/platform/profile-pin";
import { requestSessionToken } from "@/lib/platform/account-boundary";
import { readAccountSession } from "@/lib/platform/accounts";
import { PortalError } from "@/lib/platform/portal-policy";
import {
  socialWriteInput,
  socialHeaders,
  socialError
} from "@/lib/platform/social-boundary";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function pinAccount(request: Request) {
  const token = requestSessionToken(request);
  const actor = await readAccountSession(prisma, token);
  if (!actor || request.headers.get("x-expected-account") !== actor.id)
    throw new PortalError(
      401,
      "Your sign-in changed. Reload before managing a profile pin."
    );
  return token;
}
export async function GET(request: Request) {
  try {
    const token = await pinAccount(request);
    return Response.json(
      await readProfilePin(
        prisma,
        token,
        new URL(request.url).searchParams.get("postId")
      ),
      { headers: socialHeaders }
    );
  } catch (error) {
    return socialError(error);
  }
}
export async function POST(request: Request) {
  try {
    await pinAccount(request);
    const { input, token } = await socialWriteInput(
      prisma,
      request,
      "profile-pin"
    );
    return Response.json(await saveProfilePin(prisma, token, input), {
      headers: socialHeaders
    });
  } catch (error) {
    return socialError(error);
  }
}
