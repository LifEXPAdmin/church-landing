import { prisma } from "@/lib/prisma";
import { handleArtistRequest } from "@/lib/platform/artist-boundary";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = (request: Request) => handleArtistRequest(prisma, request);
export const POST = GET;
