import { prisma } from "@/lib/prisma";
import { handleChurchClaimRequest } from "@/lib/platform/church-claim-boundary";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;
export const GET = (request: Request) =>
  handleChurchClaimRequest(prisma, request);
export const POST = (request: Request) =>
  handleChurchClaimRequest(prisma, request);
