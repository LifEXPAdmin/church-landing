import { prisma } from "@/lib/prisma";
import { requestSessionToken } from "@/lib/platform/account-boundary";
import { communitySearch } from "@/lib/platform/community-search";
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
      await communitySearch(prisma, requestSessionToken(request), {
        q: q.get("q"),
        kind: q.get("kind") ?? "posts",
        after: q.get("after"),
        topic: q.get("topic"),
        churchId: q.get("churchId")
      }),
      { headers: workspaceHeaders }
    );
  } catch (error) {
    return workspaceError(error);
  }
}
