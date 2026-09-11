import { prisma } from "@/lib/prisma";
import { requestSessionToken } from "@/lib/platform/account-boundary";
import { socialError, socialHeaders } from "@/lib/platform/social-boundary";
import { readChurchImages } from "@/lib/platform/church-images";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    return Response.json(
      await readChurchImages(
        prisma,
        requestSessionToken(request),
        new URL(request.url).searchParams.get("churchId")
      ),
      { headers: socialHeaders }
    );
  } catch (e) {
    return socialError(e);
  }
}
