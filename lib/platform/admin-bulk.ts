import type { PrismaClient } from "@prisma/client";
import { withAdmin } from "./admin-authority";
import {
  adminCaseCommand,
  adminChildRequestKey,
  requireAdminCase
} from "./admin-cases";
import { adminFields, adminRequestKey, adminSource } from "./admin-input";
import { protectAdminCaseChanges } from "./admin-privacy";
import { PortalError } from "./portal-policy";
import { postField } from "./post-input";
import { handleSupportRequest } from "./support-boundary";
import { communityReportCommand } from "./community-reports";
import {
  journalRetentionControls,
  protectedRetentionControls
} from "./retention-controls";

export async function adminBulkCommand(
  db: PrismaClient,
  request: Request,
  token: unknown,
  input: Record<string, unknown>,
  afterReport?: (id: string) => void
) {
  adminFields(input, [
    "operation",
    "requestKey",
    "action",
    "rows",
    "tags",
    "username",
    "ownerGrantId",
    "ownerGrantVersion",
    "status",
    "reason"
  ]);
  const key = adminRequestKey(input.requestKey);
  if (!["tags", "assign", "status"].includes(String(input.action)))
    throw new PortalError(
      400,
      "Choose bulk tags, assignment or a reversible status."
    );
  if (
    !Array.isArray(input.rows) ||
    !input.rows.length ||
    input.rows.length > 10
  )
    throw new PortalError(400, "Select one to ten requests for this action.");
  const seen = new Set<string>();
  const rows = input.rows.map((raw) => {
    adminFields(raw, ["sourceType", "sourceId", "expectedVersion"]);
    const source = adminSource(raw),
      identity = source.sourceType + ":" + source.sourceId;
    if (
      seen.has(identity) ||
      !Number.isSafeInteger(raw.expectedVersion) ||
      raw.expectedVersion < 1
    )
      throw new PortalError(
        400,
        "Select each request once with its current version."
      );
    seen.add(identity);
    return {
      ...source,
      expectedVersion: raw.expectedVersion,
      requestKey: adminChildRequestKey(key, identity)
    };
  });
  const results = [];
  // Each source owns a separate transaction and authorization check. An earlier
  // successful row is never rolled back or described as failed with a later one.
  for (const row of rows) {
    try {
      await withAdmin(db, token, (tx, a) =>
        requireAdminCase(tx, a, row, input.action !== "assign")
      );
      let result: Record<string, unknown>;
      if (
        input.action === "tags" ||
        (input.action === "assign" && row.sourceType !== "SUPPORT")
      ) {
        result = await adminCaseCommand(db, token, {
          ...row,
          operation: input.action === "tags" ? "tags" : "assign",
          ...(input.action === "tags"
            ? { tags: input.tags }
            : { username: input.username })
        });
        await protectAdminCaseChanges(db, [row.sourceId]);
      } else if (row.sourceType === "SUPPORT") {
        if (
          input.action === "status" &&
          ![
            "RECEIVED",
            "IN_PROGRESS",
            "WAITING_FOR_REQUESTER",
            "RESOLVED",
            "CLOSED"
          ].includes(String(input.status))
        )
          throw new PortalError(400, "Choose a native support status.");
        const body = {
          requestKey: row.requestKey,
          caseId: row.sourceId,
          expectedVersion: row.expectedVersion,
          ...(input.action === "assign"
            ? {
                operation: "handoff",
                ownerGrantId: input.ownerGrantId,
                ownerGrantVersion: input.ownerGrantVersion
              }
            : {
                operation:
                  input.status === "RECEIVED" ? "reopen" : "transition",
                ...(input.status === "RECEIVED"
                  ? {}
                  : { status: input.status }),
                reason: postField(input.reason, 1000, 3)
              })
        };
        const response = await handleSupportRequest(
          db,
          new Request(new URL("/api/platform/support", request.url), {
            method: "POST",
            headers: request.headers,
            body: JSON.stringify(body)
          }),
          afterReport
        );
        const data = await response.json();
        if (!response.ok) throw new PortalError(response.status, data.message);
        result = data;
      } else if (row.sourceType === "REPORT" && input.action === "status") {
        if (!["CLOSED", "FOLLOW_UP_REQUIRED"].includes(String(input.status)))
          throw new PortalError(
            400,
            "Choose Closed or Further review required for a content report."
          );
        result = await communityReportCommand(db, token, {
          operation: "resolve",
          mutationId: row.requestKey,
          id: row.sourceId,
          expectedVersion: row.expectedVersion,
          resolution: input.status,
          decisionReason: postField(input.reason, 1000, 3)
        });
        const protection = await journalRetentionControls(
          db,
          protectedRetentionControls(),
          row.sourceId
        );
        if (protection.failed || protection.pending)
          throw new PortalError(
            503,
            "Recorded; recovery protection is pending. Retry this same batch."
          );
        afterReport?.(row.sourceId);
      } else
        throw new PortalError(
          400,
          "Church decisions require the individual verification review. Bulk approval is unavailable."
        );
      results.push({
        sourceType: row.sourceType,
        sourceId: row.sourceId,
        ok: true,
        status: 200,
        version: Number(result.version),
        message: String(result.message)
      });
    } catch (error) {
      results.push({
        sourceType: row.sourceType,
        sourceId: row.sourceId,
        ok: false,
        status: error instanceof PortalError ? error.status : 503,
        message:
          error instanceof PortalError
            ? error.message
            : "This row could not be confirmed. Retry the same batch when access and service are available."
      });
    }
  }
  return {
    results,
    message: `${results.filter((r) => r.ok).length} of ${results.length} changes confirmed. Review each result; unchanged retries preserve the original action.`
  };
}
