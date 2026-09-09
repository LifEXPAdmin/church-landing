import { handleAccountRequest } from "@/lib/platform/account-boundary";
import { prisma } from "@/lib/prisma";
import { after } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  return handleAccountRequest(prisma, request, after);
}
