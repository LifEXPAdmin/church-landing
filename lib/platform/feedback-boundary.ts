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
    if (
      input.operation !== "feedback-create" &&
      input.operation !== "feedback-choices"
    )
      throw new PortalError(
        400,
        "Use the private receipt for case conversation or status actions."
      );
    return Response.json(await supportCommand(db, token, input), {
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
