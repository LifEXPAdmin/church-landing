import { prisma } from "@/lib/prisma";
import { handleReactionPreferences } from "@/lib/platform/reaction-preferences-boundary";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = (request: Request) =>
  handleReactionPreferences(prisma, request);
export const POST = GET;
