import { handleGroupRequest } from "../lib/platform/group-boundary";
import { safeAccountReturn } from "../lib/platform/account-entry";
import { notificationSource } from "../lib/platform/notification-source";
import {
  notificationCategories,
  notificationPushAllowed,
  notificationPreferenceCommand
} from "../lib/platform/notification-preferences";
import { readActivity } from "../lib/platform/activity";
import {
  groupEventCommand,
  readGroupEvents
} from "../lib/platform/group-events";
import { calendarCommand } from "../lib/platform/calendar-commands";
import {
  deactivateAccount,
  AccountLifecycleError
} from "../lib/platform/account-lifecycle";
import {
  prepareAccountExport,
  downloadAccountExport
} from "../lib/platform/account-export";
import { requestPermanentAccountDeletion } from "../lib/platform/account-deletion";
import { eraseRequestedAccountData } from "../lib/platform/account-erasure";
import { createSessionToken } from "../lib/platform/auth";
import {
  groupDiscussionCommand,
  readGroupDiscussions,
  readGroupSelectedAnswer
} from "../lib/platform/group-discussions";
import {
  communityReportCommand,
  readCommunityReports
} from "../lib/platform/community-reports";
import { readAdminQueue } from "../lib/platform/admin-queue";
import { contentAppealOffer } from "../lib/platform/moderation-support";
import { supportCommand, readSupport } from "../lib/platform/support";
import { seedOperatorGrants } from "./seed-portal";
import { postCommand } from "../lib/platform/post-commands";
import { getPost, listPosts } from "../lib/platform/post-reads";
import { commentCommand } from "../lib/platform/comment-commands";
import { readComments, readCommentDrafts } from "../lib/platform/comment-reads";
import { postLikeCommand } from "../lib/platform/post-likes";
import {
  postWorkspaceCommand,
  readPostWorkspace
} from "../lib/platform/post-workspace";
import { participationCommand } from "../lib/platform/post-participation";
import { getPostParticipation } from "../lib/platform/post-participation-reads";
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  assertPortalTestDatabase,
  createPortalActor,
  type PortalActor
} from "./seed-portal";
import { groupCommand as command } from "../lib/platform/group-commands";
import {
  listGroups,
  readGroup,
  readGroupMembers,
  readGroupInviteChoice
} from "../lib/platform/group-reads";
import { groupIdentity } from "../lib/platform/group-input";
import { postContext } from "../lib/platform/post-access";
import { PortalError } from "../lib/platform/portal-policy";
import { relationshipCommand } from "../lib/platform/relationships";
import {
  replayRetentionControls,
  type RetentionControlEntry
} from "../lib/platform/retention-controls";
const db = new PrismaClient();
before(async () => {
  await assertPortalTestDatabase(db);
});
after(async () => {
  await db.$disconnect();
});
const body = (operation: string, fields: Record<string, unknown> = {}) => ({
  operation,
  mutationId: randomUUID(),
  ...fields
});
const denied = (work: Promise<unknown>, code: number) =>
  assert.rejects(work, (e) => e instanceof PortalError && e.status === code);
async function create(
  owner: PortalActor,
  overrides: Record<string, unknown> = {}
) {
  const id = randomUUID(),
    slug = `gather-${id}`;
  const fields = {
    name: `Fictional group ${id}`,
    purpose: "An isolated adult group",
    rules: "Protect private discussion and respect every member.",
    kind: "INTEREST",
    discovery: "LISTED",
    joinPolicy: "APPROVAL",
    format: "LOCAL",
    area: "Fictional town",
    topic: "Music",
    churchId: null,
    ...overrides
  };
  const input = body("create", {
    schema: 1,
    fields,
    slug,
    acceptedRules: true,
    leaderDisclosure: true
  });
  return { ...(await command(db, owner.token, input)), slug, fields, input };
}
async function fixture(overrides: Record<string, unknown> = {}) {
  const owner = await createPortalActor(db, "gowner"),
    member = await createPortalActor(db, "gmember"),
    stranger = await createPortalActor(db, "gstranger");
  return { owner, member, stranger, group: await create(owner, overrides) };
}
async function own(actor: PortalActor, groupId: string) {
  return db.gatherGroupMembership.findUniqueOrThrow({
    where: { groupId_userId: { groupId, userId: actor.id } }
  });
}
async function join(
  actor: PortalActor,
  group: { id: string; slug: string },
  rosterVisible = false
) {
  const read = await readGroup(db, actor.token, group.slug);
  return command(
    db,
    actor.token,
    body("join", {
      groupId: group.id,
      expectedVersion: read.viewer.version,
      rulesVersion: read.group.rulesVersion,
      acceptedRules: true,
      rosterVisible
    })
  );
}
async function decide(
  owner: PortalActor,
  member: PortalActor,
  group: { id: string },
  state = "ACTIVE"
) {
  const row = await own(member, group.id);
  return command(
    db,
    owner.token,
    body("decide", {
      groupId: group.id,
      targetId: member.id,
      expectedVersion: row.version,
      state,
      reason: "Isolated explicit membership review"
    })
  );
}
async function context(actor: PortalActor) {
  return db.$transaction((tx) => postContext(tx, actor.id));
}

test("adult group schema rejects youth, missing options and private-cohort widening", () => {
  const fields = {
    name: "Fictional group",
    purpose: "Isolated",
    rules: "Be respectful",
    kind: "YOUTH",
    discovery: "LISTED",
    joinPolicy: "OPEN",
    format: "LOCAL",
    area: "",
    topic: "",
    churchId: null
  };
  assert.throws(() => groupIdentity(1, fields), PortalError);
  assert.throws(
    () => groupIdentity(1, { ...fields, kind: "PRIVATE_COHORT" }),
    PortalError
  );
  assert.throws(
    () => groupIdentity(0, { ...fields, kind: "INTEREST" }),
    PortalError
  );
});
test("listed discovery is public but approval, roster and member content remain private", async () => {
  const { owner, member, stranger, group } = await fixture();
  const publicView = await readGroup(db, undefined, group.slug);
  assert.equal(publicView.viewer.member, false);
  assert.equal(publicView.group.owner?.id, owner.id);
  assert.ok(!JSON.stringify(publicView).includes(owner.email));
  await join(member, group);
  assert.equal((await own(member, group.id)).state, "PENDING");
  assert.equal((await context(member)).groupReaders?.has(group.id), false);
  await denied(readGroupMembers(db, member.token, group.slug), 404);
  await denied(decide(stranger, member, group), 404);
  await decide(owner, member, group);
  assert.equal((await context(member)).groupParticipants?.has(group.id), true);
  const ordinary = await readGroupMembers(db, member.token, group.slug);
  assert.equal(ordinary.members.length, 2);
  await join(stranger, group);
  await decide(owner, stranger, group);
  assert.ok(
    !(await readGroupMembers(db, stranger.token, group.slug)).members.some(
      (r) => r.user.id === member.id
    )
  );
  const management = await readGroupMembers(
    db,
    owner.token,
    group.slug,
    undefined,
    true
  );
  assert.equal(management.members.length, 3);
  assert.ok(!JSON.stringify(management).includes(member.email));
  const row = await own(member, group.id);
  await command(
    db,
    member.token,
    body("roster", {
      groupId: group.id,
      expectedVersion: row.version,
      rosterVisible: true
    })
  );
  assert.ok(
    (await readGroupMembers(db, stranger.token, group.slug)).members.some(
      (r) => r.user.id === member.id
    )
  );
});
test("named unlisted invitation obeys contact consent, deliberate acceptance and forwarding denial", async () => {
  const { owner, member, stranger, group } = await fixture({
    kind: "PRIVATE_COHORT",
    discovery: "UNLISTED",
    joinPolicy: "INVITE_ONLY"
  });
  await denied(readGroup(db, undefined, group.slug), 404);
  await denied(readGroup(db, stranger.token, group.slug), 404);
  assert.ok(
    !(await listGroups(db, undefined, { q: group.fields.name })).groups.some(
      (r) => r.id === group.id
    )
  );
  await denied(
    readGroupInviteChoice(db, owner.token, group.slug, member.username),
    404
  );
  await db.socialPreferences.upsert({
    where: { ownerId: member.id },
    create: { ownerId: member.id, contactRequests: "EVERYONE" },
    update: { contactRequests: "EVERYONE", version: { increment: 1 } }
  });
  const choice = await readGroupInviteChoice(
    db,
    owner.token,
    group.slug,
    member.username
  );
  await command(
    db,
    owner.token,
    body("invite", {
      groupId: group.id,
      targetId: member.id,
      expectedVersion: choice.version,
      contactVersion: choice.contactVersion
    })
  );
  assert.equal(
    (await readGroup(db, member.token, group.slug)).viewer.currentInvitation,
    true
  );
  assert.equal((await context(member)).groupReaders?.has(group.id), false);
  await denied(readGroupMembers(db, member.token, group.slug), 404);
  await join(member, group);
  assert.equal((await context(member)).groupReaders?.has(group.id), true);
  await denied(readGroup(db, stranger.token, group.slug), 404);
});
test("removed membership and stale exact join receipt cannot recover current access", async () => {
  const { owner, member, group } = await fixture({ joinPolicy: "OPEN" });
  const input = body("join", {
    groupId: group.id,
    expectedVersion: 0,
    rulesVersion: 1,
    acceptedRules: true,
    rosterVisible: false
  });
  const first = await command(db, member.token, input);
  assert.deepEqual(await command(db, member.token, input), first);
  await decide(owner, member, group, "REMOVED");
  assert.equal((await context(member)).groupReaders?.has(group.id), false);
  await denied(command(db, member.token, input), 404);
  await denied(join(member, group), 404);
  const row = await own(member, group.id);
  await command(
    db,
    member.token,
    body("leave", {
      groupId: group.id,
      expectedVersion: row.version,
      confirmed: true
    })
  );
  assert.equal((await own(member, group.id)).state, "REMOVED");
  await decide(owner, member, group, "LEFT");
  await join(member, group);
  assert.equal((await context(member)).groupReaders?.has(group.id), true);
});
test("rules revisions retain authorized reading but require fresh acceptance to post", async () => {
  const { owner, member, group } = await fixture({ joinPolicy: "OPEN" });
  await join(member, group);
  await command(
    db,
    owner.token,
    body("edit", {
      groupId: group.id,
      expectedVersion: 1,
      schema: 1,
      fields: {
        ...group.fields,
        rules: "Updated rules require renewed participation consent."
      },
      acceptedRules: true,
      leaderDisclosure: true
    })
  );
  const current = await context(member);
  assert.equal(current.groupReaders?.has(group.id), true);
  assert.equal(current.groupParticipants?.has(group.id), false);
  const row = await own(member, group.id);
  await denied(
    command(
      db,
      member.token,
      body("accept-rules", {
        groupId: group.id,
        expectedVersion: row.version,
        acceptedRules: true,
        rulesVersion: 1
      })
    ),
    409
  );
  await command(
    db,
    member.token,
    body("accept-rules", {
      groupId: group.id,
      expectedVersion: row.version,
      acceptedRules: true,
      rulesVersion: 2
    })
  );
  assert.equal((await context(member)).groupParticipants?.has(group.id), true);
});
test("leadership requires named acceptance, atomic owner transfer and current role revocation", async () => {
  const { owner, member, stranger, group } = await fixture({
    joinPolicy: "OPEN"
  });
  await join(member, group);
  await join(stranger, group);
  let row = await own(member, group.id);
  await command(
    db,
    owner.token,
    body("offer-role", {
      groupId: group.id,
      targetId: member.id,
      expectedVersion: row.version,
      role: "LEADER",
      reason: "Isolated leader nomination"
    })
  );
  assert.equal((await context(member)).groupModerators?.has(group.id), false);
  row = await own(member, group.id);
  await command(
    db,
    member.token,
    body("accept-role", {
      groupId: group.id,
      expectedVersion: row.version,
      role: "LEADER",
      rulesVersion: 1,
      acceptedRules: true,
      leaderDisclosure: true
    })
  );
  assert.equal((await context(member)).groupModerators?.has(group.id), true);
  await denied(
    command(
      db,
      member.token,
      body("offer-role", {
        groupId: group.id,
        targetId: stranger.id,
        expectedVersion: (await own(stranger, group.id)).version,
        role: "OWNER",
        reason: "Unauthorized replacement"
      })
    ),
    404
  );
  await command(
    db,
    owner.token,
    body("revoke-role", {
      groupId: group.id,
      targetId: member.id,
      expectedVersion: (await own(member, group.id)).version,
      reason: "Isolated duty ending"
    })
  );
  assert.equal((await context(member)).groupModerators?.has(group.id), false);
  await denied(
    readGroupMembers(db, member.token, group.slug, undefined, true),
    404
  );
  await command(
    db,
    owner.token,
    body("offer-role", {
      groupId: group.id,
      targetId: member.id,
      expectedVersion: (await own(member, group.id)).version,
      role: "OWNER",
      reason: "Isolated ownership transfer"
    })
  );
  await command(
    db,
    member.token,
    body("accept-role", {
      groupId: group.id,
      expectedVersion: (await own(member, group.id)).version,
      role: "OWNER",
      rulesVersion: 1,
      acceptedRules: true,
      leaderDisclosure: true
    })
  );
  assert.equal(
    (await db.gatherGroup.findUniqueOrThrow({ where: { id: group.id } }))
      .ownerId,
    member.id
  );
  assert.equal((await context(owner)).groupModerators?.has(group.id), false);
  await denied(
    command(
      db,
      member.token,
      body("leave", {
        groupId: group.id,
        expectedVersion: (await own(member, group.id)).version,
        confirmed: true
      })
    ),
    409
  );
});
test("archive rejects new joins and content while retaining current-member history", async () => {
  const { owner, member, stranger, group } = await fixture({
    joinPolicy: "OPEN"
  });
  await join(member, group);
  await command(
    db,
    owner.token,
    body("archive", {
      groupId: group.id,
      expectedVersion: 1,
      desired: true,
      confirmed: true,
      reason: "Isolated archive"
    })
  );
  assert.equal((await context(member)).groupReaders?.has(group.id), true);
  assert.equal((await context(member)).groupParticipants?.has(group.id), false);
  await denied(readGroup(db, stranger.token, group.slug), 404);
  await command(
    db,
    member.token,
    body("leave", {
      groupId: group.id,
      expectedVersion: (await own(member, group.id)).version,
      confirmed: true
    })
  );
  assert.equal((await context(member)).groupReaders?.has(group.id), false);
});
test("church groups require explicit current grants and a fresh acceptance after duty epochs change", async () => {
  const owner = await createPortalActor(db, "gchurch");
  const church = await db.church.create({
    data: {
      slug: `group-church-${randomUUID()}`,
      name: "Fictional church",
      summary: "Isolated",
      communityListed: true
    }
  });
  const connection = await db.churchConnection.create({
    data: { userId: owner.id, churchId: church.id, state: "APPROVED" }
  });
  await denied(
    create(owner, { kind: "CHURCH_LIFE", churchId: church.id }),
    403
  );
  const grant = await db.churchCapabilityGrant.create({
    data: {
      userId: owner.id,
      churchId: church.id,
      capability: "MANAGE_CHURCH_GROUPS"
    }
  });
  const group = await create(owner, {
    kind: "CHURCH_LIFE",
    churchId: church.id
  });
  assert.equal((await context(owner)).groupModerators?.has(group.id), true);
  await db.churchCapabilityGrant.update({
    where: { id: grant.id },
    data: { revokedAt: new Date(), version: { increment: 1 } }
  });
  assert.equal((await context(owner)).groupReaders?.has(group.id), false);
  await db.churchCapabilityGrant.update({
    where: { id: grant.id },
    data: { revokedAt: null, version: { increment: 1 } }
  });
  assert.equal((await context(owner)).groupReaders?.has(group.id), false);
  const repair = await readGroup(db, owner.token, group.slug, true);
  assert.equal(repair.viewer.requiresAuthorityReview, true);
  await command(
    db,
    owner.token,
    body("renew-authority", {
      groupId: group.id,
      expectedVersion: 1,
      acceptedRules: true,
      rulesVersion: 1,
      leaderDisclosure: true
    })
  );
  assert.equal((await context(owner)).groupReaders?.has(group.id), true);
  await db.churchConnection.update({
    where: { id: connection.id },
    data: { state: "LEFT", version: { increment: 1 } }
  });
  assert.equal((await context(owner)).groupReaders?.has(group.id), false);
});

test("blocking retires named invitations and offers so unblocking cannot revive consent", async () => {
  const { owner, member, group } = await fixture({
    discovery: "UNLISTED",
    joinPolicy: "INVITE_ONLY"
  });
  await db.socialPreferences.upsert({
    where: { ownerId: member.id },
    create: { ownerId: member.id, contactRequests: "EVERYONE" },
    update: { contactRequests: "EVERYONE", version: { increment: 1 } }
  });
  const choice = await readGroupInviteChoice(
    db,
    owner.token,
    group.slug,
    member.username
  );
  const invitation = body("invite", {
    groupId: group.id,
    targetId: member.id,
    expectedVersion: choice.version,
    contactVersion: choice.contactVersion
  });
  await command(db, owner.token, invitation);
  const block = await relationshipCommand(
    db,
    member.token,
    body("block", {
      kind: "person",
      targetId: owner.id,
      expectedVersion: 0,
      desired: true
    })
  );
  assert.equal((await own(member, group.id)).state, "DECLINED");
  await denied(command(db, owner.token, invitation), 404);
  await relationshipCommand(
    db,
    member.token,
    body("block", {
      kind: "person",
      targetId: owner.id,
      expectedVersion: block.version,
      desired: false
    })
  );
  await denied(readGroup(db, member.token, group.slug), 404);
  assert.equal((await own(member, group.id)).state, "DECLINED");
});
test("older protected group authority is quarantined without reviving member or leader choices", async () => {
  const { owner, member, group } = await fixture({ joinPolicy: "OPEN" });
  await join(member, group);
  await decide(owner, member, group, "BANNED");
  const entries = await db.retentionControl.findMany({
    where: { kind: "GROUP_ACCESS", sourceId: group.id },
    orderBy: { version: "asc" }
  });
  assert.ok(entries.length >= 3);
  assert.ok(
    !JSON.stringify(entries.map((r) => r.payload)).includes(group.fields.name)
  );
  await db.gatherGroup.update({
    where: { id: group.id },
    data: { securityVersion: 1 }
  });
  await db.gatherGroupMembership.update({
    where: { id: (await own(member, group.id)).id },
    data: { state: "ACTIVE", rulesVersion: 1, joinedAt: new Date() }
  });
  await replayRetentionControls(
    db,
    entries.map((r) => r.payload as unknown as RetentionControlEntry)
  );
  assert.equal(
    (await db.gatherGroup.findUniqueOrThrow({ where: { id: group.id } }))
      .recoveryRequired,
    true
  );
  assert.equal((await context(member)).groupReaders?.has(group.id), false);
  await denied(readGroup(db, member.token, group.slug), 404);
  await denied(
    command(
      db,
      owner.token,
      body("archive", {
        groupId: group.id,
        expectedVersion: 1,
        desired: false,
        confirmed: true,
        reason: "Stale recovery attempt"
      })
    ),
    503
  );
});

const publish = (
  actor: PortalActor,
  groupId: string,
  extra: Record<string, unknown> = {}
) =>
  postCommand(db, actor.token, {
    operation: "create",
    requestKey: randomUUID(),
    groupId,
    audience: "GROUP",
    groupThreadKind: "DISCUSSION",
    groupCategory: "GENERAL",
    content: "Private fictional group content",
    ...extra
  });
test("canonical group posts, replies, reactions and exact retries lose access immediately on removal", async () => {
  const { owner, member, stranger, group } = await fixture({
    joinPolicy: "OPEN"
  });
  await join(member, group);
  const post = await publish(owner, group.id);
  assert.equal(await getPost(db, undefined, post.id), null);
  assert.equal(await getPost(db, stranger.token, post.id), null);
  assert.equal((await getPost(db, member.token, post.id))?.group?.id, group.id);
  await denied(publish(stranger, group.id), 403);
  await denied(publish(owner, group.id, { audience: "PUBLIC" }), 400);
  await denied(publish(owner, group.id, { allowReposts: true }), 400);
  await denied(
    publish(owner, group.id, {
      scheduleLocal: "2030-01-01T12:00",
      scheduleZone: "UTC"
    }),
    400
  );
  const like = {
    postId: post.id,
    mutationId: randomUUID(),
    expectedVersion: 0,
    desired: true
  };
  await postLikeCommand(db, member.token, like);
  const reply = body("create", {
    postId: post.id,
    content: "A private member reply"
  });
  await commentCommand(db, member.token, reply);
  assert.equal(
    (await readComments(db, member.token, { postId: post.id })).items.length,
    1
  );
  await denied(readComments(db, stranger.token, { postId: post.id }), 404);
  await decide(owner, member, group, "REMOVED");
  assert.equal(await getPost(db, member.token, post.id), null);
  await denied(postLikeCommand(db, member.token, like), 404);
  await denied(commentCommand(db, member.token, reply), 404);
  assert.equal(
    (await listPosts(db, member.token, { groupId: group.id })).length,
    0
  );
});
test("private drafts retain immutable group destination and are hidden after membership ends", async () => {
  const { owner, member, group } = await fixture({ joinPolicy: "OPEN" });
  await join(member, group);
  const id = randomUUID();
  const payload = {
    content: "Unpublished private group draft",
    scripture: "",
    type: "UPDATE",
    topics: [],
    audience: "GROUP",
    groupId: group.id,
    groupThreadKind: "QUESTION",
    groupCategory: "PLANNING",
    replyAudience: "VIEWERS",
    authorChurchId: null,
    audienceChurchId: null,
    eventOccurrenceId: null,
    linkUrl: ""
  };
  const save = body("save-draft", { id, expectedVersion: 0, payload });
  await postWorkspaceCommand(db, member.token, save);
  await denied(
    postWorkspaceCommand(
      db,
      member.token,
      body("save-draft", {
        id,
        expectedVersion: 1,
        payload: {
          ...payload,
          audience: "PUBLIC",
          groupId: null,
          groupThreadKind: null,
          groupCategory: null
        }
      })
    ),
    400
  );
  const post = await publish(owner, group.id);
  const commentDraft = body("draft-save", {
    postId: post.id,
    draftId: randomUUID(),
    expectedVersion: 0,
    content: "Private unsent reply"
  });
  await commentCommand(db, member.token, commentDraft);
  await decide(owner, member, group, "REMOVED");
  const single = await readPostWorkspace(db, member.token, {
    view: "draft",
    id
  });
  assert.ok("draft" in single);
  assert.equal(single.draft, null);
  const list = await readPostWorkspace(db, member.token, { view: "drafts" });
  assert.ok("items" in list);
  assert.equal(list.items.length, 0);
  assert.equal(
    (await readCommentDrafts(db, member.token, { postId: post.id })).items
      .length,
    0
  );
  await denied(postWorkspaceCommand(db, member.token, save), 403);
  await denied(
    postWorkspaceCommand(
      db,
      member.token,
      body("publish-draft", { id, expectedVersion: 1 })
    ),
    403
  );
  await postWorkspaceCommand(
    db,
    member.token,
    body("delete-draft", { id, expectedVersion: 1 })
  );
});
test("group polls reuse canonical ballots, reject duplicates and filter removed members", async () => {
  const { owner, member, stranger, group } = await fixture({
    joinPolicy: "OPEN"
  });
  await join(member, group);
  const post = await publish(owner, group.id);
  await participationCommand(db, owner.token, {
    operation: "configure-poll",
    postId: post.id,
    expectedVersion: 0,
    question: "Which rehearsal day?",
    options: ["Monday", "Tuesday"],
    multiple: false,
    closesLocal: new Date(Date.now() + 86400000).toISOString().slice(0, 16),
    timeZone: "UTC"
  });
  const view = await getPostParticipation(db, member.token, post.id);
  assert.ok(view.poll);
  const vote = {
    operation: "vote",
    postId: post.id,
    pollVersion: view.poll.version,
    expectedVersion: 0,
    optionIds: [view.poll.options[0].id]
  };
  await participationCommand(db, member.token, vote);
  await participationCommand(db, member.token, vote);
  assert.equal(
    await db.postPollBallot.count({
      where: { pollId: view.poll.id, userId: member.id }
    }),
    1
  );
  await denied(getPostParticipation(db, stranger.token, post.id), 404);
  await decide(owner, member, group, "REMOVED");
  await denied(participationCommand(db, member.token, vote), 404);
  assert.equal(
    (await getPostParticipation(db, owner.token, post.id)).poll?.total,
    0
  );
});

test("group content reports and appeals stay within current leadership while platform review exposes only selected evidence", async () => {
  const { owner, member, stranger, group } = await fixture({
    joinPolicy: "OPEN"
  });
  await join(member, group);
  const reviewer = await createPortalActor(db, "gglobal");
  await seedOperatorGrants(db, reviewer, ["REVIEW_COMMUNITY_REPORTS"]);
  const post = await publish(member, group.id);
  const request = body("create", {
    targetType: "POST",
    targetId: post.id,
    expectedTargetVersion: 1,
    expectedContextVersion: 0,
    reason: "SPAM",
    details: "Selected private group concern"
  });
  await denied(communityReportCommand(db, stranger.token, request), 404);
  const report = await communityReportCommand(db, member.token, request);
  const review = await readCommunityReports(db, owner.token, {
    view: "review",
    id: report.id
  });
  assert.equal(review.source?.type, "POST");
  assert.ok(
    (await readAdminQueue(db, owner.token, { type: "REPORT" })).rows.some(
      (r) => r.sourceId === report.id
    )
  );
  await denied(
    readCommunityReports(db, stranger.token, { view: "review", id: report.id }),
    404
  );
  const platform = await readCommunityReports(db, reviewer.token, {
    view: "review",
    id: report.id
  });
  assert.equal(platform.evidence?.content, "Private fictional group content");
  assert.equal(await getPost(db, reviewer.token, post.id), null);
  await denied(readGroupMembers(db, reviewer.token, group.slug), 404);
  await communityReportCommand(
    db,
    owner.token,
    body("moderate", {
      id: report.id,
      expectedVersion: review.report!.version,
      expectedSourceVersion: review.source!.version,
      expectedContextVersion: 0,
      action: "REMOVE",
      authorReason: "SPAM",
      decisionReason: "Isolated current group moderation"
    })
  );
  assert.equal(await getPost(db, member.token, post.id), null);
  const decision = await db.communityReportDecision.findFirstOrThrow({
    where: { reportId: report.id, action: "REMOVE" }
  });
  const offer = await db.$transaction((tx) =>
    contentAppealOffer(tx, member.id, decision.id)
  );
  const appeal = await supportCommand(db, member.token, {
    operation: "appeal",
    requestKey: randomUUID(),
    decisionId: decision.id,
    decisionVersion: offer.offer.decisionVersion,
    reportVersion: offer.offer.reportVersion,
    notice: offer.offer.notice,
    consent: true,
    description: "Please reconsider this isolated private group decision."
  });
  assert.ok(
    (await readSupport(db, owner.token, "inbox")).rows.some(
      (r) => r.id === appeal.caseId
    )
  );
  const otherGroup = await create(stranger);
  await denied(
    readCommunityReports(db, stranger.token, { view: "review", id: report.id }),
    404
  );
  assert.ok(
    !(await readAdminQueue(db, stranger.token, { type: "REPORT" })).rows.some(
      (r) => r.sourceId === report.id
    )
  );
  assert.ok(otherGroup.id);
});
test("group identity reports require platform review and protected moderation never republishes old group state", async () => {
  const { owner, member, group } = await fixture();
  const reviewer = await createPortalActor(db, "gidentity");
  await seedOperatorGrants(db, reviewer, ["REVIEW_COMMUNITY_REPORTS"]);
  const report = await communityReportCommand(
    db,
    member.token,
    body("create", {
      targetType: "GROUP",
      targetId: group.id,
      expectedTargetVersion: 1,
      expectedContextVersion: 0,
      reason: "IMPERSONATION",
      details: "Fictional group identity concern"
    })
  );
  await denied(
    readCommunityReports(db, owner.token, { view: "review", id: report.id }),
    404
  );
  const review = await readCommunityReports(db, reviewer.token, {
    view: "review",
    id: report.id
  });
  assert.equal(review.source?.type, "GROUP");
  await communityReportCommand(
    db,
    reviewer.token,
    body("moderate", {
      id: report.id,
      expectedVersion: review.report!.version,
      expectedSourceVersion: review.source!.version,
      expectedContextVersion: 0,
      action: "HIDE",
      authorReason: "MISREPRESENTATION",
      decisionReason: "Isolated group identity restriction"
    })
  );
  await denied(readGroup(db, owner.token, group.slug), 404);
  assert.ok(
    await db.retentionControl.findFirst({
      where: { kind: "MODERATION_GROUP", sourceId: group.id }
    })
  );
  const entries = await db.retentionControl.findMany({
    where: { kind: "MODERATION_GROUP", sourceId: group.id }
  });
  await db.gatherGroup.update({
    where: { id: group.id },
    data: { version: 1, moderationState: "VISIBLE" }
  });
  await replayRetentionControls(
    db,
    entries.map((r) => r.payload as unknown as RetentionControlEntry)
  );
  assert.equal(
    (await db.gatherGroup.findUniqueOrThrow({ where: { id: group.id } }))
      .moderationState,
    "HIDDEN"
  );
});

test("question answers, bounded pins and discussion locks use current author and leader authority", async () => {
  const { owner, member, stranger, group } = await fixture({
    joinPolicy: "OPEN"
  });
  await join(member, group);
  await join(stranger, group);
  const post = await publish(member, group.id, { groupThreadKind: "QUESTION" });
  const answer = await commentCommand(
    db,
    stranger.token,
    body("create", { postId: post.id, content: "A proposed answer" })
  );
  await denied(
    groupDiscussionCommand(
      db,
      stranger.token,
      body("select-answer", {
        postId: post.id,
        expectedVersion: 1,
        commentId: answer.id
      })
    ),
    404
  );
  const selected = await groupDiscussionCommand(
    db,
    member.token,
    body("select-answer", {
      postId: post.id,
      expectedVersion: 1,
      commentId: answer.id
    })
  );
  assert.equal(
    (await readGroupSelectedAnswer(db, member.token, post.id)).answer?.id,
    answer.id
  );
  const other = await publish(owner, group.id);
  const wrong = await commentCommand(
    db,
    owner.token,
    body("create", {
      postId: other.id,
      content: "An answer to another conversation"
    })
  );
  await denied(
    groupDiscussionCommand(
      db,
      owner.token,
      body("select-answer", {
        postId: post.id,
        expectedVersion: selected.version,
        commentId: wrong.id
      })
    ),
    404
  );
  await denied(
    groupDiscussionCommand(
      db,
      member.token,
      body("pin-thread", {
        postId: post.id,
        expectedVersion: selected.version,
        desired: true,
        reason: "Member has no moderation grant"
      })
    ),
    404
  );
  const pinned = await groupDiscussionCommand(
    db,
    owner.token,
    body("pin-thread", {
      postId: post.id,
      expectedVersion: selected.version,
      desired: true,
      reason: "Keep this planning question visible"
    })
  );
  assert.ok(
    (
      await readGroupDiscussions(db, member.token, { groupId: group.id })
    ).pins.some((p) => p.id === post.id)
  );
  await db.platformPost.createMany({
    data: Array.from({ length: 4 }, () => ({
      authorId: owner.id,
      groupId: group.id,
      audience: "GROUP" as const,
      groupThreadKind: "DISCUSSION",
      groupCategory: "GENERAL",
      content: "An isolated existing pin",
      status: "PUBLISHED" as const,
      publishedAt: new Date(),
      groupPinnedAt: new Date()
    }))
  });
  await denied(
    groupDiscussionCommand(
      db,
      owner.token,
      body("pin-thread", {
        postId: other.id,
        expectedVersion: 1,
        desired: true,
        reason: "A sixth pin must be rejected"
      })
    ),
    409
  );
  const closed = await postCommand(db, member.token, {
    operation: "discussion",
    postId: post.id,
    expectedVersion: pinned.version,
    closed: true
  });
  await denied(
    commentCommand(
      db,
      stranger.token,
      body("create", { postId: post.id, content: "New reply after locking" })
    ),
    403
  );
  assert.equal(
    (await readComments(db, member.token, { postId: post.id })).items.length,
    1
  );
  assert.ok(closed.version > pinned.version);
  await commentCommand(
    db,
    stranger.token,
    body("delete", {
      postId: post.id,
      commentId: answer.id,
      expectedVersion: answer.version
    })
  );
  assert.equal(
    (await readGroupSelectedAnswer(db, member.token, post.id)).answer,
    null
  );
});

test("signed group read progress marks returned positions without skipping unseen replies or changing follow choice", async () => {
  const { owner, member, stranger, group } = await fixture({
    joinPolicy: "OPEN"
  });
  await join(member, group);
  await join(stranger, group);
  const post = await publish(owner, group.id);
  const first = await commentCommand(
    db,
    owner.token,
    body("create", { postId: post.id, content: "Earlier root still unseen" })
  );
  const root = await commentCommand(
    db,
    owner.token,
    body("create", {
      postId: post.id,
      content: "Later root with multiple reply pages"
    })
  );
  const start = Date.now() + 1000;
  const ids = Array.from({ length: 26 }, () => randomUUID());
  await db.platformPostComment.createMany({
    data: ids.map((id, i) => ({
      id,
      postId: post.id,
      authorId: owner.id,
      groupId: group.id,
      parentId: root.id,
      rootId: root.id,
      content: `Isolated reply ${i}`,
      createdAt: new Date(start + i)
    }))
  });
  const progress = async () =>
    (
      await readGroupDiscussions(db, member.token, { groupId: group.id })
    ).threads.find((r) => r.post.id === post.id)!;
  const ack = (proof: unknown, actor = member) =>
    groupDiscussionCommand(db, actor.token, {
      operation: "read-progress",
      postId: post.id,
      proof
    });
  assert.equal((await progress()).unreadReplies, 28);
  const deep = await readComments(db, member.token, {
    postId: post.id,
    view: "context",
    commentId: ids[25]
  });
  assert.equal(deep.kind, "thread");
  assert.ok("readProof" in deep && deep.readProof);
  await denied(ack(deep.readProof, stranger), 409);
  await denied(ack(deep.readProof + "x"), 409);
  await denied(
    groupDiscussionCommand(db, member.token, {
      operation: "read-progress",
      postId: post.id,
      proof: deep.readProof,
      shownIds: [first.id]
    }),
    409
  );
  await groupDiscussionCommand(db, member.token, {
    operation: "read-progress",
    postId: post.id,
    proof: deep.readProof,
    shownIds: []
  });
  assert.equal((await progress()).unreadReplies, 28);
  await groupDiscussionCommand(db, member.token, {
    operation: "read-progress",
    postId: post.id,
    proof: deep.readProof,
    shownIds: [ids[25]]
  });
  assert.equal((await progress()).unreadReplies, 27);
  const saved = await ack(deep.readProof);
  assert.equal((await progress()).unreadReplies, 6);
  assert.equal((await progress()).following, false);
  assert.equal((await ack(deep.readProof)).version, saved.version);
  const roots = await readComments(db, member.token, { postId: post.id });
  assert.ok("readProof" in roots);
  await ack(roots.readProof);
  assert.equal((await progress()).unreadReplies, 5);
  const next = await readComments(db, member.token, {
    postId: post.id,
    view: "replies",
    rootId: root.id,
    after: deep.nextCursor
  });
  assert.ok("readProof" in next);
  await ack(next.readProof);
  assert.equal((await progress()).unreadReplies, 0);
  assert.equal((await progress()).unread, false);
  assert.equal((await progress()).following, false);
  assert.ok(first.id);
  await decide(owner, stranger, group, "REMOVED");
  assert.equal((await progress()).unread, true);
  await denied(ack(next.readProof), 409);
  await decide(owner, member, group, "REMOVED");
  await denied(ack(next.readProof), 404);
});

async function personalEvent(actor: PortalActor) {
  const calendar = await calendarCommand(db, actor.token, {
    operation: "create-calendar",
    requestKey: randomUUID(),
    name: "Isolated private group planning",
    timeZone: "UTC"
  });
  const event = await calendarCommand(db, actor.token, {
    operation: "create-event",
    calendarId: calendar.id,
    requestKey: randomUUID(),
    expectedVersion: 1,
    title: "Original canonical event",
    allDay: false,
    startLocal: "2026-11-20T10:00",
    endLocal: "2026-11-20T11:00",
    timeZone: "UTC",
    weeklyUntil: null
  });
  const row = await db.calendarEvent.findUniqueOrThrow({
    where: { id: event.id },
    include: { occurrences: true }
  });
  return { calendar, event: row, occurrence: row.occurrences[0] };
}
const linkEvent = (
  actor: PortalActor,
  groupId: string,
  event: Awaited<ReturnType<typeof personalEvent>>
) =>
  groupEventCommand(
    db,
    actor.token,
    body("link-event", {
      groupId,
      occurrenceId: event.occurrence.id,
      expectedVersion: 0,
      occurrenceVersion: event.occurrence.version,
      eventVersion: event.event.version,
      confirmed: true
    })
  );

test("group event references preserve canonical audience and never create another event or attendance owner", async () => {
  const { owner, member, stranger, group } = await fixture({
    joinPolicy: "OPEN"
  });
  await join(member, group);
  const event = await personalEvent(owner);
  const linked = await linkEvent(owner, group.id, event);
  assert.equal(
    (await readGroupEvents(db, owner.token, group.id)).events[0].event.id,
    event.occurrence.id
  );
  assert.equal(
    (await readGroupEvents(db, member.token, group.id)).events.length,
    0
  );
  await denied(readGroupEvents(db, stranger.token, group.id), 404);
  await denied(linkEvent(member, group.id, event), 404);
  const church = await db.church.create({
    data: {
      slug: `group-event-${randomUUID()}`,
      name: "Fictional event sharing church",
      summary: "Isolated"
    }
  });
  for (const actor of [owner, member])
    await db.churchConnection.create({
      data: {
        userId: actor.id,
        churchId: church.id,
        state: "APPROVED",
        approvedSince: new Date()
      }
    });
  await calendarCommand(db, owner.token, {
    operation: "share-calendar",
    calendarId: event.calendar.id,
    churchId: church.id,
    expectedVersion: 0,
    level: "BUSY",
    confirmed: true
  });
  assert.equal(
    (await readGroupEvents(db, member.token, group.id)).events.length,
    0
  );
  await calendarCommand(db, owner.token, {
    operation: "share-calendar",
    calendarId: event.calendar.id,
    churchId: church.id,
    expectedVersion: 1,
    level: "DETAILS",
    confirmed: true
  });
  assert.equal(
    (await readGroupEvents(db, member.token, group.id)).events[0].event.title,
    "Original canonical event"
  );
  await calendarCommand(db, owner.token, {
    operation: "revoke-calendar-share",
    calendarId: event.calendar.id,
    churchId: church.id,
    expectedVersion: 2
  });
  assert.equal(
    (await readGroupEvents(db, member.token, group.id)).events.length,
    0
  );
  await groupEventCommand(
    db,
    owner.token,
    body("unlink-event", {
      groupId: group.id,
      occurrenceId: event.occurrence.id,
      expectedVersion: linked.version
    })
  );
  assert.equal(
    (await readGroupEvents(db, owner.token, group.id)).events.length,
    0
  );
  assert.equal(
    await db.calendarOccurrence.count({ where: { eventId: event.event.id } }),
    1
  );
  assert.equal(
    await db.calendarResponse.count({
      where: { occurrenceId: event.occurrence.id }
    }),
    0
  );
});

test("group ownership, private export and permanent erasure use existing account lifecycle boundaries", async () => {
  const { owner, member, group } = await fixture({ joinPolicy: "OPEN" });
  await join(member, group, true);
  await assert.rejects(
    deactivateAccount(db, owner.token, owner.password, true),
    (e) => e instanceof AccountLifecycleError && e.code === "handoff"
  );
  assert.equal(
    (await db.platformUser.findUniqueOrThrow({ where: { id: owner.id } }))
      .deactivatedAt,
    null
  );
  const post = await publish(member, group.id, {
    content: "My own private export content"
  });
  await commentCommand(
    db,
    owner.token,
    body("create", {
      postId: post.id,
      content: "Another member private reply excluded from export"
    })
  );
  await db.gatherGroupAudit.create({
    data: {
      groupId: group.id,
      actorId: owner.id,
      targetId: member.id,
      action: "FIXTURE_REVIEW",
      reason: "Private moderator notes excluded",
      version: 1
    }
  });
  const secret = process.env.AUTH_RATE_LIMIT_SECRET!;
  const proof = await prepareAccountExport(
    db,
    member.token,
    member.password,
    secret
  );
  const exported = await downloadAccountExport(
    db,
    member.token,
    proof.authorization,
    secret
  );
  const data = JSON.parse(exported);
  assert.ok(exported.includes("My own private export content"));
  assert.ok(!exported.includes("Another member private reply excluded"));
  assert.ok(!exported.includes("Private moderator notes excluded"));
  assert.equal(data.groupChoices[0].groupId, group.id);
  assert.equal(data.groupChoices[0].rosterVisible, true);
  assert.equal(data.ownedGroups.length, 0);
  const journal = { async recordAccount() {}, async completeAccount() {} };
  await requestPermanentAccountDeletion(
    db,
    member.token,
    member.password,
    true,
    createSessionToken(),
    journal
  );
  assert.equal((await own(member, group.id)).state, "LEFT");
  const deletion = await db.accountDeletion.findUniqueOrThrow({
    where: { userId: member.id }
  });
  await eraseRequestedAccountData(db, deletion.id, journal);
  assert.equal((await own(member, group.id)).rosterVisible, false);
  assert.equal(
    (await db.platformPost.findUniqueOrThrow({ where: { id: post.id } }))
      .content,
    ""
  );
  assert.equal(
    (
      await db.gatherGroupAudit.findFirstOrThrow({
        where: { groupId: group.id, action: "FIXTURE_REVIEW" }
      })
    ).reason,
    null
  );
  assert.equal(await getPost(db, owner.token, post.id), null);
});

test("group notices contain generic current-source metadata and require a separate dated phone choice", async () => {
  const { owner, member, group } = await fixture();
  await join(member, group);
  const review = await db.socialEvent.findFirstOrThrow({
    where: {
      kind: "GROUP_REVIEW",
      recipientId: owner.id,
      sourceId: (await own(member, group.id)).id
    }
  });
  const reviewSource = await db.$transaction((tx) =>
    notificationSource(tx, review, false)
  );
  assert.ok(reviewSource?.href.endsWith("/manage"));
  await decide(owner, member, group);
  assert.equal(
    await db.$transaction((tx) => notificationSource(tx, review, true)),
    null
  );
  const event = await db.socialEvent.findFirstOrThrow({
    where: {
      kind: "GROUP_MEMBERSHIP",
      recipientId: member.id,
      sourceId: (await own(member, group.id)).id
    },
    orderBy: { createdAt: "desc" }
  });
  const source = await db.$transaction((tx) =>
    notificationSource(tx, event, false)
  );
  assert.equal(source?.category, "groups");
  assert.ok(!JSON.stringify(source).includes(group.fields.name));
  assert.ok(
    !JSON.stringify(event, (_key, value) =>
      typeof value === "bigint" ? value.toString() : value
    ).includes(group.fields.rules)
  );
  assert.equal(
    await db.$transaction((tx) => notificationSource(tx, event, "EMAIL")),
    null
  );
  assert.equal(notificationPushAllowed(null, "groups", event.createdAt), false);
  const preferences = await db.socialPreferences.upsert({
    where: { ownerId: member.id },
    create: { ownerId: member.id, pushCategories: ["groups"] },
    update: { pushCategories: ["groups"], notificationPushSince: {} }
  });
  assert.equal(
    notificationPushAllowed(preferences, "groups", event.createdAt),
    false
  );
  const since = new Date(event.createdAt.getTime() - 1000).toISOString();
  const dated = await db.socialPreferences.update({
    where: { ownerId: member.id },
    data: { notificationPushSince: { groups: since } }
  });
  assert.equal(notificationPushAllowed(dated, "groups", event.createdAt), true);
  await notificationPreferenceCommand(
    db,
    member.token,
    body("preferences", {
      ownerId: member.id,
      expectedVersion: dated.version,
      inApp: Object.fromEntries(
        notificationCategories
          .filter((c) => c !== "groups")
          .map((c) => [c, true])
      ),
      pushCategories: [],
      quietHours: null
    })
  );
  const retained = await db.socialPreferences.findUniqueOrThrow({
    where: { ownerId: member.id }
  });
  assert.ok(retained.pushCategories.includes("groups"));
  assert.equal(
    (retained.notificationPushSince as Record<string, string>).groups,
    since
  );
  const activity = await readActivity(db, member.token, { category: "groups" });
  assert.equal(activity.items.length, 1);
  assert.equal(activity.items[0].available, true);
  assert.ok(!JSON.stringify(activity).includes(group.fields.name));
  assert.equal(
    await db.notificationDelivery.count({ where: { eventId: event.id } }),
    0
  );
  await relationshipCommand(db, member.token, {
    operation: "block",
    kind: "person",
    targetId: owner.id,
    expectedVersion: 0,
    desired: true,
    mutationId: randomUUID()
  });
  assert.equal(
    await db.$transaction((tx) => notificationSource(tx, event, true)),
    null
  );
});

test("group HTTP boundaries pin the account, reject foreign actions and retain private no-store responses", async () => {
  const { owner, member, stranger, group } = await fixture({
    joinPolicy: "OPEN"
  });
  const origin = process.env.ACCOUNT_ORIGIN!;
  const read = await readGroup(db, member.token, group.slug);
  const input = body("join", {
    groupId: group.id,
    expectedVersion: 0,
    rulesVersion: read.group.rulesVersion,
    acceptedRules: true,
    rosterVisible: false
  });
  const send = (
    headers: Record<string, string>,
    payload: Record<string, unknown> = input
  ) =>
    handleGroupRequest(
      db,
      new Request(origin + "/api/platform/groups", {
        method: "POST",
        headers: {
          cookie: "church_platform_session=" + member.token,
          "content-type": "application/json",
          ...headers
        },
        body: JSON.stringify(payload)
      })
    );
  assert.equal(
    (await send({ origin, "x-expected-account": stranger.id })).status,
    401
  );
  assert.equal(
    (
      await send({
        origin: "https://foreign.invalid",
        "x-expected-account": member.id
      })
    ).status,
    403
  );
  assert.equal((await send({ origin })).status, 401);
  assert.equal(
    (
      await send(
        { origin, "x-expected-account": member.id },
        { ...input, unknown: true }
      )
    ).status,
    400
  );
  const saved = await send({ origin, "x-expected-account": member.id });
  assert.ok([200, 202].includes(saved.status));
  const savedData = await saved.json();
  const replay = await send({ origin, "x-expected-account": member.id });
  assert.equal((await replay.json()).id, savedData.id);
  assert.equal(
    await db.gatherGroupMembership.count({
      where: { groupId: group.id, userId: member.id }
    }),
    1
  );
  for (const key of [
    "cache-control",
    "cdn-cache-control",
    "vercel-cdn-cache-control"
  ])
    assert.match(saved.headers.get(key) ?? "", /no-store/);
  assert.match(saved.headers.get("vary") ?? "", /X-Expected-Account/);
  const guest = await handleGroupRequest(
    db,
    new Request(origin + "/api/platform/groups?view=about&slug=" + group.slug)
  );
  assert.equal(guest.status, 200);
  assert.ok(!JSON.stringify(await guest.json()).includes(member.username));
  assert.equal(
    (
      await handleGroupRequest(
        db,
        new Request(
          origin + "/api/platform/groups?view=members&slug=" + group.slug
        )
      )
    ).status,
    404
  );
  assert.equal(
    (
      await handleGroupRequest(
        db,
        new Request(origin + "/api/platform/groups?view=list&view=mine")
      )
    ).status,
    400
  );
  await decide(owner, member, group, "REMOVED");
  assert.equal(
    (await send({ origin, "x-expected-account": member.id })).status,
    404
  );
  const privateGroup = await create(stranger, {
    discovery: "UNLISTED",
    joinPolicy: "INVITE_ONLY"
  });
  assert.equal(
    (
      await handleGroupRequest(
        db,
        new Request(
          origin + "/api/platform/groups?view=about&slug=" + privateGroup.slug
        )
      )
    ).status,
    404
  );
});

test("group account returns preserve a destination without carrying cursors or actions", () => {
  for (const path of [
    "/platform/groups",
    "/platform/groups/new",
    "/platform/groups/mine",
    "/platform/groups/invitations",
    "/platform/groups/adult-study/discussion",
    "/platform/groups/adult-study/manage"
  ])
    assert.equal(
      safeAccountReturn(path + "?invitation=private&operation=join#confirm"),
      path
    );
  assert.equal(
    safeAccountReturn("https://foreign.invalid/platform/groups"),
    "/platform"
  );
  assert.equal(
    safeAccountReturn("/platform/groups/adult-study/erase"),
    "/platform"
  );
});
