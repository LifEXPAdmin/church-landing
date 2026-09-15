import type { PrismaClient } from "@prisma/client";
import { requestSessionToken } from "./account-boundary";
import { readAccountSession } from "./accounts";
import { PortalError } from "./portal-policy";
import {
  socialError,
  socialHeaders,
  socialWriteInput
} from "./social-boundary";
import {
  readFeedbackIdeas,
  feedbackIdeaInterestCommand
} from "./feedback-ideas";
import { protectFeedbackPromptPreferences } from "./feedback-prompts";

export async function handleFeedbackIdeasRequest(
  db: PrismaClient,
  request: Request
) {
  try {
    const token = requestSessionToken(request),
      owner = request.headers.get("x-expected-account");
    if (owner && (await readAccountSession(db, token))?.id !== owner)
      throw new PortalError(
        401,
        "Your sign-in changed. Reload these ideas before continuing."
      );
    const q = new URL(request.url).searchParams;
    if (request.method === "GET") {
      if (
        [...q.keys()].some(
          (k) => !["id", "q", "page"].includes(k) || q.getAll(k).length !== 1
        )
      )
        throw new PortalError(400, "Use each supported idea filter once.");
      return Response.json(
        await readFeedbackIdeas(db, token, Object.fromEntries(q)),
        { headers: socialHeaders }
      );
    }
    if (!owner || q.size)
      throw new PortalError(
        400,
        "Reload this account's idea form before saving."
      );
    const { input } = await socialWriteInput(db, request, "feedback-ideas");
    const result = await feedbackIdeaInterestCommand(db, token, input);
    if (input.operation === "idea-subscribe")
      await protectFeedbackPromptPreferences(db, owner);
    return Response.json(result, { headers: socialHeaders });
  } catch (error) {
    const response = socialError(error);
    for (const [key, value] of Object.entries(socialHeaders))
      response.headers.set(key, value);
    return response;
  }
}
