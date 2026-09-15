import type { PrismaClient } from "@prisma/client";
import { requestSessionToken } from "./account-boundary";
import { readAccountSession } from "./accounts";
import { PortalError } from "./portal-policy";
import {
  socialError,
  socialHeaders,
  socialWriteInput
} from "./social-boundary";
import { readSupport, supportCommand, SupportError } from "./support";
import { removeFeedbackUpload } from "./feedback-attachments";
import { protectAdminCaseChanges } from "./admin-privacy";
import { protectFeedbackPromptPreferences } from "./feedback-prompts";

/** The permanent feedback surface uses native private case transactions. */
export async function handleFeedbackRequest(
  db: PrismaClient,
  request: Request
) {
  try {
    const token = requestSessionToken(request);
    const owner = request.headers.get("x-expected-account");
    if (!owner)
      throw new PortalError(400, "Reload your feedback before continuing.");
    if ((await readAccountSession(db, token))?.id !== owner)
      throw new PortalError(
        401,
        "Your sign-in changed. Keep your unsent feedback and reload."
      );
    const q = new URL(request.url).searchParams;
    if (request.method === "GET") {
      if (
        [...q.keys()].some((k) => !["view", "caseId", "page"].includes(k)) ||
        [...q.values()].some((v) => v.length > 100)
      )
        throw new PortalError(400, "Check this feedback link.");
      const view = q.get("view") ?? "requests";
      if (view === "attachments") {
        const snapshot = await readSupport(db, token, "detail", {
          caseId: q.get("caseId") ?? undefined
        });
        if (!snapshot.detail?.feedback)
          throw new PortalError(404, "Feedback images are unavailable.");
        return Response.json(
          { images: snapshot.detail.feedback.attachments },
          { headers: socialHeaders }
        );
      }
      if (view !== "new" && view !== "requests" && view !== "detail")
        throw new PortalError(400, "Choose a supported feedback view.");
      return Response.json(
        await readSupport(db, token, view, {
          caseId: q.get("caseId") ?? undefined,
          page: q.get("page"),
          feedbackOnly: true
        }),
        { headers: socialHeaders }
      );
    }
    if (q.size)
      throw new PortalError(400, "Use the feedback form to save a change.");
    const { input } = await socialWriteInput(db, request, "feedback");
    if (input.operation === "feedback-remove-upload")
      return Response.json(await removeFeedbackUpload(db, token, input), {
        headers: socialHeaders
      });
    if (
      input.operation !== "feedback-create" &&
      input.operation !== "feedback-choices" &&
      input.operation !== "feedback-remove-attachment"
    )
      throw new PortalError(
        400,
        "Use the private receipt for case conversation or status actions."
      );
    const result = await supportCommand(db, token, input);
    if (input.operation === "feedback-create")
      await protectFeedbackPromptPreferences(db, owner);
    if (
      input.operation === "feedback-remove-attachment" ||
      input.operation === "feedback-choices"
    )
      await protectAdminCaseChanges(db, [result.caseId]);
    return Response.json(result, {
      headers: socialHeaders
    });
  } catch (error) {
    const response =
      error instanceof SupportError
        ? Response.json({ message: error.message }, { status: error.status })
        : socialError(error);
    for (const [name, value] of Object.entries(socialHeaders))
      response.headers.set(name, value);
    return response;
  }
}
