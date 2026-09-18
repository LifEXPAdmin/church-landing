import type { PrismaClient } from "@prisma/client";
import {
  groupEligibility,
  listGroups,
  readGroup,
  readGroupChoices,
  readGroupHistory,
  readGroupInviteChoice,
  readGroupMembers
} from "./group-reads";
import {
  readGroupDiscussions,
  readGroupSelectedAnswer
} from "./group-discussions";
import { readGroupEvents, readGroupEventChoice } from "./group-events";
import { PortalError } from "./portal-policy";
export type GroupQuery = {
  view?: string;
  slug?: string;
  q?: string;
  kind?: string;
  format?: string;
  churchId?: string;
  after?: string;
  before?: string;
  cursor?: string;
  state?: string;
  category?: string;
  username?: string;
  occurrenceId?: string;
  postId?: string;
};
export async function readGroupPage(
  db: PrismaClient,
  token: unknown,
  q: GroupQuery
) {
  const view = q.view ?? "list";
  if (view === "list" || view === "invitations")
    return {
      view: view as typeof view,
      ...(await listGroups(db, token, {
        q: q.q,
        kind: q.kind,
        format: q.format,
        churchId: q.churchId,
        after: q.after,
        invitations: view === "invitations"
      }))
    };
  if (view === "mine")
    return {
      view: view as typeof view,
      ...(await readGroupChoices(db, token, q.after))
    };
  if (view === "new")
    return {
      view: view as typeof view,
      ...(await groupEligibility(db, token))
    };
  if (view === "answer")
    return {
      view: view as typeof view,
      ...(await readGroupSelectedAnswer(db, token, q.postId))
    };
  if (!q.slug)
    throw new PortalError(400, "Choose a group from the current navigation.");
  if (view === "invite-choice")
    return {
      view: view as typeof view,
      ...(await readGroupInviteChoice(db, token, q.slug, q.username))
    };
  const result = await readGroup(
    db,
    token,
    q.slug,
    view === "manage" || view === "history" || view === "event-choice"
  );
  if (view === "about") return { view: view as typeof view, ...result };
  if (view === "discussion")
    return {
      view: view as typeof view,
      ...result,
      discussion: await readGroupDiscussions(db, token, {
        groupId: result.group.id,
        category: q.category,
        before: q.before,
        cursor: q.cursor
      })
    };
  if (view === "events")
    return {
      view: view as typeof view,
      ...result,
      events: await readGroupEvents(db, token, result.group.id, q.after)
    };
  if (view === "members")
    return {
      view: view as typeof view,
      ...result,
      roster: await readGroupMembers(db, token, q.slug, q.after)
    };
  if (view === "history")
    return {
      view: view as typeof view,
      ...result,
      history: await readGroupHistory(db, token, q.slug, q.after)
    };
  if (view === "event-choice")
    return {
      view: view as typeof view,
      ...(await readGroupEventChoice(
        db,
        token,
        result.group.id,
        q.occurrenceId
      ))
    };
  if (view === "manage")
    return {
      view: view as typeof view,
      ...result,
      roster:
        result.viewer.requiresAuthorityReview ||
        result.group.lifecycle === "ARCHIVED"
          ? null
          : await readGroupMembers(db, token, q.slug, q.after, true, q.state)
    };
  throw new PortalError(400, "Choose a supported group view.");
}
