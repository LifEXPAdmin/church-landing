import { prisma } from "@/lib/prisma";
import { requestSessionToken } from "@/lib/platform/account-boundary";
import {
  socialError,
  socialHeaders,
  socialWriteInput
} from "@/lib/platform/social-boundary";
import {
  photoAlbumCommand,
  readPhotoAlbums
} from "@/lib/platform/photo-albums";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const query = new URL(request.url).searchParams;
    return Response.json(
      await readPhotoAlbums(prisma, requestSessionToken(request), {
        profileId: query.get("profileId"),
        id: query.get("id"),
        after: query.get("after"),
        edit: query.get("edit"),
        preview: query.get("preview")
      }),
      { headers: socialHeaders }
    );
  } catch (error) {
    return socialError(error);
  }
}
export async function POST(request: Request) {
  try {
    const { token, input } = await socialWriteInput(
      prisma,
      request,
      "photo-albums"
    );
    return Response.json(await photoAlbumCommand(prisma, token, input), {
      headers: socialHeaders
    });
  } catch (error) {
    return socialError(error);
  }
}
