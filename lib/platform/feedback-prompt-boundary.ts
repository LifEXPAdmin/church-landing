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
  readFeedbackPromptState,
  reserveFeedbackPrompt,
  confirmFeedbackPromptShown,
  saveFeedbackPromptPreference,
  protectFeedbackPromptPreferences
} from "./feedback-prompts";
export async function handleFeedbackPromptRequest(
  db: PrismaClient,
  request: Request
) {
  try {
    const token = requestSessionToken(request),
      owner = request.headers.get("x-expected-account");
    if (!owner || new URL(request.url).search)
      throw new PortalError(400, "Reload the current feedback preferences.");
    if ((await readAccountSession(db, token))?.id !== owner)
      throw new PortalError(
        401,
        "Your sign-in changed. Reload before continuing."
      );
    if (request.method === "GET")
      return Response.json(await readFeedbackPromptState(db, token), {
        headers: socialHeaders
      });
    const { input } = await socialWriteInput(db, request, "feedback-prompt");
    const result =
      input.operation === "reserve"
        ? await reserveFeedbackPrompt(db, token, input)
        : input.operation === "shown"
          ? await confirmFeedbackPromptShown(db, token, input)
          : await saveFeedbackPromptPreference(db, token, input);
    if (input.operation !== "reserve")
      await protectFeedbackPromptPreferences(db, owner);
    return Response.json(result, { headers: socialHeaders });
  } catch (error) {
    const response = socialError(error);
    for (const [name, value] of Object.entries(socialHeaders))
      response.headers.set(name, value);
    return response;
  }
}
