import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { handlePrivilegedAuthentication } from "@/lib/platform/privileged-auth-boundary";
import { dispatchPrivilegedNotices } from "@/lib/platform/privileged-auth-notices";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const GET = (request: Request) => handlePrivilegedAuthentication(prisma, request);
export const POST = (request: Request) => handlePrivilegedAuthentication(prisma, request,
  userId => after(async () => { await dispatchPrivilegedNotices(prisma, userId); }));
