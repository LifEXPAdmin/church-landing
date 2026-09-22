import type { Prisma, VolunteerApplication } from "@prisma/client";
import {
  postCanEdit,
  postContext,
  type PostContext,
  type PostTx
} from "./post-access";
import {
  participationActive,
  participationPost,
  canParticipate
} from "./post-participation";
import { postId } from "./post-input";
import { eligibleWhere, PortalError } from "./portal-policy";
import { volunteerShift } from "./volunteer-shift";

export const unavailableVolunteer = () =>
  new PortalError(
    404,
    "This volunteer opportunity or application is unavailable."
  );

export function canCoordinateOpportunity(
  context: PostContext,
  post: { authorChurchId: string | null }
) {
  return !!post.authorChurchId && context.volunteers.has(post.authorChurchId);
}

export async function opportunitySource(
  tx: PostTx,
  context: PostContext,
  id: unknown
) {
  const row = await tx.volunteerOpportunity.findUnique({
    where: { id: postId(id) },
    include: { slot: true }
  });
  if (!row?.postId || row.recoveryRequired) throw unavailableVolunteer();
  const post = await participationPost(tx, context, row.postId);
  if (!post.authorChurchId || (row.slot && row.slot.postId !== post.id))
    throw unavailableVolunteer();
  return { row, post };
}

export function requireOpportunityCoordinator(
  context: PostContext,
  post: Awaited<ReturnType<typeof participationPost>>,
  editing = false
) {
  if (
    !canCoordinateOpportunity(context, post) ||
    (editing && !postCanEdit(context, post))
  )
    throw unavailableVolunteer();
}

export function requireOpportunityOpen(
  source: Awaited<ReturnType<typeof opportunitySource>>
) {
  const { row, post } = source;
  if (row.closedAt || row.slot?.closedAt || !participationActive(post))
    throw new PortalError(
      409,
      "This opportunity is closed to new applications and assignments."
    );
  if (row.slot) {
    if (!post.eventOccurrence) throw unavailableVolunteer();
    const time = volunteerShift(row.slot, post.eventOccurrence);
    if (time.conflict || time.endAt <= new Date())
      throw new PortalError(
        409,
        "The shift has ended or its times need the coordinator to review the changed event."
      );
  }
}

export async function requireVolunteerApplicant(
  tx: PostTx,
  userId: string,
  opportunityId: string
) {
  const context = await postContext(tx, userId);
  const source = await opportunitySource(tx, context, opportunityId);
  if (!(await canParticipate(tx, context, source.post)))
    throw unavailableVolunteer();
  return { context, ...source };
}

export async function ownedVolunteerApplication(
  tx: PostTx,
  userId: string,
  id: unknown
) {
  const row = await tx.volunteerApplication.findUnique({
    where: { id: postId(id) },
    include: { signup: true }
  });
  if (!row || row.userId !== userId) throw unavailableVolunteer();
  return row;
}

export async function reviewedVolunteerApplication(
  tx: PostTx,
  context: PostContext,
  id: unknown
) {
  const row = await tx.volunteerApplication.findUnique({
    where: { id: postId(id) },
    include: { signup: true }
  });
  if (
    !row?.opportunityId ||
    !row.userId ||
    row.recoveryRequired ||
    context.blockedIds?.includes(row.userId)
  )
    throw unavailableVolunteer();
  const source = await opportunitySource(tx, context, row.opportunityId);
  requireOpportunityCoordinator(context, source.post);
  // A former applicant's current source rights do not survive revocation.
  await requireVolunteerApplicant(tx, row.userId, row.opportunityId);
  return { row, source };
}

export function applicationIsTerminal(
  row: Pick<VolunteerApplication, "state">
) {
  return row.state === "DECLINED" || row.state === "WITHDRAWN";
}

/** Current eligibility for a bounded queue on one already-authorized church source. */
export function volunteerApplicantWhere(
  source: Awaited<ReturnType<typeof opportunitySource>>
): Prisma.PlatformUserWhereInput {
  const { post } = source;
  // New source kinds must acquire their own explicit applicant policy before
  // this reader can expose private applications for them.
  if (
    !post.authorChurchId ||
    post.groupId ||
    post.topicCommunityId ||
    !["PUBLIC", "CHURCH"].includes(post.audience)
  )
    throw unavailableVolunteer();
  const churches = new Set<string>();
  if (post.audienceChurchId) churches.add(post.audienceChurchId);
  const event = post.eventOccurrence?.event;
  if (event?.visibility === "CHURCH") {
    if (!event.calendar.churchId) throw unavailableVolunteer();
    churches.add(event.calendar.churchId);
  }
  return {
    ...eligibleWhere,
    AND: [...churches].map((churchId) => ({
      connections: { some: { churchId, state: "APPROVED" } }
    }))
  };
}
