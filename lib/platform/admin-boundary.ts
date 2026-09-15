import type { PrismaClient } from "@prisma/client";
import { requestSessionToken } from "./account-boundary";
import { readAccountSession } from "./accounts";
import { readAdminNavigation } from "./admin-authority";
import { readAdminQueue } from "./admin-queue";
import { readAdminDetail } from "./admin-detail";
import { readAdminHealth } from "./admin-health";
import { readAdminOverview } from "./admin-overview";
import {
  readFeedbackIdeaAdministration,
  readFeedbackIdeaModeration,
  feedbackIdeaAdminCommand
} from "./feedback-idea-admin";
import { readPlatformMetrics } from "./metric-report";
import { exportPlatformMetrics } from "./metric-export";
import { adminFields } from "./admin-input";
import { adminCaseCommand, adminSavedViewCommand } from "./admin-cases";
import { adminBulkCommand } from "./admin-bulk";
import { protectAdminCaseChanges } from "./admin-privacy";
import { defaultAdminFilters } from "./admin-types";
import { PortalError } from "./portal-policy";
import { SupportError } from "./support";
import { AccountError } from "./account-error";
import { requestAccountCredential } from "./google-cookies";
import { accountConfig } from "./account-config";
import {
  adminAuthenticatorCommand,
  adminGrantCommand,
  readAdminAccess
} from "./admin-access";
import { adminAccountLookup, readAdminAudit } from "./admin-operations";
import {
  socialError,
  socialHeaders,
  socialWriteInput
} from "./social-boundary";

export async function handleAdminRequest(
  db: PrismaClient,
  request: Request,
  afterReport?: (id: string) => void
) {
  try {
    const token = requestSessionToken(request),
      expected = request.headers.get("x-expected-account");
    if (expected && (await readAccountSession(db, token))?.id !== expected)
      throw new PortalError(
        401,
        "Your sign-in changed. Reload before continuing."
      );
    let result: unknown;
    if (request.method === "GET") {
      const q = new URL(request.url).searchParams,
        input = Object.fromEntries(q),
        view = q.get("view") ?? "navigation";
      if ([...q.keys()].some((k) => q.getAll(k).length !== 1))
        throw new PortalError(400, "Use each admin filter once.");
      if (view === "navigation" || view === "health" || view === "overview") {
        adminFields(input, ["view"]);
        result =
          view === "overview"
            ? await readAdminOverview(db, token)
            : view === "health"
              ? await readAdminHealth(db, token)
              : await readAdminNavigation(db, token);
      } else if (view === "metrics") {
        adminFields(input, ["view", "from", "through", "preset"]);
        result = await readPlatformMetrics(
          db,
          token,
          Object.fromEntries(
            Object.entries(input).filter(([key]) => key !== "view")
          )
        );
      } else if (view === "feedback-idea-moderation") {
        adminFields(input, ["view", "ideaId", "q", "page"]);
        result = await readFeedbackIdeaModeration(db, token, input);
      } else if (view === "feedback-idea") {
        adminFields(input, ["view", "caseId", "ideaId", "q"]);
        result = await readFeedbackIdeaAdministration(db, token, input);
      } else if (view === "access") {
        adminFields(input, ["view", "username"]);
        result = await readAdminAccess(db, token, input.username);
      } else if (view === "audit") {
        adminFields(input, ["view", "after"]);
        result = await readAdminAudit(db, token, input.after);
      } else if (view === "queue") {
        adminFields(input, [
          "view",
          "after",
          ...Object.keys(defaultAdminFilters)
        ]);
        const filters = Object.fromEntries(
          Object.entries(input).filter(
            ([key]) => key !== "view" && key !== "after"
          )
        );
        result = await readAdminQueue(db, token, filters, input.after);
      } else if (view === "detail") {
        adminFields(input, ["view", "sourceType", "sourceId", "page"]);
        result = await readAdminDetail(db, token, input);
      } else throw new PortalError(400, "Choose an available admin view.");
    } else {
      if (!expected)
        throw new PortalError(
          401,
          "Reload this account's admin form before saving."
        );
      const { input } = await socialWriteInput(db, request, "admin-operations");
      if (
        ["mfa-start", "mfa-confirm", "mfa-recover"].includes(
          String(input.operation)
        )
      )
        result = await adminAuthenticatorCommand(
          db,
          token,
          input,
          requestAccountCredential(request, input, accountConfig().secureCookie)
        );
      else if (input.operation === "grant")
        result = await adminGrantCommand(
          db,
          token,
          input,
          requestAccountCredential(request, input, accountConfig().secureCookie)
        );
      else if (input.operation === "metrics-export")
        result = await exportPlatformMetrics(db, token, input);
      else if (
        ["idea-save", "idea-withdraw", "idea-merge", "idea-unmerge"].includes(
          String(input.operation)
        )
      ) {
        const saved = await feedbackIdeaAdminCommand(db, token, input);
        await protectAdminCaseChanges(db, [saved.id]);
        result = saved;
        afterReport?.(saved.id);
      } else if (input.operation === "lookup")
        result = await adminAccountLookup(db, token, input);
      else if (input.operation === "bulk")
        result = await adminBulkCommand(db, request, token, input, afterReport);
      else if (
        input.operation === "save-view" ||
        input.operation === "delete-view"
      )
        result = await adminSavedViewCommand(db, token, input);
      else {
        result = await adminCaseCommand(db, token, input);
        await protectAdminCaseChanges(db, [
          String(input.sourceId),
          ...(input.operation === "group"
            ? [String(input.relatedSourceId)]
            : [])
        ]);
      }
    }
    return Response.json(result, { headers: socialHeaders });
  } catch (error) {
    const response = socialError(
      error instanceof SupportError
        ? new PortalError(error.status, error.message)
        : error instanceof AccountError && error.code === "credentials"
          ? new PortalError(
              400,
              "Your current sign-in confirmation could not be verified. Confirm this action and try again."
            )
          : error
    );
    for (const [key, value] of Object.entries(socialHeaders))
      response.headers.set(key, value);
    return response;
  }
}
