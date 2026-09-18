import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleGroupRequest } from "@/lib/platform/group-boundary";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = (request: Request) => handleGroupRequest(prisma, request, after);
export const POST = GET;
