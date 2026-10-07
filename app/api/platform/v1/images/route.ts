import { prisma } from "@/lib/prisma";
import { handleNativeImageRequest } from "@/lib/platform/native-media-boundary";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const handle = (request: Request) => handleNativeImageRequest(prisma, request);
export { handle as GET, handle as POST, handle as DELETE };
