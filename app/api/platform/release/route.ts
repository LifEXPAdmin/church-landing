import {
  releaseMetadata,
  currentRelease
} from "@/lib/platform/release-content";
import { publicReleaseId } from "@/lib/platform/install-policy";
export const dynamic = "force-dynamic";
export function GET() {
  return Response.json(
    {
      release: publicReleaseId(process.env.VERCEL_GIT_COMMIT_SHA),
      product: releaseMetadata(
        publicReleaseId(process.env.VERCEL_GIT_COMMIT_SHA)
      ),
      notes: publicReleaseId(process.env.VERCEL_GIT_COMMIT_SHA)
        ? currentRelease
        : null
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "X-Robots-Tag": "noindex, nofollow"
      }
    }
  );
}
