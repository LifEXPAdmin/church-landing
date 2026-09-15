import type { PrismaClient } from "@prisma/client";
import { publicSharePreview, publicPreviewHeaders } from "./public-sharing";
import { PortalError } from "./portal-policy";
import { requestSessionToken } from "./account-boundary";

/** JSON and PNG share the same current public projection. Caller-supplied copy,
 * image URLs, dimensions and credentials are never used to generate a card. */
export async function sharePreviewResponse(
  db: PrismaClient,
  request: Request,
  render?: typeof import("./share-card-image").renderShareCard
) {
  const q = new URL(request.url).searchParams;
  const png = q.get("format") === "png";
  try {
    if (q.has("format") && !png)
      throw new PortalError(400, "Choose a supported preview format.");
    const preview =
      png && !q.has("kind") && !q.has("id")
        ? null
        : await publicSharePreview(
            db,
            {
              kind: q.get("kind"),
              id: q.get("id"),
              commentId: q.get("commentId")
            },
            requestSessionToken(request)
          );
    if (!png) return Response.json(preview, { headers: publicPreviewHeaders });
    // Ordinary Copy/Share JSON never loads the native image renderer.
    const { defaultShareCard, renderShareCard } =
      await import("./share-card-image");
    let bytes =
      preview?.available && preview.kind !== "profile"
        ? await (render ?? renderShareCard)({
            title: preview.title,
            description: preview.description,
            variant: preview.kind
          })
        : await defaultShareCard();
    if (preview?.available) {
      // Match revocable media's before/after-I/O boundary. A source may be
      // edited, hidden or blocked while fonts and PNG layers are rendering.
      const current = await publicSharePreview(
        db,
        {
          kind: q.get("kind"),
          id: q.get("id"),
          commentId: q.get("commentId")
        },
        requestSessionToken(request)
      );
      if (JSON.stringify(current) !== JSON.stringify(preview))
        bytes = await defaultShareCard();
    }
    return new Response(new Uint8Array(bytes), {
      headers: {
        ...publicPreviewHeaders,
        "Content-Type": "image/png"
      }
    });
  } catch (error) {
    if (png) {
      // Fail closed to known branding on missing/restricted records, service
      // outages, unsupported fonts or renderer failure. No former public copy
      // survives in a persisted derivative or a resource-keyed memory cache.
      try {
        const { defaultShareCard } = await import("./share-card-image");
        return new Response(new Uint8Array(await defaultShareCard()), {
          headers: { ...publicPreviewHeaders, "Content-Type": "image/png" }
        });
      } catch {
        return new Response(null, {
          status: 307,
          headers: {
            ...publicPreviewHeaders,
            Location: "/brand/share-card.png"
          }
        });
      }
    }
    return Response.json(
      {
        message:
          error instanceof PortalError
            ? error.message
            : "This preview is unavailable."
      },
      {
        status: error instanceof PortalError ? error.status : 503,
        headers: publicPreviewHeaders
      }
    );
  }
}
