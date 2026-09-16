import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { handlePhotoTagRequest } from "@/lib/platform/photo-tag-boundary";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = (request: Request) => handlePhotoTagRequest(prisma, request);
export const POST = (request: Request) =>
  handlePhotoTagRequest(prisma, request, after);
