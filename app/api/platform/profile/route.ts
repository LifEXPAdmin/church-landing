import { prisma } from "@/lib/prisma";
import { getProfileEditor } from "@/lib/platform/profiles";
import { requestSessionToken } from "@/lib/platform/account-boundary";
import { PortalError } from "@/lib/platform/portal";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const headers = {
    "Cache-Control": "private, no-store, max-age=0",
    "CDN-Cache-Control": "no-store",
    "Vercel-CDN-Cache-Control": "no-store",
    Vary: "Cookie",
    "X-Robots-Tag": "noindex, nofollow"
  };
  try {
    return Response.json(
      await getProfileEditor(prisma, requestSessionToken(request)),
      { headers }
    );
  } catch (error) {
    return Response.json(
      {
        message:
          error instanceof PortalError
            ? error.message
            : "Your profile could not be loaded. Try again."
      },
      { status: error instanceof PortalError ? error.status : 503, headers }
    );
  }
}
