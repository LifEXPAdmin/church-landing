import { after } from "next/server";
import { dispatchNotifications } from "@/lib/platform/notification-queue";
import { prisma } from "@/lib/prisma";
import { requestSessionToken } from "@/lib/platform/account-boundary";
import {
  communityReportCommand,
  readCommunityReports
} from "@/lib/platform/community-reports";
import {
  socialError,
  socialHeaders,
  socialWriteInput
} from "@/lib/platform/social-boundary";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    return Response.json(
      await readCommunityReports(
        prisma,
        requestSessionToken(request),
        Object.fromEntries(new URL(request.url).searchParams)
      ),
      { headers: socialHeaders }
    );
  } catch (error) {
    return socialError(error);
  }
}
export async function POST(request: Request) {
  try {
    const { input, token } = await socialWriteInput(
      prisma,
      request,
      "community-reports"
    );
    const result = await communityReportCommand(prisma, token, input);
    after(async () => {
      await dispatchNotifications(prisma, result.id);
    });
    return Response.json(result, {
      headers: socialHeaders
    });
  } catch (error) {
    return socialError(error);
  }
}
