import type { Prisma } from "@prisma/client";
import { eligibleWhere, PortalError } from "./portal";
import { parseChartChanges, type ChartPlacement } from "./church-chart-model";
import type { PositionSummary } from "./church-structure-types";

type Placement = {
  placement: ChartPlacement["placement"];
  parentName?: string;
  layout: ChartPlacement["layout"];
};
export type ChartHistoryPage = {
  entries: {
    version: number;
    savedAt: string;
    actor: string;
    changes: {
      positionId?: string;
      name: string;
      before: Placement;
      after: Placement;
    }[];
    changesUnavailable: boolean;
  }[];
  cursor?: string;
};

// Caller checks current approved membership and MANAGE_STRUCTURE in the same
// transaction. Historical rows never supply names, email, permissions or links.
export async function readChurchChartHistory(
  tx: Prisma.TransactionClient,
  churchId: string,
  viewerId: string,
  positions: PositionSummary[],
  cursor?: string
): Promise<ChartHistoryPage> {
  if (
    cursor &&
    (!/^[1-9][0-9]{0,9}$/.test(cursor) || Number(cursor) > 2_147_483_647)
  )
    throw new PortalError(400, "Use a current chart history link.");
  const rows = await tx.churchChartSave.findMany({
    where: {
      churchId,
      ...(cursor ? { resultVersion: { lt: Number(cursor) } } : {})
    },
    orderBy: { resultVersion: "desc" },
    take: 21,
    select: {
      resultVersion: true,
      createdAt: true,
      actorId: true,
      changes: true
    }
  });
  const shown = rows.slice(0, 20);
  const members = await tx.churchConnection.findMany({
    where: {
      churchId,
      state: "APPROVED",
      user: eligibleWhere,
      userId: { in: [...new Set(shown.map((row) => row.actorId))] },
      preference: { listed: true }
    },
    select: { userId: true, preference: { select: { displayName: true } } }
  });
  const names = new Map(
    members.map((member) => [member.userId, member.preference!.displayName])
  );
  const current = new Map(positions.map((position) => [position.id, position]));
  const placement = (value: ChartPlacement): Placement => ({
    placement: value.placement,
    ...(value.parentId
      ? {
          parentName:
            current.get(value.parentId)?.name ?? "Unavailable position"
        }
      : {}),
    layout: value.layout
  });
  return {
    entries: shown.map((row) => {
      const entry: ChartHistoryPage["entries"][number] = {
        version: row.resultVersion,
        savedAt: row.createdAt.toISOString(),
        actor:
          row.actorId === viewerId
            ? "You"
            : names.get(row.actorId) || "Unlisted or former member",
        changes: [],
        changesUnavailable: false
      };
      try {
        if (
          !Array.isArray(row.changes) ||
          !row.changes.length ||
          row.changes.length > 200
        )
          throw new Error("Unavailable history");
        const values = row.changes.map((value) => {
          if (
            !value ||
            typeof value !== "object" ||
            Array.isArray(value) ||
            Object.keys(value).some(
              (key) => !["id", "before", "after"].includes(key)
            )
          )
            throw new Error("Unavailable history");
          return value;
        });
        const before = parseChartChanges(
          values.map((value) => ({
            id: value.id,
            ...(typeof value.before === "object" &&
            value.before &&
            !Array.isArray(value.before)
              ? value.before
              : {})
          }))
        );
        const after = parseChartChanges(
          values.map((value) => ({
            id: value.id,
            ...(typeof value.after === "object" &&
            value.after &&
            !Array.isArray(value.after)
              ? value.after
              : {})
          }))
        );
        entry.changes = after.map((value, index) => ({
          ...(current.has(value.id) ? { positionId: value.id } : {}),
          name: current.get(value.id)?.name ?? "Unavailable position",
          before: placement(before[index]),
          after: placement(value)
        }));
      } catch {
        entry.changesUnavailable = true;
      }
      return entry;
    }),
    ...(rows.length > 20
      ? { cursor: String(shown[shown.length - 1].resultVersion) }
      : {})
  };
}
