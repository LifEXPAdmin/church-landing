import { prisma } from "@/lib/prisma";
import { getProfileEditor, getMemberProfile } from "@/lib/platform/profiles";
import { profileSnapshot } from "@/lib/platform/profile-snapshot";
import { readerDate, readerId } from "@/lib/platform/reader-navigation";
import { requestSessionToken } from "@/lib/platform/account-boundary";
import { PortalError } from "@/lib/platform/portal";
import { withOwnedSession } from "@/lib/platform/account-sessions";
import { AccountError } from "@/lib/platform/accounts";
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
    const query = new URL(request.url).searchParams;
    return Response.json(
      query.get("view") === "member-snapshot"
        ? profileSnapshot(
            await getMemberProfile(
              prisma,
              requestSessionToken(request),
              (query.get("username") ?? "").slice(0, 100),
              {
                before: readerDate(query.get("before")),
                cursor: readerId(query.get("cursor")),
                preview:
                  query.get("preview") === "member" ? "member" : undefined,
                photos: query.get("tab") === "photos"
              }
            )
          )
        : query.get("view") === "identity"
          ? await withOwnedSession(
              prisma,
              requestSessionToken(request),
              async (_, session) => ({ id: session.userId })
            )
          : await getProfileEditor(prisma, requestSessionToken(request)),
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
      {
        status:
          error instanceof AccountError && error.code === "session"
            ? 401
            : error instanceof PortalError
              ? error.status
              : 503,
        headers
      }
    );
  }
}
