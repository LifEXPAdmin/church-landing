import { prisma } from "@/lib/prisma";
import { handleChurchListingRequest } from "@/lib/platform/church-listing-boundary";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;
export const GET = (request: Request) =>
  handleChurchListingRequest(prisma, request);
export const POST = (request: Request) =>
  handleChurchListingRequest(prisma, request);
