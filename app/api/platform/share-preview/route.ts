import { prisma } from "@/lib/prisma";
import {
  publicSharePreview,
  publicPreviewHeaders
} from "@/lib/platform/public-sharing";
import { PortalError } from "@/lib/platform/portal";
import { requestSessionToken } from "@/lib/platform/account-boundary";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const q = new URL(request.url).searchParams;
    return Response.json(
      await publicSharePreview(
        prisma,
        { kind: q.get("kind"), id: q.get("id"), commentId: q.get("commentId") },
        requestSessionToken(request)
      ),
      { headers: publicPreviewHeaders }
    );
  } catch (e) {
    return Response.json(
      {
        message:
          e instanceof PortalError ? e.message : "This preview is unavailable."
      },
      {
        status: e instanceof PortalError ? e.status : 503,
        headers: publicPreviewHeaders
      }
    );
  }
}
