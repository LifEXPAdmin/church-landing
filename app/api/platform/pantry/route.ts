import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { handlePantryRequest } from "@/lib/platform/pantry-boundary";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = (request: Request) => handlePantryRequest(prisma, request, after);
export const POST = GET;
