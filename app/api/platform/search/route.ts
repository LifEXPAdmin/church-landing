import { prisma } from "@/lib/prisma";
import { requestSessionToken } from "@/lib/platform/account-boundary";
import {
  communitySearch,
  searchUrlInput
} from "@/lib/platform/community-search";
import {
  workspaceError,
  workspaceHeaders
} from "@/lib/platform/post-workspace-boundary";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const q = new URL(request.url).searchParams;
    return Response.json(
      await communitySearch(
        prisma,
        requestSessionToken(request),
        searchUrlInput(q),
        request.headers.get("X-Expected-Account") ?? undefined
      ),
      { headers: { ...workspaceHeaders, Vary: "Cookie, X-Expected-Account" } }
    );
  } catch (error) {
    return workspaceError(error);
  }
}
