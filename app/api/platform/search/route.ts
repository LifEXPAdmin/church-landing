import { prisma } from "@/lib/prisma";
import { requestSessionToken } from "@/lib/platform/account-boundary";
import { communitySearch } from "@/lib/platform/community-search";
import {
  workspaceError,
  workspaceHeaders
} from "@/lib/platform/post-workspace-boundary";
import { PortalError } from "@/lib/platform/portal-policy";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const q = new URL(request.url).searchParams;
    const allowed = [
      "q",
      "kind",
      "after",
      "topic",
      "churchId",
      "country",
      "placeId",
      "radiusKm"
    ];
    if (
      [...q.keys()].some(
        (key) => !allowed.includes(key) || q.getAll(key).length !== 1
      )
    )
      throw new PortalError(400, "Use each supported search filter once.");
    return Response.json(
      await communitySearch(
        prisma,
        requestSessionToken(request),
        {
          q: q.get("q"),
          kind: q.get("kind") ?? "posts",
          after: q.get("after"),
          topic: q.get("topic"),
          churchId: q.get("churchId"),
          country: q.get("country"),
          placeId: q.get("placeId"),
          radiusKm: q.get("radiusKm")
        },
        request.headers.get("X-Expected-Account") ?? undefined
      ),
      { headers: { ...workspaceHeaders, Vary: "Cookie, X-Expected-Account" } }
    );
  } catch (error) {
    return workspaceError(error);
  }
}
