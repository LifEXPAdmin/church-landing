import type { PrismaClient } from "@prisma/client";
import { withAdmin } from "./admin-authority";
import { adminNoteWhere, requireAdminCase } from "./admin-cases";
import { adminFilters, adminSource } from "./admin-input";
import { adminQueueRows } from "./admin-queue";
import { PortalError } from "./portal-policy";
import { readSupport } from "./support";

export function adminPageNumber(value: unknown) {
  if (value == null || value === "") return 0;
  if (!/^\d{1,2}$/.test(String(value)))
    throw new PortalError(400, "Choose a supported case-history page.");
  return Number(value);
}
export async function readAdminDetail(
  db: PrismaClient,
  token: unknown,
  input: { sourceType?: unknown; sourceId?: unknown; page?: unknown }
) {
  const source = adminSource(input),
    page = adminPageNumber(input.page);
  // The native owner authorizes private conversations itself. Before returning
  // any data, check current admin scope and the native version under the shared
  // gate below. A duplicate earlier admin read would not strengthen that check.
  const support =
    source.sourceType === "SUPPORT"
      ? await readSupport(db, token, "detail", {
          caseId: source.sourceId,
          page: String(page)
        })
      : null;
  return withAdmin(db, token, async (tx, a) => {
    const row = await requireAdminCase(tx, a, source);
    if (
      support?.detail?.version !== undefined &&
      support.detail.version !== row.version
    )
      throw new PortalError(
        409,
        "This request changed while loading. Open it again for the current history."
      );
    const notes = await tx.adminCaseNote.findMany({
      where: adminNoteWhere(source),
      select: {
        id: true,
        body: true,
        actor: { select: { id: true, name: true } },
        sourceVersion: true,
        createdAt: true,
        redactedAt: true
      },
      orderBy: [{ sourceVersion: "desc" }, { id: "desc" }],
      skip: page * 25,
      take: 26
    });
    const history = await tx.adminOperation.findMany({
      where: source,
      select: {
        id: true,
        action: true,
        version: true,
        targetId: true,
        actor: { select: { name: true } },
        createdAt: true,
        result: true
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: page * 25,
      take: 26
    });
    const bug =
      source.sourceType === "SUPPORT" && row.category === "ACCOUNT_WEBSITE"
        ? await tx.supportCase.findUnique({
            where: { id: source.sourceId },
            select: {
              bugSteps: true,
              bugExpected: true,
              bugActual: true,
              bugEnvironment: true,
              reproducibility: true,
              engineeringUrl: true
            }
          })
        : null;
    let group: null | {
      title: string;
      engineeringUrl: string;
      rows: (typeof row)[];
      affectedAccounts: number | null;
      restricted: boolean;
    } = null;
    if (row.adminGroupId) {
      const members = await adminQueueRows(
        tx,
        a,
        adminFilters({ state: "ALL" }),
        { groupId: row.adminGroupId, limit: 101 }
      );
      const where = { adminGroupId: row.adminGroupId };
      const count =
        (await tx.supportCase.count({ where })) +
        (await tx.communityReport.count({ where })) +
        (await tx.churchClaim.count({ where }));
      const restricted =
        members.length !== count ||
        members.some((r) => !r.canRead) ||
        count > 100;
      // Counts and the shared free-text label are shown only when every member
      // is authorized. A restricted membership is never used as a count oracle.
      let title = "Related requests",
        engineeringUrl = "",
        affectedAccounts: number | null = null;
      if (!restricted) {
        const metadata = await tx.adminCaseGroup.findUnique({
          where: { id: row.adminGroupId },
          select: { title: true, engineeringUrl: true }
        });
        title = metadata?.title ?? title;
        engineeringUrl = metadata?.engineeringUrl ?? "";
        const people = [
          ...(
            await tx.supportCase.findMany({
              where,
              select: { requesterId: true }
            })
          ).map((r) => r.requesterId),
          ...(
            await tx.communityReport.findMany({
              where,
              select: { reporterId: true }
            })
          ).map((r) => r.reporterId),
          ...(
            await tx.churchClaim.findMany({ where, select: { ownerId: true } })
          ).map((r) => r.ownerId)
        ];
        affectedAccounts = new Set(people).size;
      }
      group = {
        title,
        engineeringUrl,
        affectedAccounts,
        restricted,
        rows: members.filter((r) => r.canRead).slice(0, 100)
      };
    }
    return {
      navigation: a.navigation,
      row,
      support,
      bug,
      group,
      page,
      more:
        notes.length > 25 ||
        history.length > 25 ||
        !!support?.detail?.moreMessages,
      notes: notes.slice(0, 25).map((n) => ({
        id: n.id,
        body: n.body,
        author: n.actor.name,
        version: n.sourceVersion,
        createdAt: n.createdAt.toISOString(),
        redacted: !!n.redactedAt,
        canRedact:
          n.actor.id === a.actor.id ||
          source.sourceType !== "SUPPORT" ||
          a.support.some((g) => g.capability === "REDACT")
      })),
      history: history.slice(0, 25).map((h) => ({
        id: h.id,
        action: h.action,
        version: h.version,
        author: h.actor.name,
        createdAt: h.createdAt.toISOString(),
        reason:
          h.action === "redact-note" &&
          h.result &&
          typeof h.result === "object" &&
          !Array.isArray(h.result) &&
          typeof h.result.reason === "string"
            ? h.result.reason
            : null
      }))
    };
  });
}
export type AdminCaseDetail = Awaited<ReturnType<typeof readAdminDetail>>;
