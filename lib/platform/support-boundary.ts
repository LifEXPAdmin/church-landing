import type { PrismaClient } from "@prisma/client";
import { accountConfig } from "./account-config";
import { allowAccountAttempt } from "./account-limits";
import { readBody, requestSessionToken } from "./account-boundary";
import { readAccountSession } from "./accounts";
import { readSupport, supportCommand, SupportError } from "./support";
import type { SupportView } from "./support-types";
import { protectAdminCaseChanges } from "./admin-privacy";
import { protectFeedbackPromptPreferences } from "./feedback-prompts";
import { PortalError } from "./portal-policy";
import {
  journalRetentionControls,
  protectedRetentionControls
} from "./retention-controls";

const headers = {
  "Cache-Control": "private, no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow",
  Vary: "Cookie"
};
export async function handleSupportRequest(
  db: PrismaClient,
  request: Request,
  afterUpdate?: (sourceId: string) => void
) {
  try {
    const token = requestSessionToken(request);
    if (request.method === "GET") {
      const expectedOwner = request.headers.get("x-expected-account");
      if (
        expectedOwner &&
        (await readAccountSession(db, token))?.id !== expectedOwner
      )
        throw new SupportError(
          401,
          "Your sign-in changed. Reload before continuing."
        );
      const q = new URL(request.url).searchParams;
      const view = q.get("view") ?? "requests";
      if (!["new", "requests", "inbox", "routing", "detail"].includes(view))
        throw new SupportError(400, "Choose a supported help view.");
      if (
        [...q.keys()].some(
          (k) => !["view", "caseId", "churchId", "page"].includes(k)
        ) ||
        [...q.values()].some((v) => v.length > 100)
      )
        throw new SupportError(400, "Check the help link.");
      return Response.json(
        await readSupport(db, token, view as SupportView, {
          caseId: q.get("caseId") ?? undefined,
          churchId: q.get("churchId") ?? undefined,
          page: q.get("page")
        }),
        { headers }
      );
    }
    if (request.method !== "POST")
      return Response.json(
        { message: "Use the help form." },
        { status: 405, headers }
      );
    const config = accountConfig();
    if (
      request.headers.get("origin") !== config.origin ||
      request.headers.get("sec-fetch-site") === "cross-site"
    )
      throw new SupportError(
        403,
        "Open the help form on this website and try again."
      );
    let body: Record<string, unknown>;
    try {
      body = await readBody(request);
    } catch {
      throw new SupportError(
        400,
        "Check the fields and their length. No request was saved."
      );
    }
    const actor = await readAccountSession(db, token);
    if (!actor)
      throw new SupportError(401, "Sign in to get help with your requests.");
    const expectedOwner = request.headers.get("x-expected-account");
    if (expectedOwner && expectedOwner !== actor.id)
      throw new SupportError(
        401,
        "Your sign-in changed. Reload before continuing."
      );
    if (typeof body.operation !== "string" || body.operation.length > 40)
      throw new SupportError(400, "Choose a supported help action.");
    const ip = process.env.VERCEL
      ? (request.headers.get("x-real-ip") ?? "unknown").slice(0, 64)
      : "local";
    if (
      !(await allowAccountAttempt(
        db,
        config.rateSecret + ":support",
        body.operation,
        ip,
        actor.id
      ))
    )
      throw new SupportError(
        429,
        "Too many attempts. Wait 15 minutes before trying again."
      );
    const result = await supportCommand(db, token, body);
    if (body.operation === "feedback-create") {
      const feedbackOwner = await db.supportCase.findUniqueOrThrow({
        where: { id: result.caseId },
        select: { requesterId: true }
      });
      await protectFeedbackPromptPreferences(db, feedbackOwner.requesterId);
    }
    if (
      body.operation === "redact" ||
      body.operation === "feedback-remove-attachment" ||
      body.operation === "feedback-choices"
    )
      await protectAdminCaseChanges(db, [result.caseId]);
    const linked = await db.supportCase.findUnique({
      where: { id: result.caseId },
      select: { moderationDecision: { select: { reportId: true } } }
    });
    if (linked?.moderationDecision) {
      const reportId = linked.moderationDecision.reportId;
      try {
        const protection = await journalRetentionControls(
          db,
          protectedRetentionControls(),
          reportId
        );
        if (protection.failed || protection.pending)
          throw Error("Recovery pending");
      } catch {
        throw new SupportError(
          503,
          "Your case update was recorded, but recovery protection is pending. Retry the same request to finish protecting it."
        );
      }
      afterUpdate?.(reportId);
    }
    if (["reply", "transition", "feature"].includes(String(body.operation)))
      afterUpdate?.(result.caseId);
    return Response.json(result, { headers });
  } catch (error) {
    if (error instanceof SupportError || error instanceof PortalError)
      return Response.json(
        { message: error.message },
        { status: error.status, headers }
      );
    // Do not log or serialize submitted text, identifiers, tokens or database exceptions.
    return Response.json(
      {
        message:
          "We could not load or save this request. Try again. A received confirmation is only shown after saving."
      },
      { status: 503, headers }
    );
  }
}
