import { prisma } from "@/lib/prisma";
import {
  socialWriteInput,
  socialHeaders,
  socialError
} from "@/lib/platform/social-boundary";
import { saveFeedPreference } from "@/lib/platform/feed-preferences";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    const { input, token } = await socialWriteInput(
      prisma,
      request,
      "feed-choice"
    );
    return Response.json(await saveFeedPreference(prisma, token, input), {
      headers: socialHeaders
    });
  } catch (error) {
    return socialError(error);
  }
}
