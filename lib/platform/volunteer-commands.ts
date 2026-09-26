import type { PrismaClient } from "@prisma/client";
import { postContext, type PostTx } from "./post-access";
import {
  participationCommandIn,
  participationPost
} from "./post-participation";
import { expected, PortalError } from "./portal-policy";
import { postField, postId } from "./post-input";
import { socialCommand, socialInput } from "./social-operations";
import { recordDiscoveryControl } from "./retention-controls";
import { recordVolunteerApplicationChange } from "./volunteer-lifecycle";
import {
  applicationIsTerminal,
  opportunitySource,
  ownedVolunteerApplication,
  requireOpportunityCoordinator,
  requireOpportunityOpen,
  requireVolunteerApplicant,
  reviewedVolunteerApplication,
  unavailableVolunteer
} from "./volunteer-policy";

const fields: Record<string, string[]> = {
  save: [
    "id",
    "postId",
    "postVersion",
    "title",
    "duties",
    "requirements",
    "contact",
    "commitment",
    "capacity",
    "closed",
    "independentTime",
    "shiftStartLocal",
    "shiftEndLocal",
    "slotVersion"
  ],
  apply: [
    "opportunityId",
    "opportunityVersion",
    "slotVersion",
    "eventVersion",
    "occurrenceVersion",
    "statement",
    "availability",
    "confirmed"
  ],
  withdraw: ["id"],
  availability: ["id", "availability"],
  accept: [
    "id",
    "opportunityVersion",
    "slotVersion",
    "eventVersion",
    "occurrenceVersion"
  ],
  decline: ["id", "note"],
  cancel: ["id"]
};
function capacity(value: unknown) {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > 500
  )
    throw new PortalError(400, "Choose a capacity from 1 to 500.");
  return value;
}
function receipt(row: { id: string; version: number }, message: string) {
  return { id: row.id, version: row.version, message };
}
async function editable(
  tx: PostTx,
  actorId: string,
  input: Record<string, unknown>
) {
  const context = await postContext(tx, actorId);
  const prior = await tx.volunteerOpportunity.findUnique({
    where: { id: postId(input.id) },
    include: { slot: true }
  });
  if (prior?.recoveryRequired || (prior && prior.postId !== input.postId))
    throw unavailableVolunteer();
  const post = await participationPost(tx, context, input.postId);
  requireOpportunityCoordinator(context, post, true);
  return { context, prior, post };
}
// Recheck current rights before receipt lookup, including after a grant, source,
// account or assignment has been revoked. Retried payloads cannot restore it.
async function authorized(
  tx: PostTx,
  actorId: string,
  op: string,
  input: Record<string, unknown>
) {
  const version = input.expectedVersion;
  if (
    typeof version !== "number" ||
    !Number.isSafeInteger(version) ||
    version < 0
  )
    throw new PortalError(
      400,
      "Use the version from the current volunteer form."
    );
  const unchangedOrJustSaved = (current: number, saved: boolean) => {
    if (current !== version && !(saved && current === version + 1))
      throw new PortalError(
        409,
        "This volunteer record changed after that request. Review its current state."
      );
  };
  if (op === "save") {
    const { prior } = await editable(tx, actorId, input);
    if (prior) unchangedOrJustSaved(prior.version, true);
    return;
  }
  if (op === "withdraw") {
    const prior = await ownedVolunteerApplication(tx, actorId, input.id);
    unchangedOrJustSaved(prior.version, prior.state === "WITHDRAWN");
    return;
  }
  if (op === "availability") {
    const prior = await ownedVolunteerApplication(tx, actorId, input.id);
    const availability = postField(input.availability, 500, 0);
    unchangedOrJustSaved(prior.version, true);
    if (availability) {
      if (
        !prior.opportunityId ||
        prior.recoveryRequired ||
        applicationIsTerminal(prior) ||
        prior.signup?.state === "CANCELED" ||
        prior.signup?.completedAt
      )
        throw unavailableVolunteer();
      await requireVolunteerApplicant(tx, actorId, prior.opportunityId);
    }
    return;
  }
  if (op === "apply") {
    await requireVolunteerApplicant(tx, actorId, postId(input.opportunityId));
    const prior = await tx.volunteerApplication.findUnique({
      where: {
        opportunityId_userId: {
          opportunityId: postId(input.opportunityId),
          userId: actorId
        }
      }
    });
    if (prior?.recoveryRequired) throw unavailableVolunteer();
    if (prior) unchangedOrJustSaved(prior.version, prior.state === "SUBMITTED");
    // A new deliberate reapplication supplies the terminal row's version; an
    // earlier request must not replay its submission after withdrawal.
    if (
      prior &&
      applicationIsTerminal(prior) &&
      input.expectedVersion !== prior.version
    )
      throw new PortalError(
        409,
        "This application ended. Review current details before deliberately applying again."
      );
    return;
  }
  const { row } = await reviewedVolunteerApplication(
    tx,
    await postContext(tx, actorId),
    input.id
  );
  unchangedOrJustSaved(
    row.version,
    row.state ===
      (op === "accept"
        ? "ACCEPTED"
        : op === "decline"
          ? "DECLINED"
          : "WITHDRAWN")
  );
  if (
    op === "accept" &&
    (applicationIsTerminal(row) || row.signup?.state === "CANCELED")
  )
    throw new PortalError(
      409,
      "This application or assignment ended. An earlier acceptance cannot restore it."
    );
}

function versions(
  input: Record<string, unknown>,
  source: Awaited<ReturnType<typeof opportunitySource>>
) {
  expected(input.opportunityVersion, source.row.version);
  if (source.row.slot) {
    expected(input.slotVersion, source.row.slot.version);
    expected(input.eventVersion, source.post.eventOccurrence!.event.version);
    expected(input.occurrenceVersion, source.post.eventOccurrence!.version);
  }
  return {
    opportunityVersion: source.row.version,
    slotVersion: source.row.slot?.version ?? null,
    eventVersion: source.row.slot
      ? source.post.eventOccurrence!.event.version
      : null,
    occurrenceVersion: source.row.slot
      ? source.post.eventOccurrence!.version
      : null
  };
}

async function save(
  tx: PostTx,
  actorId: string,
  input: Record<string, unknown>
) {
  const { context, prior, post } = await editable(tx, actorId, input);
  expected(input.expectedVersion, prior?.version ?? 0);
  expected(input.postVersion, post.version);
  const data = {
    title: postField(input.title, 100, 2),
    duties: postField(input.duties, 2000, 3),
    requirements: postField(input.requirements, 1000, 0),
    contact: postField(input.contact, 300, 0),
    commitment: postField(input.commitment, 300, post.eventOccurrence ? 0 : 3)
  };
  const places = capacity(input.capacity);
  if (typeof input.closed !== "boolean")
    throw new PortalError(400, "Choose whether applications are open.");
  if (prior && !!prior.slotId !== !!post.eventOccurrence)
    throw new PortalError(
      409,
      "The source event changed. Keep the existing assignments and publish a new opportunity."
    );
  if (
    prior &&
    ["title", "duties", "requirements", "commitment"].some(
      (k) => data[k as keyof typeof data] !== prior[k as keyof typeof data]
    ) &&
    (await tx.volunteerApplication.count({
      where: { opportunityId: prior.id }
    }))
  )
    throw new PortalError(
      409,
      "This opportunity already has applications. Keep its duty and requirements or publish a new opportunity."
    );
  if (
    !prior &&
    (await tx.volunteerOpportunity.count({ where: { postId: post.id } })) >= 12
  )
    throw new PortalError(
      409,
      "Use up to twelve opportunities on one church post."
    );
  let slotId: string | null = null;
  if (post.eventOccurrence) {
    if (prior?.slot) expected(input.slotVersion, prior.slot.version);
    const saved = await participationCommandIn(
      tx,
      context,
      {
        operation: "configure-slot",
        postId: post.id,
        requestKey: prior?.slot?.requestKey ?? input.mutationId,
        ...(prior?.slotId ? { slotId: prior.slotId } : {}),
        expectedVersion: prior?.slot?.version ?? 0,
        role: data.title,
        capacity: places,
        closed: input.closed,
        independentTime: input.independentTime,
        shiftStartLocal: input.shiftStartLocal,
        shiftEndLocal: input.shiftEndLocal
      },
      prior ? { opportunityId: prior.id } : undefined
    );
    slotId = saved.id;
  } else {
    if (input.independentTime || input.shiftStartLocal || input.shiftEndLocal)
      throw new PortalError(
        400,
        "An ongoing role uses the stated commitment; timed shifts need a real event."
      );
    if (
      prior &&
      places <
        (await tx.volunteerApplication.count({
          where: { opportunityId: prior.id, state: "ACCEPTED" }
        }))
    )
      throw new PortalError(
        409,
        "Capacity cannot be reduced below accepted assignments."
      );
  }
  const values = {
    ...data,
    slotId,
    capacity: slotId ? null : places,
    closedAt: input.closed ? new Date() : null
  };
  const row = prior
    ? await tx.volunteerOpportunity.update({
        where: { id: prior.id },
        data: { ...values, version: { increment: 1 } }
      })
    : await tx.volunteerOpportunity.create({
        data: { id: postId(input.id), postId: post.id, ...values }
      });
  await recordDiscoveryControl(
    tx,
    "VOLUNTEER_OPPORTUNITY",
    actorId,
    row.id,
    row.version
  );
  return receipt(
    row,
    "Opportunity saved. Applications require coordinator approval; existing assignments are preserved."
  );
}

async function apply(
  tx: PostTx,
  actorId: string,
  input: Record<string, unknown>
) {
  const source = await requireVolunteerApplicant(
    tx,
    actorId,
    postId(input.opportunityId)
  );
  requireOpportunityOpen(source);
  if (input.confirmed !== true)
    throw new PortalError(
      400,
      "Confirm that you understand the commitment and need coordinator approval."
    );
  const snapshot = versions(input, source);
  const prior = await tx.volunteerApplication.findUnique({
    where: {
      opportunityId_userId: { opportunityId: source.row.id, userId: actorId }
    }
  });
  expected(input.expectedVersion, prior?.version ?? 0);
  if (prior?.recoveryRequired || prior?.state === "ACCEPTED")
    throw new PortalError(
      409,
      "Review or withdraw your existing assignment before a new application."
    );
  if (
    prior?.state === "SUBMITTED" &&
    Object.entries(snapshot).every(
      ([key, value]) => prior[key as keyof typeof snapshot] === value
    )
  )
    throw new PortalError(
      409,
      "Your application is already submitted. Withdraw it before making a new application."
    );
  const data = {
    ...snapshot,
    signupId: null,
    state: "SUBMITTED" as const,
    statement: postField(input.statement, 1000, 0),
    availability: postField(input.availability ?? "", 500, 0),
    decisionNote: ""
  };
  const row = prior
    ? await tx.volunteerApplication.update({
        where: { id: prior.id },
        data: { ...data, version: { increment: 1 } }
      })
    : await tx.volunteerApplication.create({
        data: { ...data, opportunityId: source.row.id, userId: actorId }
      });
  await recordVolunteerApplicationChange(tx, row, actorId, "SUBMITTED");
  return receipt(
    row,
    "Application submitted for review. No place, church role or additional access has been granted."
  );
}

async function review(
  tx: PostTx,
  actorId: string,
  input: Record<string, unknown>,
  accept: boolean
) {
  const { row: prior, source } = await reviewedVolunteerApplication(
    tx,
    await postContext(tx, actorId),
    input.id
  );
  expected(input.expectedVersion, prior.version);
  if (prior.state !== "SUBMITTED")
    throw new PortalError(
      409,
      "Review the current application state before making another decision."
    );
  const note = accept ? "" : postField(input.note, 500, 0);
  let signupId = prior.signupId;
  if (accept) {
    requireOpportunityOpen(source);
    const snapshot = versions(input, source);
    if (
      Object.entries(snapshot).some(
        ([key, value]) => prior[key as keyof typeof snapshot] !== value
      )
    )
      throw new PortalError(
        409,
        "The commitment changed after this application. Ask the applicant to review and confirm the current details first."
      );
    if (source.row.slot) {
      const applicant = await requireVolunteerApplicant(
        tx,
        prior.userId!,
        source.row.id
      );
      const signup = await tx.postVolunteerSignup.findUnique({
        where: {
          slotId_userId: { slotId: source.row.slot.id, userId: prior.userId! }
        }
      });
      const reserved = await participationCommandIn(
        tx,
        applicant.context,
        {
          operation: "volunteer",
          postId: source.post.id,
          slotId: source.row.slot.id,
          slotVersion: source.row.slot.version,
          expectedVersion: signup?.version ?? 0
        },
        { applicationId: prior.id, coordinatorId: actorId }
      );
      signupId = reserved.id;
    } else if (
      (await tx.volunteerApplication.count({
        where: { opportunityId: source.row.id, state: "ACCEPTED" }
      })) >= source.row.capacity!
    ) {
      throw new PortalError(
        409,
        "This role is full. The application remains submitted and no assignment was made."
      );
    }
  }
  const state = accept ? "ACCEPTED" : "DECLINED";
  const row = await tx.volunteerApplication.update({
    where: { id: prior.id },
    data: {
      state,
      signupId,
      decisionNote: note,
      ...(!accept ? { availability: "" } : {}),
      version: { increment: 1 }
    }
  });
  await recordVolunteerApplicationChange(tx, row, actorId, state, note);
  return receipt(
    row,
    accept
      ? "Application accepted and one volunteer assignment confirmed. Church authority and other access are unchanged."
      : "Application declined. Its private decision history is retained."
  );
}

async function withdraw(
  tx: PostTx,
  actorId: string,
  input: Record<string, unknown>,
  coordinator: boolean
) {
  const prior = coordinator
    ? (
        await reviewedVolunteerApplication(
          tx,
          await postContext(tx, actorId),
          input.id
        )
      ).row
    : await ownedVolunteerApplication(tx, actorId, input.id);
  expected(input.expectedVersion, prior.version);
  if (
    coordinator
      ? prior.state !== "ACCEPTED"
      : !["SUBMITTED", "ACCEPTED"].includes(prior.state)
  )
    throw new PortalError(
      409,
      "This application or assignment has already ended."
    );
  if (prior.signup?.completedAt)
    throw new PortalError(
      409,
      "Completed help needs the existing reasoned receipt correction before withdrawal."
    );
  if (prior.state === "ACCEPTED" && prior.signup) {
    await participationCommandIn(
      tx,
      await postContext(tx, prior.userId!),
      {
        operation: "cancel-volunteer",
        signupId: prior.signup.id,
        expectedVersion: prior.signup.version
      },
      coordinator ? { coordinatorId: actorId } : undefined
    );
    const row = await tx.volunteerApplication.findUniqueOrThrow({
      where: { id: prior.id }
    });
    return receipt(
      row,
      "Volunteer assignment canceled. Its decision history is retained and the place is released once."
    );
  }
  const row = await tx.volunteerApplication.update({
    where: { id: prior.id },
    data: { state: "WITHDRAWN", availability: "", version: { increment: 1 } }
  });
  await recordVolunteerApplicationChange(
    tx,
    row,
    actorId,
    prior.state === "ACCEPTED" ? "CANCELED" : "WITHDRAWN"
  );
  return receipt(
    row,
    "Application or assignment withdrawn. Its private history is retained."
  );
}

async function saveAvailability(
  tx: PostTx,
  actorId: string,
  input: Record<string, unknown>
) {
  const prior = await ownedVolunteerApplication(tx, actorId, input.id);
  expected(input.expectedVersion, prior.version);
  const availability = postField(input.availability, 500, 0);
  if (availability) {
    if (
      !prior.opportunityId ||
      prior.recoveryRequired ||
      applicationIsTerminal(prior) ||
      prior.signup?.state === "CANCELED" ||
      prior.signup?.completedAt
    )
      throw unavailableVolunteer();
    await requireVolunteerApplicant(tx, actorId, prior.opportunityId);
  }
  const row = await tx.volunteerApplication.update({
    where: { id: prior.id },
    data: { availability, version: { increment: 1 } }
  });
  // Record the change, never the private preference text, in history/recovery.
  await recordVolunteerApplicationChange(
    tx,
    row,
    actorId,
    "AVAILABILITY_UPDATED"
  );
  return receipt(
    row,
    availability
      ? "Availability saved for this opportunity's current authorized coordinators. Your assignment and calendar have not changed."
      : "Availability removed. Your assignment and calendar have not changed."
  );
}

export function volunteerCommand(
  db: PrismaClient,
  token: unknown,
  input: Record<string, unknown>
) {
  const op = String(input.operation);
  if (!fields[op])
    throw new PortalError(400, "Choose a supported volunteer action.");
  socialInput(input, [
    "operation",
    "mutationId",
    "expectedVersion",
    ...fields[op]
  ]);
  return socialCommand(
    db,
    token,
    "volunteer",
    input,
    (tx, actorId) => {
      if (op === "save") return save(tx, actorId, input);
      if (op === "apply") return apply(tx, actorId, input);
      if (op === "availability") return saveAvailability(tx, actorId, input);
      if (op === "withdraw" || op === "cancel")
        return withdraw(tx, actorId, input, op === "cancel");
      return review(tx, actorId, input, op === "accept");
    },
    (tx, actorId) => authorized(tx, actorId, op, input)
  );
}
