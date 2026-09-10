import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { expected, PortalError } from "./portal";
import {
  applyChartChanges,
  chartChanges,
  ChartDraftError,
  parseChartChanges
} from "./church-chart-model";

// Caller owns the serialized portal transaction, current membership and
// MANAGE_STRUCTURE check. This command never reads or writes role grants.
export async function saveChurchChart(
  tx: Prisma.TransactionClient,
  churchId: string,
  actorId: string,
  currentVersion: number,
  input: Record<string, unknown>
) {
  if (
    input.confirmed !== true ||
    Object.keys(input).some(
      (key) =>
        ![
          "operation",
          "churchId",
          "expectedVersion",
          "requestKey",
          "confirmed",
          "changes"
        ].includes(key)
    )
  )
    throw new PortalError(
      400,
      "Review and confirm only the chart placement and layout changes."
    );
  const key = input.requestKey;
  if (typeof key !== "string" || !/^[A-Za-z0-9_-]{16,100}$/.test(key))
    throw new PortalError(400, "Use a valid chart save reference.");
  try {
    const changes = parseChartChanges(input.changes).sort((a, b) =>
      a.id.localeCompare(b.id)
    );
    const inputHash = createHash("sha256")
      .update(
        JSON.stringify({
          churchId,
          expectedVersion: input.expectedVersion,
          changes
        })
      )
      .digest("hex");
    const receipt = await tx.churchChartSave.findUnique({
      where: { requestKey: key }
    });
    if (receipt) {
      if (
        receipt.actorId !== actorId ||
        receipt.churchId !== churchId ||
        receipt.inputHash !== inputHash ||
        receipt.resultVersion !== currentVersion
      )
        throw new PortalError(
          409,
          "This save reference no longer matches the current chart. Keep your draft and review current positions."
        );
      return { version: receipt.resultVersion, changed: false };
    }
    expected(input.expectedVersion, currentVersion);
    const rows = await tx.churchPosition.findMany({
      where: { churchId, archivedAt: null },
      select: {
        id: true,
        parentId: true,
        placement: true,
        chartX: true,
        chartY: true
      }
    });
    const before = rows.map(({ chartX, chartY, ...p }) => ({
      ...p,
      layout:
        chartX !== null && chartY !== null ? { x: chartX, y: chartY } : null
    }));
    const after = applyChartChanges(before, changes);
    const actual = chartChanges(before, after);
    if (!actual.length)
      throw new PortalError(
        409,
        "These positions already match the saved chart. Keep your draft and review current positions."
      );
    // A valid multi-position move may temporarily invert an old edge. Enforce
    // the existing database cycle constraint against the final transaction.
    await tx.$executeRaw`SET CONSTRAINTS "ChurchPosition_acyclic" DEFERRED`;
    for (const p of actual) {
      await tx.churchPosition.update({
        where: { id: p.id },
        data: {
          parentId: p.parentId,
          placement: p.placement,
          chartX: p.layout?.x ?? null,
          chartY: p.layout?.y ?? null
        }
      });
    }
    const resultVersion = currentVersion + 1;
    await tx.church.update({
      where: { id: churchId },
      data: { structureVersion: { increment: 1 } }
    });
    await tx.churchChartSave.create({
      data: {
        requestKey: key,
        churchId,
        actorId,
        inputHash,
        resultVersion,
        changes: actual.map((p) => {
          const old = before.find((row) => row.id === p.id)!;
          return {
            id: p.id,
            before: {
              parentId: old.parentId,
              placement: old.placement,
              layout: old.layout
            },
            after: {
              parentId: p.parentId,
              placement: p.placement,
              layout: p.layout
            }
          };
        })
      }
    });
    await tx.churchAuditEvent.create({
      data: {
        churchId,
        actorId,
        targetId: churchId,
        action: "SAVE_CHURCH_CHART",
        version: resultVersion
      }
    });
    return { version: resultVersion, changed: true };
  } catch (error) {
    if (error instanceof ChartDraftError)
      throw new PortalError(400, error.message);
    throw error;
  }
}
