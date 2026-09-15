import { prisma } from "@/lib/prisma";
import { handleFeedbackIdeasRequest } from "@/lib/platform/feedback-idea-boundary";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;
export const GET = (request: Request) =>
  handleFeedbackIdeasRequest(prisma, request);
export const POST = (request: Request) =>
  handleFeedbackIdeasRequest(prisma, request);
