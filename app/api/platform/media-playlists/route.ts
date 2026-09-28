import { prisma } from "@/lib/prisma";
import { handleMediaPlaylistRequest } from "@/lib/platform/media-playlist-boundary";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = (request: Request) =>
  handleMediaPlaylistRequest(prisma, request);
export const POST = GET;
