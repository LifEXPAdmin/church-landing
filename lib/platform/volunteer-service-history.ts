import type {
  PrismaClient,
  PostVolunteerSignup,
  VolunteerApplication
} from "@prisma/client";
import type { ReadIdentity } from "./account-read";
import {
  postContext,
  withPostRead,
  type PostContext,
  type PostTx
} from "./post-access";
import {
  canOrganize,
  canParticipate,
  participationPost
} from "./post-participation";
import {
  opportunitySource,
  requireOpportunityCoordinator,
  unavailableVolunteer
} from "./volunteer-policy";
import { needSource, requireNeedCoordinator } from "./exchange-need-policy";
import { expected, PortalError } from "./portal-policy";
import { postField, postId } from "./post-input";
import {
  clearVolunteerServiceNotesIn,
  recordDiscoveryControl
} from "./retention-controls";
import { recordNeedChange } from "./exchange-need-lifecycle";

export type VolunteerServiceTarget = {
  kind: "signup" | "application";
  id: string;
};
type ServiceRow = PostVolunteerSignup | VolunteerApplication;
type Loaded = {
  target: VolunteerServiceTarget;
  row: ServiceRow;
  ownerId: string;
  postId: string | null;
  opportunityId: string | null;
  needId: string | null;
  title: string;
  active: boolean;
  quarantined: boolean;
};
export type VolunteerServiceRecord = {
  target: VolunteerServiceTarget;
  version: number;
  serviceVersion: number;
  completionVersion: number;
  completedAt: string | null;
  completed: boolean;
  shared: boolean;
  current: boolean;
  recoveryRequired: boolean;
  title: string;
  postId: string | null;
  opportunityId: string | null;
  canComplete: boolean;
  canCorrect: boolean;
  canShare: boolean;
  canHide: boolean;
};

export function volunteerServiceTarget(
  kind: unknown,
  id: unknown
): VolunteerServiceTarget {
  if (kind !== "signup" && kind !== "application")
    throw new PortalError(400, "Choose an existing volunteer service record.");
  return { kind, id: postId(id) };
}
const controlKind = (target: VolunteerServiceTarget) =>
  target.kind === "signup"
    ? ("VOLUNTEER_SERVICE_SIGNUP" as const)
    : ("VOLUNTEER_SERVICE_APPLICATION" as const);

async function load(
  tx: PostTx,
  target: VolunteerServiceTarget
): Promise<Loaded> {
  if (target.kind === "signup") {
    const row = await tx.postVolunteerSignup.findUnique({
      where: { id: target.id },
      include: {
        application: { select: { recoveryRequired: true, state: true } },
        slot: {
          include: {
            opportunity: true,
            exchangeNeedSlot: { select: { needId: true } }
          }
        }
      }
    });
    if (!row) throw unavailableVolunteer();
    return {
      target,
      row,
      ownerId: row.userId,
      postId: row.slot.postId,
      opportunityId: row.slot.opportunity?.id ?? null,
      needId: row.slot.exchangeNeedSlot?.needId ?? null,
      title: row.slot.role,
      active:
        row.state === "ACTIVE" &&
        (!row.application || row.application.state === "ACCEPTED"),
      quarantined:
        !!row.slot.opportunity?.recoveryRequired ||
        !!row.application?.recoveryRequired
    };
  }
  const row = await tx.volunteerApplication.findUnique({
    where: { id: target.id },
    include: { opportunity: true }
  });
  if (!row?.userId || row.signupId || row.opportunity?.slotId)
    throw unavailableVolunteer();
  return {
    target,
    row,
    ownerId: row.userId,
    postId: row.opportunity?.postId ?? null,
    opportunityId: row.opportunityId,
    needId: null,
    title: row.opportunity?.title ?? "Unavailable volunteer service",
    active: row.state === "ACCEPTED",
    quarantined:
      row.recoveryRequired ||
      !row.opportunity ||
      row.opportunity.recoveryRequired
  };
}

// Missing-source recovery retains its opaque control. A restored/recreated older
// row cannot bypass the fence merely because no assignment tombstone was made.
async function recoveryFence(tx: PostTx, record: Loaded) {
  const control = await tx.retentionControl.findFirst({
    where: {
      kind: controlKind(record.target),
      sourceId: record.row.id,
      targetId: record.ownerId
    },
    orderBy: { version: "desc" },
    select: { version: true }
  });
  return !!control && control.version > record.row.serviceVersion;
}

async function source(
  tx: PostTx,
  context: PostContext,
  record: Loaded,
  ownerContext?: PostContext,
  requireOwnerAccess = true
) {
  if (
    record.quarantined ||
    !record.postId ||
    context.blockedIds?.includes(record.ownerId)
  )
    throw unavailableVolunteer();
  const post = await participationPost(tx, context, record.postId);
  if (!post.authorChurchId) throw unavailableVolunteer();
  if (record.opportunityId)
    await opportunitySource(tx, context, record.opportunityId);
  if (record.needId && !(await needSource(tx, record.needId, context)))
    throw unavailableVolunteer();
  // A current organizer may correct an existing receipt after the volunteer
  // leaves. This never grants source access, new completion or profile consent.
  if (!requireOwnerAccess) return post;
  // Consent cannot carry a former volunteer's source rights into a profile.
  const owner =
    context.actorId === record.ownerId
      ? context
      : (ownerContext ?? (await postContext(tx, record.ownerId)));
  const ownerPost =
    owner === context
      ? post
      : await participationPost(tx, owner, record.postId);
  if (!(await canParticipate(tx, owner, ownerPost)))
    throw unavailableVolunteer();
  if (record.needId && !(await needSource(tx, record.needId, owner)))
    throw unavailableVolunteer();
  return post;
}
async function coordinator(
  tx: PostTx,
  context: PostContext,
  record: Loaded,
  checkedPost?: Awaited<ReturnType<typeof participationPost>>,
  correcting = false
) {
  const post =
    checkedPost ?? (await source(tx, context, record, undefined, !correcting));
  if (record.target.kind === "signup") {
    if (!canOrganize(context, post)) throw unavailableVolunteer();
  } else requireOpportunityCoordinator(context, post);
  // A new entry point must not bypass the existing Need coordinator contract.
  if (record.needId) {
    const need = await needSource(tx, record.needId, context);
    if (!need || !context.actorId) throw unavailableVolunteer();
    await requireNeedCoordinator(tx, need, context.actorId);
  }
}
const shared = (row: ServiceRow) =>
  !!row.completedAt &&
  !row.serviceRecoveryRequired &&
  !!row.serviceSharedAt &&
  row.serviceSharedCompletionVersion === row.completionVersion;

export async function volunteerServiceRecordIn(
  tx: PostTx,
  context: PostContext,
  target: VolunteerServiceTarget
): Promise<VolunteerServiceRecord> {
  const record = await load(tx, target),
    own = context.actorId === record.ownerId;
  let current = false,
    canOrganizeRecord = false,
    checkedPost;
  try {
    checkedPost = await source(tx, context, record);
    current = true;
  } catch (error) {
    if (!(error instanceof PortalError && error.status === 404)) throw error;
  }
  if (current || record.row.completedAt) {
    try {
      // A retained receipt can be corrected without reopening the former
      // volunteer's private source details. Actor and Need authority still
      // apply; only the volunteer's source access may be absent.
      await coordinator(tx, context, record, checkedPost, !current);
      canOrganizeRecord = true;
    } catch (error) {
      if (!(error instanceof PortalError && [403, 404].includes(error.status)))
        throw error;
    }
  }
  if (!own && !canOrganizeRecord) throw unavailableVolunteer();
  const fenced = await recoveryFence(tx, record);
  const recoveryRequired = record.row.serviceRecoveryRequired || fenced;
  const completed = !!record.row.completedAt && !recoveryRequired;
  return {
    target,
    version: record.row.version,
    serviceVersion: record.row.serviceVersion,
    completionVersion: record.row.completionVersion,
    completedAt: completed ? record.row.completedAt!.toISOString() : null,
    completed,
    shared: own && !recoveryRequired && shared(record.row),
    current,
    recoveryRequired,
    title: current ? record.title : "Unavailable volunteer service",
    postId: current ? record.postId : null,
    opportunityId: current ? record.opportunityId : null,
    canComplete:
      current &&
      !fenced &&
      canOrganizeRecord &&
      record.active &&
      (!completed || recoveryRequired),
    canCorrect: canOrganizeRecord && !!record.row.completedAt && !fenced,
    canShare: own && current && record.active && completed,
    canHide: own && (!!record.row.serviceSharedAt || recoveryRequired)
  };
}

function boolean(value: unknown, message: string): boolean {
  if (typeof value !== "boolean") throw new PortalError(400, message);
  return value;
}
function version(value: unknown) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
    throw new PortalError(
      400,
      "Use the version from the current service record."
    );
  return value;
}

/** Run before receipt lookup under the same permission and original-session lock. */
export async function authorizeVolunteerServiceIn(
  tx: PostTx,
  actorId: string,
  input: Record<string, unknown>
) {
  const target = volunteerServiceTarget(input.targetKind, input.targetId);
  const record = await load(tx, target),
    priorVersion = version(input.expectedVersion);
  if (input.operation === "complete") {
    const completed = boolean(
      input.completed,
      "Choose whether the service was completed."
    );
    postField(input.reason, 500, !completed && record.row.completedAt ? 3 : 0);
    await coordinator(
      tx,
      await postContext(tx, actorId),
      record,
      undefined,
      !completed
    );
    if (await recoveryFence(tx, record))
      throw new PortalError(
        409,
        "Protected recovery must reconcile this service record before confirmation."
      );
    if (
      record.row.version !== priorVersion &&
      !(
        record.row.version === priorVersion + 1 &&
        !record.row.serviceRecoveryRequired &&
        !!record.row.completedAt === completed
      )
    )
      throw new PortalError(
        409,
        "This service record changed. Review its current confirmation."
      );
    return;
  }
  const disclose = boolean(
    input.shared,
    "Choose whether to show this completed service on your member profile."
  );
  const completionVersion = version(input.completionVersion);
  if (record.ownerId !== actorId) throw unavailableVolunteer();
  if (disclose) {
    await source(tx, await postContext(tx, actorId), record);
    if (
      !record.active ||
      !record.row.completedAt ||
      record.row.serviceRecoveryRequired ||
      (await recoveryFence(tx, record))
    )
      throw new PortalError(
        409,
        "Only currently confirmed service can be shared. Keep this record private."
      );
  }
  if (
    record.row.completionVersion !== completionVersion ||
    (record.row.serviceVersion !== priorVersion &&
      !(
        record.row.serviceVersion === priorVersion + 1 &&
        !!record.row.serviceSharedAt === disclose
      ))
  )
    throw new PortalError(
      409,
      "This service choice changed. Review the current record before saving."
    );
}

export async function recordVolunteerCompletionIn(
  tx: PostTx,
  context: PostContext,
  target: VolunteerServiceTarget,
  expectedVersion: unknown,
  completedValue: unknown,
  reasonValue: unknown
) {
  const record = await load(tx, target);
  if (!context.actorId)
    throw new PortalError(401, "Sign in to confirm service.");
  const completed = boolean(
    completedValue,
    "Choose whether the service was completed."
  );
  await coordinator(tx, context, record, undefined, !completed);
  if (await recoveryFence(tx, record))
    throw new PortalError(
      409,
      "Protected recovery must reconcile this service record before confirmation."
    );
  expected(expectedVersion, record.row.version);
  const reason = postField(
    reasonValue,
    500,
    !completed && record.row.completedAt ? 3 : 0
  );
  if (completed && !record.active)
    throw new PortalError(
      409,
      "Only an active accepted assignment can be confirmed completed."
    );
  if (
    completed &&
    record.row.completedAt &&
    !record.row.serviceRecoveryRequired
  )
    throw new PortalError(
      409,
      "This service is already confirmed. Correct an inaccurate receipt before confirming it again."
    );
  if (
    !completed &&
    !record.row.completedAt &&
    !record.row.serviceRecoveryRequired
  )
    throw new PortalError(409, "This service has no completion to correct.");
  // Legacy writers can quarantine a receipt without replay changing its equal
  // service revision. Remove protected historical copies before a deliberate
  // correction/confirmation ends quarantine and adds its fresh note.
  if (record.row.serviceRecoveryRequired)
    await clearVolunteerServiceNotesIn(tx, controlKind(target), record.row.id);
  const data = {
    completedAt: completed ? new Date() : null,
    completionNote: reason,
    completionVersion: { increment: 1 },
    serviceVersion: { increment: 1 },
    version: { increment: 1 },
    serviceSharedAt: null,
    serviceSharedCompletionVersion: null,
    serviceRecoveryRequired: false
  };
  const saved =
    target.kind === "signup"
      ? await tx.postVolunteerSignup.update({ where: { id: target.id }, data })
      : await tx.volunteerApplication.update({
          where: { id: target.id },
          data: { ...data, availability: "" }
        });
  if (target.kind === "application")
    await tx.volunteerApplicationEvent.create({
      data: {
        applicationId: saved.id,
        actorId: context.actorId,
        version: saved.version,
        action: completed ? "COMPLETED" : "COMPLETION_CORRECTED",
        note: reason
      }
    });
  else
    await tx.postAudit.create({
      data: {
        postId: record.postId!,
        actorId: context.actorId,
        action: completed
          ? "volunteer-completed"
          : "volunteer-completion-corrected",
        targetId: saved.id,
        version: saved.version
      }
    });
  if (record.needId)
    await recordNeedChange(
      tx,
      record.needId,
      context.actorId,
      completed ? "VOLUNTEER_COMPLETED" : "VOLUNTEER_COMPLETION_CORRECTED",
      { targetId: saved.id, ...(reason ? { text: reason } : {}) }
    );
  await recordDiscoveryControl(
    tx,
    controlKind(target),
    record.ownerId,
    saved.id,
    saved.serviceVersion
  );
  return {
    id: saved.id,
    version: saved.version,
    message: completed
      ? "Completed volunteer service confirmed. Profile sharing remains the volunteer’s choice."
      : "Volunteer completion corrected. Any profile sharing has been removed."
  };
}

export async function setVolunteerServiceConsentIn(
  tx: PostTx,
  actorId: string,
  input: Record<string, unknown>
) {
  const target = volunteerServiceTarget(input.targetKind, input.targetId),
    record = await load(tx, target);
  await authorizeVolunteerServiceIn(tx, actorId, input);
  expected(input.expectedVersion, record.row.serviceVersion);
  const disclose = input.shared === true;
  const fenced = await recoveryFence(tx, record);
  const data = {
    serviceVersion: { increment: 1 },
    // An owned withdrawal remains possible after restore, but cannot consume
    // an opaque fence and resurrect the old confirmation or historical notes.
    ...(fenced ? { serviceRecoveryRequired: true, completionNote: "" } : {}),
    serviceSharedAt: disclose ? new Date() : null,
    serviceSharedCompletionVersion: disclose
      ? record.row.completionVersion
      : null
  };
  const row =
    target.kind === "signup"
      ? await tx.postVolunteerSignup.update({ where: { id: target.id }, data })
      : await tx.volunteerApplication.update({
          where: { id: target.id },
          data
        });
  if (fenced)
    await clearVolunteerServiceNotesIn(tx, controlKind(target), row.id);
  await recordDiscoveryControl(
    tx,
    controlKind(target),
    actorId,
    row.id,
    row.serviceVersion
  );
  return {
    id: row.id,
    version: row.serviceVersion,
    message: disclose
      ? "This confirmed service may appear on your member profile only while its source remains available to the viewer."
      : "This service is private. Its completion and assignment have not changed."
  };
}

const PAGE = 25;
function cursor(value?: string | null) {
  if (!value) return null;
  const match = /^([as])_([A-Za-z0-9_-]{1,100})$/.exec(value);
  if (!match)
    throw new PortalError(400, "Use the current service history continuation.");
  return { prefix: match[1], id: match[2] };
}
async function targets(
  tx: PostTx,
  ownerId: string,
  after?: string | null,
  disclosed = false
) {
  const page = cursor(after);
  const visibility = disclosed
    ? {
        serviceSharedAt: { not: null },
        completedAt: { not: null },
        serviceRecoveryRequired: false
      }
    : {};
  const [applications, signups] = await Promise.all([
    page?.prefix === "s"
      ? []
      : tx.volunteerApplication.findMany({
          where: {
            userId: ownerId,
            signupId: null,
            AND: [
              {
                OR: [{ opportunity: { slotId: null } }, { opportunityId: null }]
              }
            ],
            OR: [{ state: "ACCEPTED" }, { completedAt: { not: null } }],
            ...(page ? { id: { gt: page.id } } : {}),
            ...visibility
          },
          orderBy: { id: "asc" },
          take: PAGE + 1,
          select: { id: true }
        }),
    tx.postVolunteerSignup.findMany({
      where: {
        userId: ownerId,
        OR: [{ state: "ACTIVE" }, { completedAt: { not: null } }],
        ...(page?.prefix === "s" ? { id: { gt: page.id } } : {}),
        ...visibility
      },
      orderBy: { id: "asc" },
      take: PAGE + 1,
      select: { id: true }
    })
  ]);
  return [
    ...applications.map((row) => ({
      kind: "application" as const,
      id: row.id,
      cursor: `a_${row.id}`
    })),
    ...signups.map((row) => ({
      kind: "signup" as const,
      id: row.id,
      cursor: `s_${row.id}`
    }))
  ].slice(0, PAGE + 1);
}
export function readVolunteerServiceHistory(
  db: PrismaClient,
  token: unknown,
  after?: string | null,
  identity?: ReadIdentity
) {
  return withPostRead(
    db,
    token,
    async (tx, context) => {
      if (!context.actorId)
        throw new PortalError(
          401,
          "Sign in to view your volunteer service history."
        );
      const rows = await targets(tx, context.actorId, after),
        items: VolunteerServiceRecord[] = [];
      for (const row of rows.slice(0, PAGE)) {
        try {
          items.push(await volunteerServiceRecordIn(tx, context, row));
        } catch (error) {
          if (!(error instanceof PortalError && error.status === 404))
            throw error;
        }
      }
      return {
        ownerId: context.actorId,
        items,
        nextCursor: rows.length > PAGE ? rows[PAGE - 1].cursor : null
      };
    },
    identity
  );
}
export async function profileVolunteerServiceIn(
  tx: PostTx,
  context: PostContext,
  ownerId: string
) {
  const rows = await targets(tx, ownerId, null, true),
    items: {
      kind: VolunteerServiceTarget["kind"];
      id: string;
      title: string;
      completedAt: string;
      postId: string;
      opportunityId: string | null;
    }[] = [];
  const ownerContext =
    rows.length && context.actorId !== ownerId
      ? await postContext(tx, ownerId)
      : context;
  for (const target of rows.slice(0, PAGE)) {
    try {
      const record = await load(tx, target);
      if (
        !record.active ||
        !shared(record.row) ||
        (await recoveryFence(tx, record))
      )
        continue;
      await source(tx, context, record, ownerContext);
      items.push({
        kind: target.kind,
        id: target.id,
        title: record.title,
        completedAt: record.row.completedAt!.toISOString(),
        postId: record.postId!,
        opportunityId: record.opportunityId
      });
    } catch (error) {
      if (!(error instanceof PortalError && error.status === 404)) throw error;
    }
  }
  return items;
}
