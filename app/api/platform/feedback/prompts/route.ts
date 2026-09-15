import { prisma } from "@/lib/prisma";
import { handleFeedbackPromptRequest } from "@/lib/platform/feedback-prompt-boundary";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;
export const GET = (request: Request) =>
  handleFeedbackPromptRequest(prisma, request);
export const POST = GET;
