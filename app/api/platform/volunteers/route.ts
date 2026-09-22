import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleVolunteerRequest } from "@/lib/platform/volunteer-boundary";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = (request: Request) =>
  handleVolunteerRequest(prisma, request, after);
export const POST = GET;
