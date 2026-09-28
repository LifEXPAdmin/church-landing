import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  assertPortalTestDatabase,
  createPortalActor,
  seedOperatorGrants,
  type PortalActor
} from "./seed-portal";
import { artistCommand as command } from "../lib/platform/artist-commands";
import { artistRead as read } from "../lib/platform/artist-reads";
import { ARTIST_POLICY } from "../lib/platform/artist-types";
import { PortalError } from "../lib/platform/portal-policy";
import { relationshipCommand } from "../lib/platform/relationships";
import { postContext } from "../lib/platform/post-access";
import {
  exportArtists,
  eraseArtists,
  replayArtistControl
} from "../lib/platform/artist-retention";
import {
  communityReportCommand,
  readCommunityReports
} from "../lib/platform/community-reports";
import { calendarCommand } from "../lib/platform/calendar-commands";
import { purgeMessagingCandidate } from "../lib/platform/messaging-retention";
const db = new PrismaClient();
let owner: PortalActor,
  other: PortalActor,
  editor: PortalActor,
  reviewer: PortalActor;
before(async () => {
  await assertPortalTestDatabase(db);
  owner = await createPortalActor(db, "artistown");
  other = await createPortalActor(db, "artistoth");
  editor = await createPortalActor(db, "artistedit");
  reviewer = await createPortalActor(db, "artreview");
  await seedOperatorGrants(db, reviewer, ["REVIEW_COMMUNITY_REPORTS"]);
});
beforeEach(() => db.platformAuthLimit.deleteMany());
after(() => db.$disconnect());
const input = (operation: string, more: Record<string, unknown> = {}) => ({
  operation,
  mutationId: randomUUID(),
  ...more
});
const fields = (patch: Record<string, unknown> = {}) => ({
  name: `Fictional artist ${randomUUID()}`,
  presentation: "TEAM",
  biography: "Publisher supplied biography",
  roles: ["Band"],
  genres: ["Acoustic"],
  credits: [],
  ...patch
});
const rights = { policy: ARTIST_POLICY, confirmed: true, basis: "OWN_WORK" };
const create = (f = fields(), actor = owner) =>
  command(
    db,
    actor.token,
    input("create", {
      fields: f,
      rights,
      representation: true,
      policy: ARTIST_POLICY
    })
  );
async function published(f = fields(), actor = owner) {
  const draft = await create(f, actor),
    v = input("publish", {
      artistId: draft.id,
      expectedVersion: 1,
      fields: f,
      rights
    });
  return { r: await command(db, actor.token, v), v, f };
}
const detail = (id: string, actor?: PortalActor) =>
  read(db, actor?.token, new URLSearchParams({ view: "detail", id }));
const denied = (p: Promise<unknown>, status = 404) =>
  assert.rejects(
    p,
    (e: unknown) => e instanceof PortalError && e.status === status
  );
const release = (patch: Record<string, unknown> = {}) => ({
  kind: "SINGLE",
  title: "Fictional song",
  description: "External release",
  tracks: [
    {
      id: randomUUID(),
      title: "Song",
      links: ["https://fictional.bandcamp.com/track/song"]
    }
  ],
  links: [],
  credits: [],
  ...patch
});
async function publishedRelease(
  artistId: string,
  f = release(),
  actor = owner
) {
  const draft = await command(
    db,
    actor.token,
    input("create-release", { artistId, fields: f })
  );
  const v = input("publish-release", {
    artistId,
    releaseId: draft.id,
    expectedVersion: 1,
    fields: f,
    rights
  });
  return { r: await command(db, actor.token, v), v, f };
}
test("private drafts and unrelated editor reads never enter public detail or discovery", async () => {
  const f = fields(),
    r = await create(f);
  await denied(detail(r.id));
  await denied(
    read(db, other.token, new URLSearchParams({ view: "editor", id: r.id }))
  );
  const page = await read(db, null, new URLSearchParams({ q: f.name }));
  assert.equal(page.total, 0);
  const own = await read(
    db,
    owner.token,
    new URLSearchParams({ view: "editor", id: r.id })
  );
  assert.equal(own.artist?.name, f.name);
});
test("public profile works without releases and exposes no stewardship or rights evidence", async () => {
  const { r, f } = await published();
  const v = await detail(r.id);
  assert.equal(v.artist?.name, f.name);
  assert.deepEqual(v.releases, []);
  for (const privateValue of [
    owner.id,
    owner.email,
    "rightsBasis",
    "rightsActorId",
    "delegates",
    "verified"
  ])
    assert.equal(JSON.stringify(v).includes(privateValue), false, privateValue);
});
test("representation and exact rights are required, and publication stops with unavailable reporting", async () => {
  await denied(
    command(
      db,
      owner.token,
      input("create", {
        fields: fields(),
        rights,
        representation: false,
        policy: ARTIST_POLICY
      })
    ),
    400
  );
  const f = fields(),
    r = await create(f);
  const enabled = process.env.COMMUNITY_REPORTS_ENABLED;
  process.env.COMMUNITY_REPORTS_ENABLED = "false";
  try {
    await denied(
      command(
        db,
        owner.token,
        input("publish", {
          artistId: r.id,
          expectedVersion: 1,
          fields: f,
          rights
        })
      ),
      503
    );
  } finally {
    process.env.COMMUNITY_REPORTS_ENABLED = enabled;
  }
});
test("exact create and publication retries preserve one identity; changed bodies conflict", async () => {
  const f = fields(),
    v = input("create", {
      fields: f,
      rights,
      representation: true,
      policy: ARTIST_POLICY
    });
  const a = await command(db, owner.token, v),
    b = await command(db, owner.token, v);
  assert.equal(a.id, b.id);
  await denied(
    command(db, owner.token, { ...v, fields: { ...f, name: "Changed" } }),
    409
  );
  const p = input("publish", {
    artistId: a.id,
    expectedVersion: 1,
    fields: f,
    rights
  });
  await command(db, owner.token, p);
  await command(db, owner.token, p);
  assert.equal(
    (await db.artistProfile.findUniqueOrThrow({ where: { id: a.id } })).version,
    2
  );
});
test("editor invitations require exact current acceptance; profile scope grants no release permission", async () => {
  const { r } = await published(),
    inv = await command(
      db,
      owner.token,
      input("invite", {
        artistId: r.id,
        accountId: editor.id,
        capabilities: ["EDIT_ARTIST_PROFILE"],
        expectedVersion: 0
      })
    );
  await denied(
    read(db, editor.token, new URLSearchParams({ view: "editor", id: r.id }))
  );
  const accept = input("accept-invite", {
    artistId: r.id,
    invitationId: inv.id,
    expectedVersion: inv.version
  });
  await command(db, editor.token, accept);
  const current = await read(
    db,
    editor.token,
    new URLSearchParams({ view: "editor", id: r.id })
  );
  assert.equal(current.permissions?.profile, true);
  assert.equal(current.permissions?.drafts, false);
  await denied(
    command(
      db,
      editor.token,
      input("create-release", { artistId: r.id, fields: release() })
    )
  );
  await denied(
    command(
      db,
      editor.token,
      input("publish", {
        artistId: r.id,
        expectedVersion: 2,
        fields: fields(),
        rights
      })
    )
  );
  await command(
    db,
    owner.token,
    input("revoke-invite", {
      artistId: r.id,
      invitationId: inv.id,
      expectedVersion: 2
    })
  );
  await denied(command(db, editor.token, accept));
  await denied(
    read(db, editor.token, new URLSearchParams({ view: "editor", id: r.id }))
  );
});
test("expired and replaced invitations fail and grants stay isolated to the chosen artist", async () => {
  const a = await create(),
    b = await create();
  const ia = await command(
    db,
    owner.token,
    input("invite", {
      artistId: a.id,
      accountId: editor.id,
      capabilities: ["EDIT_ARTIST_RELEASES"],
      expectedVersion: 0
    })
  );
  const ib = await command(
    db,
    owner.token,
    input("invite", {
      artistId: b.id,
      accountId: editor.id,
      capabilities: ["PUBLISH_ARTIST_RELEASES"],
      expectedVersion: 0
    })
  );
  await db.artistDelegate.update({
    where: { id: ia.id },
    data: { expiresAt: new Date(0) }
  });
  await denied(
    command(
      db,
      editor.token,
      input("accept-invite", {
        artistId: a.id,
        invitationId: ia.id,
        expectedVersion: 1
      })
    ),
    409
  );
  await command(
    db,
    editor.token,
    input("accept-invite", {
      artistId: b.id,
      invitationId: ib.id,
      expectedVersion: 1
    })
  );
  await command(
    db,
    owner.token,
    input("revoke-invite", {
      artistId: a.id,
      invitationId: ia.id,
      expectedVersion: 1
    })
  );
  assert.equal(
    (
      await read(
        db,
        editor.token,
        new URLSearchParams({ view: "editor", id: b.id })
      )
    ).permissions?.publish,
    true
  );
});
test("release publication is independent from the parent and validates private drafts before projection", async () => {
  const f = fields(),
    a = await create(f),
    r = await publishedRelease(a.id);
  await denied(detail(a.id));
  await command(
    db,
    owner.token,
    input("publish", { artistId: a.id, expectedVersion: 1, fields: f, rights })
  );
  const v = await detail(a.id);
  assert.equal(v.releases?.[0].id, r.r.id);
  assert.equal(JSON.stringify(v).includes("rightsActorId"), false);
  const draft = await command(
    db,
    owner.token,
    input("create-release", {
      artistId: a.id,
      fields: release({ title: "Hidden unreleased" })
    })
  );
  assert.equal(
    (await detail(a.id)).releases?.some((x) => x.id === draft.id),
    false
  );
});
test("withdrawal, expiry, blocks and steward closure remove sources from count and detail", async () => {
  const { r, f } = await published();
  await publishedRelease(r.id);
  await db.artistProfile.update({
    where: { id: r.id },
    data: { rightsExpiresAt: new Date(0) }
  });
  await denied(detail(r.id));
  assert.equal(
    (await read(db, null, new URLSearchParams({ q: f.name }))).total,
    0
  );
  await db.artistProfile.update({
    where: { id: r.id },
    data: { rightsExpiresAt: null }
  });
  await db.socialRelationship.create({
    data: { ownerId: other.id, targetUserId: owner.id, blocked: true }
  });
  await denied(detail(r.id, other));
  assert.ok((await detail(r.id)).artist);
  await db.socialRelationship.deleteMany({
    where: { ownerId: other.id, targetUserId: owner.id }
  });
  await db.platformUser.update({
    where: { id: owner.id },
    data: { suspendedAt: new Date() }
  });
  await denied(detail(r.id));
  await db.platformUser.update({
    where: { id: owner.id },
    data: { suspendedAt: null }
  });
});
test("old publication receipt cannot revive an unpublished artist or release", async () => {
  const { r, v } = await published(),
    music = await publishedRelease(r.id);
  await command(
    db,
    owner.token,
    input("unpublish-release", {
      artistId: r.id,
      releaseId: music.r.id,
      expectedVersion: 2
    })
  );
  await denied(command(db, owner.token, music.v), 409);
  await command(
    db,
    owner.token,
    input("unpublish", { artistId: r.id, expectedVersion: 2 })
  );
  await denied(command(db, owner.token, v), 409);
  await denied(detail(r.id));
});
test("artist following reuses one relationship identity and grants no person follow or notification", async () => {
  const { r } = await published();
  const v = input("follow", {
    kind: "artist",
    targetId: r.id,
    expectedVersion: 0,
    desired: true
  });
  await relationshipCommand(db, other.token, v);
  await relationshipCommand(db, other.token, v);
  assert.equal(
    await db.socialRelationship.count({
      where: { ownerId: other.id, artistId: r.id }
    }),
    1
  );
  assert.equal(
    await db.platformFollow.count({
      where: { followerId: other.id, followingId: owner.id }
    }),
    0
  );
  assert.equal(
    (
      await read(db, other.token, new URLSearchParams({ view: "following" }))
    ).items?.some((x) => x.id === r.id),
    true
  );
  await denied(
    relationshipCommand(
      db,
      other.token,
      input("author-bell", {
        kind: "artist",
        targetId: r.id,
        expectedVersion: 1,
        desired: true
      })
    ),
    400
  );
  await relationshipCommand(
    db,
    other.token,
    input("follow", {
      kind: "artist",
      targetId: r.id,
      expectedVersion: 1,
      desired: false
    })
  );
  await denied(relationshipCommand(db, other.token, v), 409);
});
test("ordered tracks keep stable identities through editing, conflict and replay", async () => {
  const { r } = await published();
  const f = release({
    kind: "ALBUM",
    tracks: [
      { id: "one", title: "First", links: [] },
      { id: "two", title: "Second", links: [] }
    ],
    links: ["https://fictional.bandcamp.com/album/collection"]
  });
  const d = await command(
    db,
    owner.token,
    input("create-release", { artistId: r.id, fields: f })
  );
  const v = input("save-release", {
    artistId: r.id,
    releaseId: d.id,
    expectedVersion: 1,
    fields: { ...f, tracks: [...f.tracks].reverse() }
  });
  await command(db, owner.token, v);
  await command(db, owner.token, v);
  const row = await db.artistRelease.findUniqueOrThrow({ where: { id: d.id } });
  assert.deepEqual(
    (row.tracks as { id: string }[]).map((x) => x.id),
    ["two", "one"]
  );
  await denied(
    command(
      db,
      owner.token,
      input("save-release", {
        artistId: r.id,
        releaseId: d.id,
        expectedVersion: 1,
        fields: f
      })
    ),
    409
  );
});
test("export remains steward scoped and erasure hides owned artists and releases", async () => {
  const actor = await createPortalActor(db, "arterase"),
    { r } = await published(fields(), actor),
    releaseRow = await publishedRelease(r.id, release(), actor);
  const exported = await db.$transaction((tx) =>
    exportArtists(tx, actor.id, 100)
  );
  assert.equal(exported.artistProfiles.length, 1);
  assert.equal(exported.artistReleases[0].id, releaseRow.r.id);
  assert.equal(
    (await db.$transaction((tx) => exportArtists(tx, other.id, 100)))
      .artistProfiles.length,
    0
  );
  await db.$transaction((tx) => eraseArtists(tx, actor.id, new Date()));
  await denied(detail(r.id));
  const row = await db.artistProfile.findUniqueOrThrow({ where: { id: r.id } });
  assert.equal(row.name, "");
  assert.equal(row.stewardId, null);
});
test("newer protected artist and release controls quarantine older restored sources idempotently", async () => {
  const { r } = await published(),
    music = await publishedRelease(r.id);
  await db.$transaction(async (tx) => {
    const c = await postContext(tx, owner.id);
    assert.equal(c.eligible, true);
    await replayArtistControl(tx, "ARTIST_RELEASE", music.r.id, 10, new Date());
    await replayArtistControl(tx, "ARTIST", r.id, 12, new Date());
    await replayArtistControl(tx, "ARTIST", r.id, 12, new Date());
  });
  await denied(detail(r.id));
  const row = await db.artistProfile.findUniqueOrThrow({ where: { id: r.id } });
  assert.equal(row.controlVersion, 12);
  assert.equal(row.recoveryRequired, true);
  assert.equal(
    (await db.artistRelease.findUniqueOrThrow({ where: { id: music.r.id } }))
      .recoveryRequired,
    true
  );
});
test("profile-only delegates cannot read release drafts and blocked studios conceal private profiles", async () => {
  const a = await create(),
    d = await command(
      db,
      owner.token,
      input("create-release", {
        artistId: a.id,
        fields: release({ title: "Private recording draft" })
      })
    ),
    invite = await command(
      db,
      owner.token,
      input("invite", {
        artistId: a.id,
        accountId: editor.id,
        capabilities: ["EDIT_ARTIST_PROFILE"],
        expectedVersion: 0
      })
    );
  await command(
    db,
    editor.token,
    input("accept-invite", {
      artistId: a.id,
      invitationId: invite.id,
      expectedVersion: 1
    })
  );
  const v = await read(
    db,
    editor.token,
    new URLSearchParams({ view: "editor", id: a.id })
  );
  assert.deepEqual(v.releases, []);
  assert.equal(JSON.stringify(v).includes(d.id), false);
  await db.socialRelationship.create({
    data: { ownerId: owner.id, targetUserId: editor.id, blocked: true }
  });
  const studio = await read(
    db,
    editor.token,
    new URLSearchParams({ view: "studio" })
  );
  assert.equal(
    studio.items?.some((x) => x.id === a.id),
    false
  );
  await db.socialRelationship.deleteMany({
    where: { ownerId: owner.id, targetUserId: editor.id }
  });
});
test("actual shared rights reports restrict releases; lifting restriction never republishes owner withdrawal", async () => {
  const { r } = await published(),
    music = await publishedRelease(r.id);
  const target = await readCommunityReports(db, other.token, {
    view: "target",
    targetType: "ARTIST_RELEASE",
    targetId: music.r.id
  });
  assert.ok(target.target);
  const report = await communityReportCommand(
    db,
    other.token,
    input("create", {
      targetType: "ARTIST_RELEASE",
      targetId: music.r.id,
      expectedTargetVersion: target.target.version,
      expectedContextVersion: target.target.contextVersion,
      reason: "OTHER",
      details: "Fictional concern about publication permission."
    })
  );
  const review = await readCommunityReports(db, reviewer.token, {
    view: "review",
    id: report.id
  });
  assert.equal(review.source?.type, "ARTIST_RELEASE");
  assert.equal(
    JSON.stringify(review.evidence).includes("rightsActorId"),
    false
  );
  await denied(
    readCommunityReports(db, editor.token, { view: "review", id: report.id }),
    404
  );
  await communityReportCommand(
    db,
    reviewer.token,
    input("moderate", {
      id: report.id,
      expectedVersion: review.report!.version,
      expectedSourceVersion: review.source!.version,
      expectedContextVersion: review.source!.contextVersion,
      action: "HIDE",
      authorReason: "MISREPRESENTATION",
      decisionReason: "Fictional reviewed publication-permission concern."
    })
  );
  assert.equal((await detail(r.id)).releases?.length, 0);
  await denied(
    command(
      db,
      owner.token,
      input("save-release", {
        artistId: r.id,
        releaseId: music.r.id,
        expectedVersion: 3,
        fields: release(),
        rights
      })
    )
  );
  await command(
    db,
    owner.token,
    input("unpublish-release", {
      artistId: r.id,
      releaseId: music.r.id,
      expectedVersion: 3
    })
  );
  const current = await readCommunityReports(db, reviewer.token, {
    view: "review",
    id: report.id
  });
  await communityReportCommand(
    db,
    reviewer.token,
    input("moderate", {
      id: report.id,
      expectedVersion: current.report!.version,
      expectedSourceVersion: current.source!.version,
      expectedContextVersion: current.source!.contextVersion,
      action: "RESTORE",
      authorReason: "NO_VIOLATION",
      decisionReason:
        "Fictional review completed; source owner remains in control."
    })
  );
  assert.equal((await detail(r.id)).releases?.length, 0);
  assert.equal(
    (await db.artistRelease.findUniqueOrThrow({ where: { id: music.r.id } }))
      .state,
    "UNPUBLISHED"
  );
});
test("artist removal clears dependent releases but preserves only exact selected report evidence", async () => {
  const { r } = await published(),
    music = await publishedRelease(r.id),
    second = await publishedRelease(r.id, release({ title: "Unheld source" }));
  const report = await db.communityReport.create({
    data: {
      reporterId: other.id,
      targetType: "ARTIST_RELEASE",
      targetId: music.r.id,
      targetVersion: 2,
      contextVersion: 2,
      reason: "OTHER",
      details: "Selected evidence"
    }
  });
  const v = input("remove", { artistId: r.id, expectedVersion: 2 });
  await command(db, owner.token, v);
  await command(db, owner.token, v);
  assert.equal(
    (await db.artistRelease.findUniqueOrThrow({ where: { id: music.r.id } }))
      .title,
    "Fictional song"
  );
  assert.equal(
    (await db.artistRelease.findUniqueOrThrow({ where: { id: second.r.id } }))
      .title,
    ""
  );
  await db.$transaction((tx) =>
    purgeMessagingCandidate(tx, { target: "REPORT", id: report.id, version: 1 })
  );
  assert.equal(
    (await db.artistRelease.findUniqueOrThrow({ where: { id: music.r.id } }))
      .title,
    ""
  );
});
test("organizer consent follows actual calendar updates and stays revocable after visibility loss", async () => {
  const { r } = await published(),
    church = await db.church.create({
      data: {
        slug: randomUUID(),
        name: "Fictional music events",
        summary: "Isolated",
        communityListed: true
      }
    });
  await db.churchConnection.create({
    data: { userId: reviewer.id, churchId: church.id, state: "APPROVED" }
  });
  await db.churchCapabilityGrant.createMany({
    data: ["EDIT_CHURCH_CALENDAR", "PUBLISH_CHURCH_EVENTS"].map(
      (capability) => ({
        userId: reviewer.id,
        churchId: church.id,
        capability: capability as
          | "EDIT_CHURCH_CALENDAR"
          | "PUBLISH_CHURCH_EVENTS"
      })
    )
  });
  const calendar = await calendarCommand(db, reviewer.token, {
    operation: "create-calendar",
    churchId: church.id,
    requestKey: randomUUID(),
    name: "Fictional performances",
    timeZone: "America/Chicago"
  });
  const event = await calendarCommand(db, reviewer.token, {
    operation: "create-event",
    calendarId: calendar.id,
    expectedVersion: 1,
    requestKey: randomUUID(),
    title: "Fictional concert",
    allDay: false,
    startLocal: "2026-11-15T10:00",
    endLocal: "2026-11-15T11:00",
    timeZone: "America/Chicago",
    weeklyUntil: null,
    visibility: "PUBLIC"
  });
  const occurrence = await db.calendarOccurrence.findFirstOrThrow({
      where: { eventId: event.id }
    }),
    proposal = await command(
      db,
      owner.token,
      input("propose-event", {
        artistId: r.id,
        occurrenceId: occurrence.id,
        expectedVersion: 0
      })
    );
  assert.equal((await detail(r.id)).events?.length, 0);
  const acceptance = input("accept-event", {
    artistId: r.id,
    associationId: proposal.id,
    expectedVersion: 1
  });
  await denied(command(db, other.token, acceptance), 403);
  await command(db, reviewer.token, acceptance);
  assert.equal((await detail(r.id)).events?.[0].title, "Fictional concert");
  await command(
    db,
    owner.token,
    input("unpublish", { artistId: r.id, expectedVersion: 2 })
  );
  await denied(command(db, reviewer.token, acceptance));
  const sourceArtist = await db.artistProfile.findUniqueOrThrow({
    where: { id: r.id }
  });
  await command(
    db,
    owner.token,
    input("publish", {
      artistId: r.id,
      expectedVersion: 3,
      fields: fields({ name: sourceArtist.name }),
      rights
    })
  );
  await db.churchConnection.update({
    where: { userId_churchId: { userId: reviewer.id, churchId: church.id } },
    data: { state: "LEFT" }
  });
  assert.equal((await detail(r.id)).events?.length, 0);
  await denied(command(db, reviewer.token, acceptance), 403);
  await db.churchConnection.update({
    where: { userId_churchId: { userId: reviewer.id, churchId: church.id } },
    data: { state: "APPROVED" }
  });
  await db.calendarOccurrence.update({
    where: { id: occurrence.id },
    data: {
      title: "Changed canonical title",
      canceledAt: new Date(),
      version: { increment: 1 }
    }
  });
  assert.equal(
    (await detail(r.id)).events?.[0].title,
    "Changed canonical title"
  );
  assert.equal((await detail(r.id)).events?.[0].canceled, true);
  await db.calendarEvent.update({
    where: { id: event.id },
    data: { visibility: "PRIVATE" }
  });
  assert.equal((await detail(r.id)).events?.length, 0);
  const minimal = await read(
    db,
    reviewer.token,
    new URLSearchParams({ view: "association", id: proposal.id })
  );
  assert.equal(minimal.association?.accepted, true);
  await command(
    db,
    reviewer.token,
    input("revoke-event", {
      artistId: r.id,
      associationId: proposal.id,
      expectedVersion: 2
    })
  );
  await db.calendarEvent.update({
    where: { id: event.id },
    data: { visibility: "PUBLIC" }
  });
  assert.equal((await detail(r.id)).events?.length, 0);
  await denied(command(db, reviewer.token, acceptance));
});

test("old publication receipts recheck the current assertion actor and revoked scope", async () => {
  const { r, v, f } = await published();
  const invitation = await command(
    db,
    owner.token,
    input("invite", {
      artistId: r.id,
      accountId: editor.id,
      capabilities: ["EDIT_ARTIST_PROFILE"],
      expectedVersion: 0
    })
  );
  await command(
    db,
    editor.token,
    input("accept-invite", {
      artistId: r.id,
      invitationId: invitation.id,
      expectedVersion: 1
    })
  );
  await command(
    db,
    editor.token,
    input("save", { artistId: r.id, expectedVersion: 2, fields: f, rights })
  );
  await command(
    db,
    owner.token,
    input("revoke-invite", {
      artistId: r.id,
      invitationId: invitation.id,
      expectedVersion: 2
    })
  );
  await denied(detail(r.id));
  await denied(command(db, owner.token, v), 409);
});

test("named town and combined filters paginate only currently public artists; unavailable owned follows can be cleared", async () => {
  const { searchDiscoveryPlaces } =
    await import("../lib/platform/discovery-places");
  const places = await searchDiscoveryPlaces("US", "Chicago");
  const town = places.places[0];
  assert.ok(town);
  const tag = randomUUID();
  const ids: string[] = [];
  for (let i = 0; i < 21; i++) {
    const item = await published(
      fields({
        name: `Paging ${tag} ${String(i).padStart(2, "0")}`,
        countryId: "US",
        townId: String(town.id),
        churchCredit: "Supplied fixture ministry"
      })
    );
    ids.push(item.r.id);
  }
  await create(
    fields({
      name: `Paging ${tag} private`,
      countryId: "US",
      townId: String(town.id)
    })
  );
  const q = new URLSearchParams({
    q: tag,
    genre: "Acoustic",
    role: "Band",
    country: "US",
    town: String(town.id),
    church: "fixture ministry"
  });
  const first = await read(db, undefined, q);
  assert.equal(first.total, 21);
  assert.equal(first.items?.length, 20);
  assert.equal(first.pages, 2);
  q.set("page", "2");
  const second = await read(db, undefined, q);
  assert.equal(second.items?.length, 1);
  assert.equal(
    new Set([...first.items!, ...second.items!].map((x) => x.id)).size,
    21
  );
  const follow = await relationshipCommand(
    db,
    other.token,
    input("follow", {
      kind: "artist",
      targetId: ids[0],
      desired: true,
      expectedVersion: 0
    })
  );
  await command(
    db,
    owner.token,
    input("unpublish", { artistId: ids[0], expectedVersion: 2 })
  );
  const hidden = await read(
    db,
    other.token,
    new URLSearchParams({ view: "following" })
  );
  assert.ok(
    hidden.unavailable?.some(
      (x) => x.artistId === ids[0] && x.version === follow.version
    )
  );
  assert.ok(!JSON.stringify(hidden.unavailable).includes(tag));
  await relationshipCommand(
    db,
    other.token,
    input("follow", {
      kind: "artist",
      targetId: ids[0],
      desired: false,
      expectedVersion: follow.version
    })
  );
  assert.ok(
    !(
      await read(db, other.token, new URLSearchParams({ view: "following" }))
    ).unavailable?.some((x) => x.artistId === ids[0])
  );
});
