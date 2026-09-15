import { createHmac } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { accountConfig } from "./account-config";
import {
  adminAuthority,
  adminDenied,
  withAdmin,
  type AdminAuthority,
  type AdminTx
} from "./admin-authority";
import { adminQueueRows } from "./admin-queue";
import {
  adminEngineeringUrl,
  adminFields,
  adminFilters,
  adminRequestKey,
  adminSource,
  adminTags
} from "./admin-input";
import {
  adminPriorities,
  type AdminSource,
  type AdminPriority
} from "./admin-types";
import { eligibleWhere, expected, PortalError } from "./portal-policy";
import { postField, postId } from "./post-input";
import { recordAdminPrivacyControl } from "./retention-controls";

const allStates = adminFilters({ state: "ALL" });
export async function requireAdminCase(
  tx: AdminTx,
  authority: AdminAuthority,
  source: AdminSource,
  read = true
) {
  const [row] = await adminQueueRows(tx, authority, allStates, {
    source,
    limit: 1
  });
  if (!row || (read && !row.canRead)) throw adminDenied();
  return row;
}
export function adminNoteWhere(source: AdminSource) {
  return source.sourceType === "SUPPORT"
    ? { supportCaseId: source.sourceId }
    : source.sourceType === "REPORT"
      ? { reportId: source.sourceId }
      : { claimId: source.sourceId };
}
async function updateSource(
  tx: AdminTx,
  source: AdminSource,
  data: Record<string, unknown>,
  actorId: string
) {
  const change = {
    ...data,
    version: { increment: 1 },
    adminVersion: { increment: 1 }
  };
  const select = { version: true, adminVersion: true };
  const next =
    source.sourceType === "SUPPORT"
      ? await tx.supportCase.update({
          where: { id: source.sourceId },
          data: change,
          select
        })
      : source.sourceType === "REPORT"
        ? await tx.communityReport.update({
            where: { id: source.sourceId },
            data: change,
            select
          })
        : await tx.churchClaim.update({
            where: { id: source.sourceId },
            data: change,
            select
          });
  await recordAdminPrivacyControl(tx, source, actorId, next.adminVersion);
  return next;
}
export function adminFingerprint(input: Record<string, unknown>) {
  return createHmac("sha256", accountConfig().rateSecret + ":admin-operation")
    .update(
      JSON.stringify(
        Object.fromEntries(
          Object.entries(input).sort(([a], [b]) => a.localeCompare(b))
        )
      )
    )
    .digest("hex");
}
export async function adminPriorOperation(
  tx: AdminTx,
  actorId: string,
  input: Record<string, unknown>
) {
  const requestKey = adminRequestKey(input.requestKey),
    fingerprint = adminFingerprint(input);
  const prior = await tx.adminOperation.findUnique({
    where: { actorId_requestKey: { actorId, requestKey } },
    select: { fingerprint: true, result: true }
  });
  if (prior && prior.fingerprint !== fingerprint)
    throw new PortalError(
      409,
      "That retry belongs to different information. Your unsent entries are retained."
    );
  return {
    requestKey,
    fingerprint,
    prior: prior?.result as Record<string, unknown> | undefined
  };
}
export async function recordAdminOperation(
  tx: AdminTx,
  actorId: string,
  input: Record<string, unknown>,
  source: { sourceType: string; sourceId: string },
  result: { version: number; [key: string]: unknown },
  targetId?: string
) {
  await tx.adminOperation.create({
    data: {
      actorId,
      requestKey: adminRequestKey(input.requestKey),
      fingerprint: adminFingerprint(input),
      action: String(input.operation),
      ...source,
      version: result.version,
      targetId,
      result: result as Prisma.InputJsonObject
    }
  });
}
export function adminChildRequestKey(key: string, identity: string) {
  const hex = createHmac(
    "sha256",
    accountConfig().rateSecret + ":admin-child-operation"
  )
    .update(adminRequestKey(key) + ":" + identity)
    .digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
// Group membership never grants access. A join must preserve every existing
// member, and must not change a group the acting reviewer cannot fully inspect.
async function requireWholeGroup(tx: AdminTx, a: AdminAuthority, id: string) {
  const count =
    (await tx.supportCase.count({ where: { adminGroupId: id } })) +
    (await tx.communityReport.count({ where: { adminGroupId: id } })) +
    (await tx.churchClaim.count({ where: { adminGroupId: id } }));
  if (count >= 100)
    throw new PortalError(
      409,
      "This group has reached its review limit. Keep the original requests separate."
    );
  const visible = await adminQueueRows(tx, a, allStates, {
    groupId: id,
    limit: 101
  });
  if (visible.length !== count || visible.some((r) => !r.canTriage))
    throw adminDenied();
}
const common = [
  "operation",
  "requestKey",
  "sourceType",
  "sourceId",
  "expectedVersion"
];
const fields: Record<string, string[]> = {
  note: ["body"],
  "redact-note": ["noteId", "reason"],
  triage: ["priority", "nextAction", "tags", "reminderAt"],
  tags: ["tags"],
  bug: [
    "steps",
    "expected",
    "actual",
    "environment",
    "reproducibility",
    "engineeringUrl"
  ],
  assign: ["username"],
  group: [
    "relatedSourceType",
    "relatedSourceId",
    "relatedVersion",
    "title",
    "engineeringUrl"
  ],
  ungroup: []
};
export function adminCaseCommand(
  db: PrismaClient,
  token: unknown,
  input: Record<string, unknown>
) {
  return withAdmin(
    db,
    token,
    async (tx, a) => {
      const op = String(input.operation);
      if (!Object.hasOwn(fields, op))
        throw new PortalError(400, "Choose a supported admin case action.");
      adminFields(input, [...common, ...fields[op]]);
      const source = adminSource(input),
        row = await requireAdminCase(tx, a, source);
      if (!row.canTriage) throw adminDenied();
      const retry = await adminPriorOperation(tx, a.actor.id, input);
      if (retry.prior) return retry.prior;
      expected(input.expectedVersion, row.version);
      const data: Record<string, unknown> = {};
      let targetId: string | undefined;
      if (op === "note") {
        const body = postField(input.body, 2000, 1);
        const note = await tx.adminCaseNote.create({
          data: {
            ...adminNoteWhere(source),
            actorId: a.actor.id,
            body,
            sourceVersion: row.version + 1
          },
          select: { id: true }
        });
        targetId = note.id;
      } else if (op === "redact-note") {
        if (input.reason !== "PRIVATE_INFORMATION" && input.reason !== "SECRET")
          throw new PortalError(400, "Choose the structured privacy reason.");
        const note = await tx.adminCaseNote.findFirst({
          where: { id: postId(input.noteId), ...adminNoteWhere(source) },
          select: { id: true, actorId: true }
        });
        if (!note) throw adminDenied();
        if (
          note.actorId !== a.actor.id &&
          source.sourceType === "SUPPORT" &&
          !a.support.some((g) => g.capability === "REDACT")
        )
          throw adminDenied();
        await tx.adminCaseNote.update({
          where: { id: note.id },
          data: { body: "[Removed for privacy.]", redactedAt: new Date() }
        });
        targetId = note.id;
      } else if (op === "tags") {
        data.triageTags = adminTags(input.tags);
      } else if (op === "triage") {
        if (
          typeof input.priority !== "string" ||
          !Object.hasOwn(adminPriorities, input.priority)
        )
          throw new PortalError(400, "Choose a supported priority.");
        data.priority = input.priority as AdminPriority;
        data.nextAction = postField(input.nextAction ?? "", 500);
        data.triageTags = adminTags(input.tags);
        if (input.reminderAt == null || input.reminderAt === "")
          data.reminderAt = null;
        else {
          const raw = postField(input.reminderAt, 30, 1),
            date = new Date(raw);
          if (
            !Number.isFinite(date.getTime()) ||
            date.toISOString() !== raw ||
            date.getTime() < Date.now() - 60000 ||
            date.getTime() > Date.now() + 366 * 86400000
          )
            throw new PortalError(
              400,
              "Choose a reminder within the next year. It appears in this internal queue; no message is sent."
            );
          data.reminderAt = date;
        }
      } else if (op === "bug") {
        if (
          source.sourceType !== "SUPPORT" ||
          row.category !== "ACCOUNT_WEBSITE"
        )
          throw adminDenied();
        for (const [key, value] of Object.entries({
          bugSteps: input.steps,
          bugExpected: input.expected,
          bugActual: input.actual,
          bugEnvironment: input.environment
        }))
          data[key] = postField(
            value ?? "",
            key === "bugEnvironment" ? 300 : 1500
          );
        if (
          ![
            "UNREVIEWED",
            "REPRODUCED",
            "NOT_REPRODUCED",
            "NEEDS_INFORMATION"
          ].includes(String(input.reproducibility))
        )
          throw new PortalError(
            400,
            "Choose the observed reproduction result."
          );
        data.reproducibility = input.reproducibility;
        data.engineeringUrl = adminEngineeringUrl(input.engineeringUrl);
      } else if (op === "assign") {
        if (source.sourceType === "SUPPORT")
          throw new PortalError(
            400,
            "Use the current support owner handoff for this request."
          );
        const username = postField(input.username, 40)
          .replace(/^@/, "")
          .toLowerCase();
        if (!username) {
          data.assignedReviewerId = null;
          data.assignedReviewerProof = null;
        } else {
          const person = await tx.platformUser.findFirst({
            where: { username, ...eligibleWhere },
            select: { id: true }
          });
          if (!person)
            throw new PortalError(
              409,
              "No currently eligible reviewer matches that username."
            );
          const targetAuthority = await adminAuthority(tx, person.id);
          await requireAdminCase(tx, targetAuthority, source);
          data.assignedReviewerId = person.id;
          data.assignedReviewerProof = targetAuthority.assignmentProof;
          targetId = person.id;
        }
      } else if (op === "group") {
        const related = adminSource({
          sourceType: input.relatedSourceType,
          sourceId: input.relatedSourceId
        });
        if (
          related.sourceType === source.sourceType &&
          related.sourceId === source.sourceId
        )
          throw new PortalError(400, "Choose another original request.");
        const other = await requireAdminCase(tx, a, related);
        expected(input.relatedVersion, other.version);
        if (!other.canTriage) throw adminDenied();
        if (row.adminGroupId && other.adminGroupId)
          throw new PortalError(
            409,
            row.adminGroupId === other.adminGroupId
              ? "These requests already share a group."
              : "These requests already belong to different groups. Explicitly ungroup a request before moving it; its history is retained."
          );
        const existingId = row.adminGroupId ?? other.adminGroupId;
        if (existingId) await requireWholeGroup(tx, a, existingId);
        const group = existingId
          ? { id: existingId }
          : await tx.adminCaseGroup.create({
              data: {
                createdById: a.actor.id,
                title: postField(input.title, 120, 1),
                engineeringUrl: adminEngineeringUrl(input.engineeringUrl)
              },
              select: { id: true }
            });
        data.adminGroupId = group.id;
        targetId = group.id;
        const updated = await updateSource(
          tx,
          related,
          { adminGroupId: group.id },
          a.actor.id
        );
        await recordAdminOperation(
          tx,
          a.actor.id,
          {
            ...input,
            requestKey: adminChildRequestKey(
              retry.requestKey,
              related.sourceType + ":" + related.sourceId
            )
          },
          related,
          { version: updated.version },
          group.id
        );
      } else if (op === "ungroup") {
        if (!row.adminGroupId)
          throw new PortalError(409, "This request has no duplicate group.");
        data.adminGroupId = null;
        targetId = row.adminGroupId;
      }
      const next = await updateSource(tx, source, data, a.actor.id);
      const result = {
        ...source,
        version: next.version,
        ...(op === "redact-note" ? { reason: String(input.reason) } : {}),
        message:
          op === "note"
            ? "Internal note saved. It is not a reply to the requester."
            : "Admin change saved. No message was sent."
      };
      await recordAdminOperation(
        tx,
        a.actor.id,
        input,
        source,
        result,
        targetId
      );
      return result;
    },
    true
  );
}

export function adminSavedViewCommand(
  db: PrismaClient,
  token: unknown,
  input: Record<string, unknown>
) {
  return withAdmin(
    db,
    token,
    async (tx, a) => {
      if (!a.canQueue) throw adminDenied();
      const op = String(input.operation);
      if (!["save-view", "delete-view"].includes(op))
        throw new PortalError(400, "Choose a saved-view action.");
      adminFields(input, [
        "operation",
        "requestKey",
        "id",
        "expectedVersion",
        ...(op === "save-view" ? ["name", "filters"] : [])
      ]);
      const retry = await adminPriorOperation(tx, a.actor.id, input);
      const id = input.id ? postId(input.id) : undefined;
      const current = id
        ? await tx.adminSavedView.findFirst({
            where: { id, userId: a.actor.id }
          })
        : null;
      if (id && !current && !retry.prior) throw adminDenied();
      if (retry.prior) return retry.prior;
      if (current) expected(input.expectedVersion, current.version);
      let version = (current?.version ?? 0) + 1,
        resultId = id;
      if (op === "delete-view") {
        if (!current) throw adminDenied();
        await tx.adminSavedView.delete({ where: { id: current.id } });
      } else {
        const filters = adminFilters(input.filters as Record<string, unknown>);
        const name = postField(input.name, 60, 1);
        if (
          !current &&
          (await tx.adminSavedView.count({ where: { userId: a.actor.id } })) >=
            20
        )
          throw new PortalError(
            409,
            "Keep up to twenty private queue views. Remove one before adding another."
          );
        if (
          await tx.adminSavedView.findFirst({
            where: {
              userId: a.actor.id,
              name,
              ...(id ? { id: { not: id } } : {})
            },
            select: { id: true }
          })
        )
          throw new PortalError(409, "A saved view already uses that name.");
        const saved = current
          ? await tx.adminSavedView.update({
              where: { id: current.id },
              data: { name, filters, version: { increment: 1 } }
            })
          : await tx.adminSavedView.create({
              data: { userId: a.actor.id, name, filters }
            });
        resultId = saved.id;
        version = saved.version;
      }
      const result = {
        id: resultId!,
        version,
        message:
          op === "delete-view"
            ? "Private saved view removed."
            : "Private queue view saved. Permissions are checked each time you open it."
      };
      await recordAdminOperation(
        tx,
        a.actor.id,
        input,
        { sourceType: "VIEW", sourceId: resultId! },
        result
      );
      return result;
    },
    true
  );
}
