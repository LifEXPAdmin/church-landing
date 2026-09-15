import { prisma } from "@/lib/prisma";
import { handleFeedbackRequest } from "@/lib/platform/feedback-boundary";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;
export const GET = (request: Request) => handleFeedbackRequest(prisma, request);
export const POST = (request: Request) =>
  handleFeedbackRequest(prisma, request);
