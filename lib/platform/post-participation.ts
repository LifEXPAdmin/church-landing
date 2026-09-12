import type { PrismaClient, PlatformPost } from "@prisma/client";
import { withOwnedSession } from "./account-sessions";
import { postSchedule } from "./post-commands";
import { eligibleWhere, expected, PortalError } from "./portal-policy";
import {
  postCanEdit,
  postContext,
  postReadableWhere,
  type PostContext,
  type PostTx
} from "./post-access";
import { postField, postId } from "./post-input";

export const participationInclude = {
  eventOccurrence: { include: { event: { include: { calendar: true } } } }
} as const;
export async function participationPost(
  tx: PostTx,
  context: PostContext,
  id: unknown
) {
  const post = await tx.platformPost.findFirst({
    where: { AND: [{ id: postId(id) }, postReadableWhere(context)] },
    include: participationInclude
  });
  if (!post) throw new PortalError(404, "This post is unavailable.");
  return post;
}
export function canOrganize(context: PostContext, post: PlatformPost) {
  return (
    !!post.authorChurchId &&
    !!post.eventOccurrenceId &&
    context.volunteers.has(post.authorChurchId)
  );
}
export function participationActive(
  post: Awaited<ReturnType<typeof participationPost>>
) {
  const event = post.eventOccurrence;
  return (
    !event ||
    (!event.canceledAt && !event.event.canceledAt && event.endAt > new Date())
  );
}
export async function canParticipate(
  tx: PostTx,
  context: PostContext,
  post: PlatformPost
) {
  if (
    !context.actorId ||
    (post.audienceChurchId && !context.churches.includes(post.audienceChurchId))
  )
    return false;
  return !!(await tx.platformUser.findFirst({
    where: { id: context.actorId, ...eligibleWhere },
    select: { id: true }
  }));
}
async function audit(
  tx: PostTx,
  postId: string,
  actorId: string,
  action: string,
  targetId: string,
  version: number
) {
  await tx.postAudit.create({
    data: { postId, actorId, action, targetId, version }
  });
}
function pollDetails(input: Record<string, unknown>) {
  if (typeof input.multiple !== "boolean")
    throw new PortalError(400, "Choose single or multiple choice.");
  if (
    !Array.isArray(input.options) ||
    input.options.length < 2 ||
    input.options.length > 8
  )
    throw new PortalError(400, "Use two to eight poll options.");
  const labels = input.options.map((v) => postField(v, 100, 1));
  if (new Set(labels.map((v) => v.toLowerCase())).size !== labels.length)
    throw new PortalError(400, "Use distinct poll options.");
  const schedule = postSchedule(input.closesLocal, input.timeZone);
  return {
    question: postField(input.question, 200, 3),
    multiple: input.multiple,
    closesAt: schedule.scheduleAt,
    closesLocal: schedule.scheduleLocal,
    timeZone: schedule.scheduleZone,
    labels
  };
}
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
export async function participationCommandIn(
  tx: PostTx,
  context: PostContext,
  input: Record<string, unknown>
) {
  const actorId = context.actorId;
  if (!actorId) throw new PortalError(401, "Sign in to continue.");
  if (input.userId !== undefined || input.authorId !== undefined)
    throw new PortalError(
      400,
      "Your current sign-in identifies your participation."
    );
  const operation = input.operation;
  // A participant can always cancel their own reservation after losing source
  // access. This returns no current event, church, role or roster information.
  if (operation === "cancel-volunteer") {
    const row = await tx.postVolunteerSignup.findFirst({
      where: { id: postId(input.signupId), userId: actorId },
      include: { slot: { select: { postId: true } } }
    });
    if (!row) throw new PortalError(404, "Your signup is unavailable.");
    if (row.state === "CANCELED")
      return {
        id: row.id,
        version: row.version,
        message: "Your volunteer signup is canceled."
      };
    expected(input.expectedVersion, row.version);
    const saved = await tx.postVolunteerSignup.update({
      where: { id: row.id },
      data: { state: "CANCELED", version: { increment: 1 } }
    });
    await audit(
      tx,
      row.slot.postId,
      actorId,
      "volunteer-canceled",
      row.id,
      saved.version
    );
    return {
      id: row.id,
      version: saved.version,
      message: "Your volunteer signup is canceled."
    };
  }
  const post = await participationPost(tx, context, input.postId);
  if (operation === "configure-poll") {
    if (!postCanEdit(context, post))
      throw new PortalError(
        403,
        "Only an authorized post editor may configure this poll."
      );
    const prior = await tx.postPoll.findUnique({ where: { postId: post.id } });
    expected(input.expectedVersion, prior?.version ?? 0);
    if (
      prior?.lockedAt ||
      prior?.closedAt ||
      (prior && prior.closesAt <= new Date())
    )
      throw new PortalError(
        409,
        "Poll structure is locked after participation or closing. Publish a new poll for a different question."
      );
    if (!participationActive(post))
      throw new PortalError(
        409,
        "A canceled or ended event cannot open a poll."
      );
    const { labels, ...details } = pollDetails(input);
    const saved = prior
      ? await tx.postPoll.update({
          where: { id: prior.id },
          data: { ...details, version: { increment: 1 } }
        })
      : await tx.postPoll.create({ data: { ...details, postId: post.id } });
    if (prior)
      await tx.postPollOption.deleteMany({ where: { pollId: prior.id } });
    await tx.postPollOption.createMany({
      data: labels.map((label, position) => ({
        pollId: saved.id,
        label,
        position
      }))
    });
    await audit(
      tx,
      post.id,
      actorId,
      "poll-configured",
      saved.id,
      saved.version
    );
    return {
      id: saved.id,
      version: saved.version,
      message: "Poll saved. Its structure locks when someone votes."
    };
  }
  if (operation === "close-poll") {
    if (!postCanEdit(context, post))
      throw new PortalError(
        403,
        "Only an authorized post editor may close this poll."
      );
    const poll = await tx.postPoll.findUnique({ where: { postId: post.id } });
    if (!poll) throw new PortalError(404, "Poll unavailable.");
    expected(input.expectedVersion, poll.version);
    const saved = await tx.postPoll.update({
      where: { id: poll.id },
      data: { closedAt: new Date(), version: { increment: 1 } }
    });
    await audit(tx, post.id, actorId, "poll-closed", poll.id, saved.version);
    return {
      id: poll.id,
      version: saved.version,
      message: "Voting is closed. Existing results are preserved."
    };
  }
  if (operation === "vote") {
    if (!(await canParticipate(tx, context, post)))
      throw new PortalError(
        403,
        "Voting requires an eligible account and approval from the sharing church, when one is selected."
      );
    const poll = await tx.postPoll.findUnique({
      where: { postId: post.id },
      include: { options: true }
    });
    if (!poll) throw new PortalError(404, "Poll unavailable.");
    if (
      poll.closedAt ||
      poll.closesAt <= new Date() ||
      !participationActive(post)
    )
      throw new PortalError(
        409,
        "Voting is closed. Your previous ballot has not changed."
      );
    expected(input.pollVersion, poll.version);
    const ids = input.optionIds;
    if (
      !Array.isArray(ids) ||
      !ids.length ||
      ids.length > (poll.multiple ? poll.options.length : 1) ||
      new Set(ids).size !== ids.length ||
      ids.some((id) => !poll.options.some((o) => o.id === id))
    )
      throw new PortalError(400, "Choose valid options from this poll.");
    const optionIds = (ids as string[]).slice().sort();
    const prior = await tx.postPollBallot.findUnique({
      where: { pollId_userId: { pollId: poll.id, userId: actorId } }
    });
    if (prior && JSON.stringify(prior.optionIds) === JSON.stringify(optionIds))
      return {
        id: poll.id,
        version: prior.version,
        message: "Your ballot is already saved."
      };
    expected(input.expectedVersion, prior?.version ?? 0);
    const saved = prior
      ? await tx.postPollBallot.update({
          where: { id: prior.id },
          data: { optionIds, version: { increment: 1 } }
        })
      : await tx.postPollBallot.create({
          data: { pollId: poll.id, userId: actorId, optionIds }
        });
    if (!poll.lockedAt)
      await tx.postPoll.update({
        where: { id: poll.id },
        data: { lockedAt: new Date() }
      });
    await audit(tx, post.id, actorId, "ballot-saved", saved.id, saved.version);
    return {
      id: poll.id,
      version: saved.version,
      message: "Your ballot is saved. You may change it before voting closes."
    };
  }
  if (operation === "configure-slot") {
    if (!canOrganize(context, post))
      throw new PortalError(
        403,
        "An authorized church volunteer organizer must manage roles."
      );
    if (!participationActive(post))
      throw new PortalError(
        409,
        "A canceled or ended event cannot accept volunteer roles."
      );
    const requestKey = postId(input.requestKey);
    const prior = input.slotId
      ? await tx.postVolunteerSlot.findFirst({
          where: { id: postId(input.slotId), postId: post.id }
        })
      : await tx.postVolunteerSlot.findUnique({
          where: { postId_requestKey: { postId: post.id, requestKey } }
        });
    if (input.slotId && !prior)
      throw new PortalError(404, "Volunteer role unavailable.");
    if (!input.slotId && prior)
      return {
        id: prior.id,
        version: prior.version,
        message: "This volunteer role is already saved."
      };
    expected(input.expectedVersion, prior?.version ?? 0);
    const role = postField(input.role, 100, 2),
      places = capacity(input.capacity);
    if (typeof input.closed !== "boolean")
      throw new PortalError(
        400,
        "Choose whether this role is open for signups."
      );
    if (prior) {
      const active = await tx.postVolunteerSignup.count({
        where: { slotId: prior.id, state: "ACTIVE" }
      });
      if (places < active)
        throw new PortalError(
          409,
          "Capacity cannot be reduced below existing volunteer signups."
        );
      if (
        role !== prior.role &&
        (await tx.postVolunteerSignup.count({ where: { slotId: prior.id } }))
      )
        throw new PortalError(
          409,
          "This role already has participation. Keep its name or create a new role."
        );
    } else if (
      (await tx.postVolunteerSlot.count({ where: { postId: post.id } })) >= 12
    )
      throw new PortalError(409, "Use up to twelve roles on one event post.");
    const data = {
      role,
      capacity: places,
      closedAt: input.closed ? new Date() : null
    };
    const saved = prior
      ? await tx.postVolunteerSlot.update({
          where: { id: prior.id },
          data: { ...data, version: { increment: 1 } }
        })
      : await tx.postVolunteerSlot.create({
          data: { ...data, postId: post.id, requestKey }
        });
    await audit(
      tx,
      post.id,
      actorId,
      "volunteer-role-saved",
      saved.id,
      saved.version
    );
    return {
      id: saved.id,
      version: saved.version,
      message: "Volunteer role saved. Existing signups are preserved."
    };
  }
  if (operation === "volunteer") {
    if (!(await canParticipate(tx, context, post)))
      throw new PortalError(
        403,
        "Volunteer signups require current approval from this church."
      );
    const event = post.eventOccurrence;
    if (!event || !post.authorChurchId || !participationActive(post))
      throw new PortalError(
        409,
        "This event cannot accept a volunteer signup."
      );
    const slot = await tx.postVolunteerSlot.findFirst({
      where: { id: postId(input.slotId), postId: post.id }
    });
    if (!slot || slot.closedAt)
      throw new PortalError(409, "This role is closed to new signups.");
    expected(input.slotVersion, slot.version);
    const prior = await tx.postVolunteerSignup.findUnique({
      where: { slotId_userId: { slotId: slot.id, userId: actorId } }
    });
    if (prior?.state === "ACTIVE")
      return {
        id: prior.id,
        version: prior.version,
        message: "Your place is already reserved."
      };
    expected(input.expectedVersion, prior?.version ?? 0);
    if (
      (await tx.postVolunteerSignup.count({
        where: { slotId: slot.id, state: "ACTIVE" }
      })) >= slot.capacity
    )
      throw new PortalError(409, "This role is full. No place was reserved.");
    const data = {
      state: "ACTIVE" as const,
      eventVersion: event.event.version,
      occurrenceVersion: event.version
    };
    const saved = prior
      ? await tx.postVolunteerSignup.update({
          where: { id: prior.id },
          data: { ...data, version: { increment: 1 } }
        })
      : await tx.postVolunteerSignup.create({
          data: { ...data, slotId: slot.id, userId: actorId }
        });
    await audit(
      tx,
      post.id,
      actorId,
      "volunteer-reserved",
      saved.id,
      saved.version
    );
    return {
      id: saved.id,
      version: saved.version,
      message:
        "Your volunteer place is reserved. View My commitments for event details and changes."
    };
  }
  throw new PortalError(400, "Choose a supported participation action.");
}
export function participationCommand(
  db: PrismaClient,
  token: unknown,
  input: Record<string, unknown>
) {
  return withOwnedSession(
    db,
    token,
    async (tx, session) =>
      participationCommandIn(tx, await postContext(tx, session.userId), input),
    true
  );
}
