import { publicReleaseId } from "@/lib/platform/install-policy";
export const dynamic = "force-dynamic";
export function GET() {
  return Response.json(
    { release: publicReleaseId(process.env.VERCEL_GIT_COMMIT_SHA) },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "X-Robots-Tag": "noindex, nofollow"
      }
    }
  );
}
