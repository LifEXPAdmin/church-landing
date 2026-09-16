import { prisma } from "@/lib/prisma";
import { handleDiscoveryDeviceRequest } from "@/lib/platform/discovery-device-boundary";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = (request: Request) =>
  handleDiscoveryDeviceRequest(prisma, request);
export const POST = GET;
