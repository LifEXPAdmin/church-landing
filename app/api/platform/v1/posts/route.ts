import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleNativePostCreateRequest } from "@/lib/platform/native-post-boundary";
import { scheduleDomainActivity } from "@/lib/platform/notification-fanout";
import { schedulePublicationHandoff } from "@/lib/platform/scheduled-publication";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export function POST(request: Request) {
  return handleNativePostCreateRequest(prisma, request, (postId, ownerId) => {
    scheduleDomainActivity(prisma, ownerId, after);
    schedulePublicationHandoff(prisma, ownerId, after, postId);
  });
}
export const GET = POST;
export const PUT = POST;
export const PATCH = POST;
export const DELETE = POST;
export const OPTIONS = POST;
export const HEAD = POST;
