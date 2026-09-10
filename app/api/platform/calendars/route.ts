import { prisma } from "@/lib/prisma";
import { handleCalendarRequest } from "@/lib/platform/calendar-boundary";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;
export const GET = (request: Request) => handleCalendarRequest(prisma, request);
export const POST = (request: Request) =>
  handleCalendarRequest(prisma, request);
