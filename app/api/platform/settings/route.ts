import { prisma } from "@/lib/prisma";
import { requestSessionToken } from "@/lib/platform/account-boundary";
import { socialHeaders, socialError } from "@/lib/platform/social-boundary";
import { readSettingsContext } from "@/lib/platform/settings-context";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    return Response.json(
      await readSettingsContext(
        prisma,
        requestSessionToken(request),
        request.headers.get("x-expected-account")
      ),
      { headers: socialHeaders }
    );
  } catch (error) {
    return socialError(error);
  }
}
export function POST() {
  return Response.json(
    { message: "Use the setting's existing form to save a change." },
    { status: 405, headers: { ...socialHeaders, Allow: "GET" } }
  );
}
