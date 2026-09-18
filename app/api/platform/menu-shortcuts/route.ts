import { prisma } from "@/lib/prisma";
import { handleMenuShortcutsRequest } from "@/lib/platform/menu-shortcuts-boundary";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;
export const GET = (request: Request) =>
  handleMenuShortcutsRequest(prisma, request);
export const POST = (request: Request) =>
  handleMenuShortcutsRequest(prisma, request);
