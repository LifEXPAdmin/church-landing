import { getPost } from "./post-reads";
import type { PrismaClient } from "@prisma/client";
import { requestSessionToken } from "./account-boundary";
import {
  socialWriteInput,
  socialError,
  socialHeaders
} from "./social-boundary";
import { readRepostOptions, repostCommand } from "./reposts";
export async function handleRepostRequest(db: PrismaClient, request: Request) {
  try {
    if (request.method === "GET") {
      const q = new URL(request.url).searchParams;
      if (q.get("view") === "entry") {
        const entry = await getPost(
          db,
          requestSessionToken(request),
          q.get("id") ?? ""
        );
        return Response.json(
          {
            available: !!entry?.repost?.source,
            entryVersion: entry?.version ?? null,
            sourceVersion: entry?.repost?.source?.version ?? null
          },
          { headers: socialHeaders }
        );
      }
      return Response.json(
        await readRepostOptions(db, requestSessionToken(request), {
          sourceId: q.get("sourceId"),
          authorChurchId: q.get("authorChurchId"),
          audienceChurchId: q.get("audienceChurchId"),
          audience: q.get("audience") ?? undefined
        }),
        { headers: socialHeaders }
      );
    }
    const { input, token } = await socialWriteInput(db, request, "reposts");
    return Response.json(await repostCommand(db, token, input), {
      headers: socialHeaders
    });
  } catch (error) {
    return socialError(error);
  }
}
