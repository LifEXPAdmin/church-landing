import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleNativeSessionRequest } from "@/lib/platform/native-session-boundary";
import { dispatchPrivilegedNotices } from "@/lib/platform/privileged-auth-notices";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const GET = (request: Request) =>
  handleNativeSessionRequest(prisma, request, "authenticator");
export const POST = (request: Request) =>
  handleNativeSessionRequest(prisma, request, "authenticator", (userId) => {
    after(() => dispatchPrivilegedNotices(prisma, userId));
  });
export const PUT = POST;
export const PATCH = POST;
export const DELETE = POST;
export const OPTIONS = POST;
export const HEAD = POST;
