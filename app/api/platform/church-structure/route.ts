import { prisma } from "@/lib/prisma";
import { handleChurchStructureRequest } from "@/lib/platform/church-structure-boundary";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;
export const GET = (request: Request) =>
  handleChurchStructureRequest(prisma, request);
export const POST = (request: Request) =>
  handleChurchStructureRequest(prisma, request);
