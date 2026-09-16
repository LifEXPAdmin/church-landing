import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleExchangeRequest } from "@/lib/platform/exchange-boundary";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = (request: Request) =>
  handleExchangeRequest(prisma, request, after);
export const POST = GET;
