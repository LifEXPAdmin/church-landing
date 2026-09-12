import { prisma } from "@/lib/prisma";
import { requestSessionToken } from "@/lib/platform/account-boundary";
import {
  socialError,
  socialHeaders,
  socialWriteInput
} from "@/lib/platform/social-boundary";
import { postLikeCommand, readPostLike } from "@/lib/platform/post-likes";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    return Response.json(
      await readPostLike(
        prisma,
        requestSessionToken(request),
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
    const { input, token } = await socialWriteInput(
      prisma,
      request,
      "post-likes"
    );
    return Response.json(await postLikeCommand(prisma, token, input), {
      headers: socialHeaders
    });
  } catch (error) {
    return socialError(error);
  }
}
