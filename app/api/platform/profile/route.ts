import { prisma } from "@/lib/prisma";
import { getProfileEditor, getMemberProfile } from "@/lib/platform/profiles";
import { profileSnapshot } from "@/lib/platform/profile-snapshot";
import { readerDate, readerId } from "@/lib/platform/reader-navigation";
import { requestSessionToken } from "@/lib/platform/account-boundary";
import { PortalError } from "@/lib/platform/portal";
import { withOwnedSession } from "@/lib/platform/account-sessions";
import { AccountError } from "@/lib/platform/accounts";
import { getProfileEventChoice } from "@/lib/platform/profile-events";
import {
  getProfileFeaturedChoices,
  getProfileFeaturedResources
} from "@/lib/platform/profile-featured";
import {
  getProfilePhotoChoices,
  getProfilePhotoSection
} from "@/lib/platform/profile-photo-sections";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const headers = {
    "Cache-Control": "private, no-store, max-age=0",
    "CDN-Cache-Control": "no-store",
    "Vercel-CDN-Cache-Control": "no-store",
    Vary: "Cookie",
    "X-Robots-Tag": "noindex, nofollow"
  };
  try {
    const expectedOwner = request.headers.get("x-expected-account");
    if (expectedOwner)
      await withOwnedSession(
        prisma,
        requestSessionToken(request),
        async (_, current) => {
          if (current.userId !== expectedOwner)
            throw new PortalError(
              401,
              "Your sign-in changed. Reload before continuing."
            );
        }
      );
    const query = new URL(request.url).searchParams;
    if (
      query.get("view") === "photo-choices" ||
      query.get("view") === "photo-section"
    ) {
      const choosing = query.get("view") === "photo-choices";
      const allowed = choosing
        ? ["view", "after", "ids"]
        : ["view", "username", "preview"];
      if (
        [...query.keys()].some(
          (key) => !allowed.includes(key) || query.getAll(key).length !== 1
        )
      )
        throw new PortalError(400, "Choose supported profile photo fields.");
      if (choosing) {
        let ids: unknown;
        if (query.has("ids")) {
          try {
            const raw = query.get("ids")!;
            if (raw.length > 1024) throw Error();
            ids = JSON.parse(raw);
          } catch {
            throw new PortalError(
              400,
              "Choose valid saved profile photo references."
            );
          }
        }
        return Response.json(
          await getProfilePhotoChoices(
            prisma,
            requestSessionToken(request),
            {
              ...(query.has("after") ? { after: query.get("after") } : {}),
              ...(query.has("ids") ? { ids } : {})
            },
            expectedOwner
          ),
          { headers }
        );
      }
      const username = query.get("username") ?? "";
      if (
        !/^[A-Za-z0-9_]{3,24}$/.test(username) ||
        (query.has("preview") && query.get("preview") !== "member")
      )
        throw new PortalError(400, "Choose an available member profile.");
      return Response.json(
        await getProfilePhotoSection(
          prisma,
          requestSessionToken(request),
          username,
          query.get("preview") === "member",
          expectedOwner
        ),
        { headers }
      );
    }
    if (
      query.get("view") === "featured-choice" ||
      query.get("view") === "featured-resources"
    ) {
      const choosing = query.get("view") === "featured-choice";
      const allowed = choosing
        ? ["view", "references"]
        : ["view", "username", "preview"];
      if (
        [...query.keys()].some(
          (key) => !allowed.includes(key) || query.getAll(key).length !== 1
        )
      )
        throw new PortalError(400, "Choose supported profile resource fields.");
      if (choosing) {
        const raw = query.get("references") ?? "";
        let input: unknown;
        try {
          if (raw.length > 2048) throw Error();
          input = JSON.parse(raw);
        } catch {
          throw new PortalError(
            400,
            "Choose valid featured resource references."
          );
        }
        return Response.json(
          await getProfileFeaturedChoices(
            prisma,
            requestSessionToken(request),
            input,
            expectedOwner
          ),
          { headers }
        );
      }
      const username = query.get("username") ?? "";
      if (
        !/^[A-Za-z0-9_]{3,24}$/.test(username) ||
        (query.has("preview") && query.get("preview") !== "member")
      )
        throw new PortalError(400, "Choose an available member profile.");
      return Response.json(
        await getProfileFeaturedResources(
          prisma,
          requestSessionToken(request),
          username,
          query.get("preview") === "member",
          expectedOwner
        ),
        { headers }
      );
    }
    if (query.get("view") === "event-choice")
      return Response.json(
        await getProfileEventChoice(
          prisma,
          requestSessionToken(request),
          query.get("occurrenceId"),
          expectedOwner
        ),
        { headers }
      );
    return Response.json(
      query.get("view") === "member-snapshot"
        ? profileSnapshot(
            await getMemberProfile(
              prisma,
              requestSessionToken(request),
              (query.get("username") ?? "").slice(0, 100),
              {
                before: readerDate(query.get("before")),
                cursor: readerId(query.get("cursor")),
                preview:
                  query.get("preview") === "member" ? "member" : undefined,
                photos: query.get("tab") === "photos"
              }
            )
          )
        : query.get("view") === "identity"
          ? await withOwnedSession(
              prisma,
              requestSessionToken(request),
              async (_, session) => ({ id: session.userId })
            )
          : await getProfileEditor(prisma, requestSessionToken(request)),
      { headers }
    );
  } catch (error) {
    return Response.json(
      {
        message:
          error instanceof PortalError
            ? error.message
            : "Your profile could not be loaded. Try again."
      },
      {
        status:
          error instanceof AccountError && error.code === "session"
            ? 401
            : error instanceof PortalError
              ? error.status
              : 503,
        headers
      }
    );
  }
}
