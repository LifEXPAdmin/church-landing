import { prisma } from "@/lib/prisma";
import { requestSessionToken } from "@/lib/platform/account-boundary";
import {
  socialWriteInput,
  socialError,
  socialHeaders
} from "@/lib/platform/social-boundary";
import {
  postGalleryCommand,
  readPostGallery
} from "@/lib/platform/post-gallery";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    return Response.json(
      await readPostGallery(
        prisma,
        requestSessionToken(request),
        new URL(request.url).searchParams.get("postId")
      ),
      { headers: socialHeaders }
    );
  } catch (e) {
    return socialError(e);
  }
}
export async function POST(request: Request) {
  try {
    const { input, token } = await socialWriteInput(prisma, request, "gallery");
    return Response.json(await postGalleryCommand(prisma, token, input), {
      headers: socialHeaders
    });
  } catch (e) {
    return socialError(e);
  }
}
