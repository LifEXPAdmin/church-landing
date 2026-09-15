import { prisma } from "@/lib/prisma";
import { handleMeasurementRequest } from "@/lib/platform/measurement-boundary";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;
export const GET = (request: Request) =>
  handleMeasurementRequest(prisma, request);
export const POST = (request: Request) =>
  handleMeasurementRequest(prisma, request);
