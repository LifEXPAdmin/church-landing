import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { escapeCsvCell } from "../csv";
import { withAdmin, requireAdminCapability } from "./admin-authority";
import { adminFields } from "./admin-input";
import { adminPriorOperation, recordAdminOperation } from "./admin-cases";
import { aggregateMetrics, type MetricReport } from "./metric-report";
import { PortalError } from "./portal-policy";
import { requirePrivilegedAuthentication } from "./privileged-auth-policy";

/** Serialize only the same suppressed, filtered aggregate report the UI receives. */
export function metricCsv(report: MetricReport) {
  const rows: string[][] = [["Metric", "Value"]];
  function visit(value: unknown, path: string) {
    if (value !== null && typeof value === "object") {
      for (const [key, child] of Object.entries(value))
        visit(child, path ? path + "." + key : key);
    } else
      rows.push([
        path,
        value === null ? "Unavailable or suppressed" : String(value)
      ]);
  }
  visit(report, "");
  return (
    rows.map((row) => row.map(escapeCsvCell).join(",")).join("\r\n") + "\r\n"
  );
}
export function exportPlatformMetrics(
  db: PrismaClient,
  token: unknown,
  input: Record<string, unknown>
) {
  adminFields(input, ["operation", "requestKey", "from", "through", "preset"]);
  return withAdmin(
    db,
    token,
    async (tx, a) => {
      requireAdminCapability(a, "VIEW_PLATFORM_METRICS");
      requireAdminCapability(a, "EXPORT_PLATFORM_METRICS");
      const prior = await adminPriorOperation(tx, a.actor.id, input);
      if (prior.prior)
        throw new PortalError(
          409,
          "This export was already recorded. Generate a new current export to receive a new audit receipt."
        );
      await requirePrivilegedAuthentication(tx, a.actor.id, "export-metrics");
      const filters = Object.fromEntries(
        Object.entries(input).filter(
          ([key]) => !["operation", "requestKey"].includes(key)
        )
      );
      const report = await aggregateMetrics(tx, filters),
        csv = metricCsv(report),
        sha256 = createHash("sha256").update(csv).digest("hex");
      // Every downloadable current snapshot has its own receipt; CSV is never retained in an audit.
      await recordAdminOperation(
        tx,
        a.actor.id,
        input,
        {
          sourceType: "METRICS_EXPORT",
          sourceId: String(report.configuration.version)
        },
        {
          version: report.configuration.version,
          from: report.window.from,
          through: report.window.through,
          zone: report.window.zone,
          checkedAt: report.checkedAt,
          sha256
        }
      );
      return {
        csv,
        filename: `godschurches-aggregates-${report.window.from}-${report.window.through}.csv`,
        checkedAt: report.checkedAt,
        receipt: prior.requestKey,
        sha256
      };
    },
    true
  );
}
