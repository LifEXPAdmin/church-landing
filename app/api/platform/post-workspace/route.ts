import { prisma } from "@/lib/prisma";
import { handlePostWorkspaceRequest } from "@/lib/platform/post-workspace-boundary";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = (request: Request) =>
  handlePostWorkspaceRequest(prisma, request);
export const POST = GET;
