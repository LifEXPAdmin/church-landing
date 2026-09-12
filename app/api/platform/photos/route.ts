import { prisma } from "@/lib/prisma";
import { requestSessionToken } from "@/lib/platform/account-boundary";
import {
  socialError,
  socialHeaders,
  socialWriteInput
} from "@/lib/platform/social-boundary";
import {
  personalPhotoCommand,
  readPersonalPhotos
} from "@/lib/platform/personal-photos";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const q = new URL(request.url).searchParams;
    return Response.json(
      await readPersonalPhotos(prisma, requestSessionToken(request), {
        profileId: q.get("profileId"),
        view: q.get("view") ?? "all",
        after: q.get("after"),
        id: q.get("id")
      }),
      { headers: socialHeaders }
    );
  } catch (error) {
    return socialError(error);
  }
}
export async function POST(request: Request) {
  try {
    const { token, input } = await socialWriteInput(prisma, request, "photos");
    return Response.json(await personalPhotoCommand(prisma, token, input), {
      headers: socialHeaders
    });
  } catch (error) {
    return socialError(error);
  }
}
