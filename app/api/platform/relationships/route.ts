import { prisma } from "@/lib/prisma";
import { requestSessionToken } from "@/lib/platform/account-boundary";
import {
  socialWriteInput,
  socialError,
  socialHeaders
} from "@/lib/platform/social-boundary";
import {
  readRelationships,
  relationshipCommand
} from "@/lib/platform/relationships";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const q = new URL(request.url).searchParams;
    return Response.json(
      await readRelationships(prisma, requestSessionToken(request), {
        view: q.get("view") ?? "controls",
        kind: q.get("kind"),
        targetId: q.get("targetId"),
        after: q.get("after"),
        q: q.get("q")
      }),
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
      "relationships"
    );
    return Response.json(await relationshipCommand(prisma, token, input), {
      headers: socialHeaders
    });
  } catch (e) {
    return socialError(e);
  }
}
