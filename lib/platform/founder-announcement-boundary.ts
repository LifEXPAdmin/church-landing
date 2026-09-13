import type { PrismaClient } from "@prisma/client";
import { requestSessionToken } from "./account-boundary";
import {
  socialWriteInput,
  socialError,
  socialHeaders
} from "./social-boundary";
import {
  founderAnnouncementCommand,
  readFounderAnnouncements
} from "./founder-announcements";
export async function handleFounderAnnouncementRequest(
  db: PrismaClient,
  request: Request,
  afterSend?: (id: string) => void
) {
  try {
    if (request.method === "GET")
      return Response.json(
        await readFounderAnnouncements(
          db,
          requestSessionToken(request),
          Object.fromEntries(new URL(request.url).searchParams)
        ),
        { headers: socialHeaders }
      );
    const { input, token } = await socialWriteInput(
      db,
      request,
      "founder-announcement"
    );
    const result = await founderAnnouncementCommand(db, token, input);
    if (input.operation === "send") {
      // A post-response scheduling failure must not disguise a committed send.
      try {
        afterSend?.(result.id);
      } catch {
        console.error("founder_announcement_handoff_incomplete");
      }
    }
    return Response.json(result, { headers: socialHeaders });
  } catch (error) {
    return socialError(error);
  }
}
