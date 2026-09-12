import { prisma } from "@/lib/prisma";
import { requestSessionToken } from "@/lib/platform/account-boundary";
import {
  socialWriteInput,
  socialError,
  socialHeaders
} from "@/lib/platform/social-boundary";
import {
  friendInvitationCommand,
  readFriendInvitations
} from "@/lib/platform/friend-invitations";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    return Response.json(
      await readFriendInvitations(prisma, requestSessionToken(request)),
      { headers: socialHeaders }
    );
  } catch (e) {
    return socialError(e);
  }
}
export async function POST(request: Request) {
  try {
    const { input, token } = await socialWriteInput(
      prisma,
      request,
      "friend-invitations"
    );
    return Response.json(await friendInvitationCommand(prisma, token, input), {
      headers: socialHeaders
    });
  } catch (e) {
    return socialError(e);
  }
}
