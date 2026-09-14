import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  assertPortalTestDatabase,
  createPortalActor,
  seedPortal,
  seedOperatorGrants
} from "./seed-portal";
import { PortalError } from "../lib/platform/portal-policy";
import { postCommand } from "../lib/platform/post-commands";
import { getPost, getPostAvailability } from "../lib/platform/post-reads";
import { handlePostRequest } from "../lib/platform/post-boundary";
import { requestPermanentAccountDeletion } from "../lib/platform/account-deletion";
import { eraseRequestedAccountData } from "../lib/platform/account-erasure";
import { createSessionToken } from "../lib/platform/auth";
import { getPostEditor } from "../lib/platform/post-editor";
import { postPreviewText } from "../lib/platform/post-options";
import {
  privateDraftPayload,
  postWorkspaceCommand as workspace,
  readPostWorkspace
} from "../lib/platform/post-workspace";
import { publicSharePreview } from "../lib/platform/public-sharing";
import { communitySearch } from "../lib/platform/community-search";
import { repostCommand } from "../lib/platform/reposts";
import { relationshipCommand } from "../lib/platform/relationships";
import { readCommunityReports } from "../lib/platform/community-reports";
import {
  prepareAccountExport,
  downloadAccountExport
} from "../lib/platform/account-export";
import { purgeMessagingCandidate } from "../lib/platform/messaging-retention";

const db = new PrismaClient();
before(() => assertPortalTestDatabase(db));
after(() => db.$disconnect());
const m = (operation: string, fields: Record<string, unknown> = {}) => ({
  operation,
  mutationId: randomUUID(),
  ...fields
});
const denied = (promise: Promise<unknown>, status: number) =>
  assert.rejects(
    promise,
    (error: unknown) => error instanceof PortalError && error.status === status
  );
const create = (token: string, fields: Record<string, unknown> = {}) =>
  postCommand(db, token, {
    operation: "create",
    requestKey: randomUUID(),
    content: "Fictional full text " + randomUUID(),
    ...fields
  });

test("author notes and excerpts validate without truncation, persist in current reads, and survive older edits until explicitly cleared", async () => {
  const author = await createPortalActor(db, "notewriter");
  const note = "A reflection on loss",
    excerpt = "Finding support in community.";
  const post = await create(author.token, {
    contentNote: note,
    safeExcerpt: excerpt
  });
  const read = await getPost(db, author.token, post.id);
  assert.equal(read!.contentNote, note);
  assert.equal(read!.safeExcerpt, excerpt);
  assert.equal(
    (await getPostEditor(db, author.token, post.id)).contentNote,
    note
  );
  await postCommand(db, author.token, {
    operation: "edit",
    postId: post.id,
    expectedVersion: 1,
    content: "Older editor changed only the body."
  });
  assert.equal(
    (await getPostEditor(db, author.token, post.id)).safeExcerpt,
    excerpt
  );
  await denied(
    postCommand(db, author.token, {
      operation: "edit",
      postId: post.id,
      expectedVersion: 1,
      contentNote: "Stale choice"
    }),
    409
  );
  for (const fields of [
    { contentNote: "x".repeat(121) },
    { safeExcerpt: "x".repeat(161) },
    { contentNote: [] },
    { safeExcerpt: true }
  ])
    await denied(create(author.token, fields), 400);
  const maximum = await create(author.token, {
    contentNote: "x".repeat(120),
    safeExcerpt: "x".repeat(160)
  });
  assert.equal(
    (await getPost(db, author.token, maximum.id))!.safeExcerpt!.length,
    160
  );
  await postCommand(db, author.token, {
    operation: "edit",
    postId: post.id,
    expectedVersion: 2,
    contentNote: "",
    safeExcerpt: ""
  });
  const cleared = await getPost(db, author.token, post.id);
  assert.equal(cleared!.contentNote, null);
  assert.equal(cleared!.safeExcerpt, null);
  assert.equal(postPreviewText(cleared!), cleared!.content);
});

test("private note choices survive exact save/reopen/publish retries and cannot be dropped by an older full-snapshot save", async () => {
  const author = await createPortalActor(db, "notedraft"),
    other = await createPortalActor(db, "noteother");
  const id = randomUUID(),
    payload = {
      content: "Incomplete sensitive reflection",
      contentNote: "x".repeat(121),
      safeExcerpt: "  Preview\r\n  ",
      replyAudience: "VIEWERS"
    };
  const first = m("save-draft", { id, expectedVersion: 0, payload });
  const saved = await workspace(db, author.token, first);
  assert.deepEqual(await workspace(db, author.token, first), saved);
  assert.equal(privateDraftPayload(payload).safeExcerpt, payload.safeExcerpt);
  assert.deepEqual(
    await readPostWorkspace(db, other.token, { view: "draft", id }),
    { draft: null }
  );
  await denied(
    workspace(db, author.token, m("publish-draft", { id, expectedVersion: 1 })),
    400
  );
  assert.equal(
    (
      await db.privatePostDraft.findUniqueOrThrow({
        where: { ownerId_id: { ownerId: author.id, id } }
      })
    ).version,
    1
  );
  await denied(
    workspace(
      db,
      author.token,
      m("save-draft", {
        id,
        expectedVersion: 1,
        payload: { content: "Older editor", replyAudience: "VIEWERS" }
      })
    ),
    400
  );
  const valid = {
    ...payload,
    contentNote: "Author’s own note",
    safeExcerpt: "A chosen preview."
  };
  const second = m("save-draft", { id, expectedVersion: 1, payload: valid });
  await workspace(db, author.token, second);
  await denied(
    workspace(db, author.token, {
      ...second,
      payload: { ...valid, safeExcerpt: "Changed retry" }
    }),
    409
  );
  const opened = await readPostWorkspace(db, author.token, {
    view: "draft",
    id
  });
  assert.ok("draft" in opened && opened.draft);
  assert.equal(opened.draft.payload.contentNote, valid.contentNote);
  assert.equal(opened.draft.payload.replyAudience, "VIEWERS");
  const publish = m("publish-draft", { id, expectedVersion: 2 });
  const result = await workspace(db, author.token, publish);
  assert.deepEqual(await workspace(db, author.token, publish), result);
  const post = await getPost(db, author.token, result.postId!);
  assert.equal(post!.contentNote, valid.contentNote);
  assert.equal(post!.safeExcerpt, valid.safeExcerpt);
  assert.deepEqual(await workspace(db, author.token, first), saved);
  assert.equal(
    (
      await db.privatePostDraft.findUniqueOrThrow({
        where: { ownerId_id: { ownerId: author.id, id } }
      })
    ).payload,
    null
  );
  assert.equal(
    Object.hasOwn(
      privateDraftPayload({ content: "Old snapshot" }),
      "contentNote"
    ),
    false
  );
});

test("search, saved items, public metadata and current repost sources use the selected excerpt without weakening church, prayer or block rules", async () => {
  const f = await seedPortal(db),
    marker = "notepreview" + randomUUID().replaceAll("-", "");
  const post = await create(f.memberA.token, {
    content: marker + " full sensitive detail",
    contentNote: "Sensitive experience",
    safeExcerpt: "Author-selected safe preview",
    allowReposts: true
  });
  const shown = await publicSharePreview(db, { kind: "post", id: post.id });
  assert.equal(shown.description, "Author-selected safe preview");
  assert.ok(!JSON.stringify(shown).includes(marker));
  const search = await communitySearch(db, f.contact.token, {
    kind: "posts",
    q: marker
  });
  assert.equal(search.items[0].label, shown.description);
  await workspace(
    db,
    f.contact.token,
    m("save-item", { postId: post.id, expectedVersion: 0 })
  );
  const saved = await readPostWorkspace(db, f.contact.token, { view: "saved" });
  assert.ok("items" in saved);
  assert.ok(JSON.stringify(saved).includes(shown.description));
  assert.ok(!JSON.stringify(saved).includes(marker));
  const repost = await repostCommand(
    db,
    f.contact.token,
    m("repost", { sourceId: post.id, expectedSourceVersion: 1 })
  );
  assert.equal(
    (await publicSharePreview(db, { kind: "post", id: repost.id })).description,
    shown.description
  );
  await postCommand(db, f.memberA.token, {
    operation: "edit",
    postId: post.id,
    expectedVersion: 1,
    safeExcerpt: ""
  });
  assert.equal(
    (await publicSharePreview(db, { kind: "post", id: repost.id })).description,
    "Open this post when you’re ready to read more."
  );
  const privatePrayer = await create(f.memberA.token, {
    type: "PRAYER",
    audience: "CHURCH",
    audienceChurchId: f.churchA.id,
    content: "Private prayer body " + marker,
    contentNote: "Private note",
    safeExcerpt: "Private selected excerpt"
  });
  for (const token of [undefined, f.memberA.token, f.memberB.token]) {
    const preview = await publicSharePreview(
      db,
      { kind: "post", id: privatePrayer.id },
      token
    );
    assert.equal(preview.available, false);
    assert.ok(!JSON.stringify(preview).includes("Private"));
  }
  const publicPrayer = await create(f.memberA.token, {
    type: "PRAYER",
    content: "Public prayer body " + marker
  });
  assert.equal(
    (await publicSharePreview(db, { kind: "post", id: publicPrayer.id }))
      .description,
    "Read this public conversation on Godschurches."
  );
  await relationshipCommand(
    db,
    f.contact.token,
    m("block", {
      kind: "person",
      targetId: f.memberA.id,
      expectedVersion: 0,
      desired: true
    })
  );
  assert.equal(
    (
      await publicSharePreview(
        db,
        { kind: "post", id: post.id },
        f.contact.token
      )
    ).available,
    false
  );
  const blocked = await readPostWorkspace(db, f.contact.token, {
    view: "saved"
  });
  assert.ok(!JSON.stringify(blocked).includes("Sensitive experience"));
});

test("selected canonical note evidence is restricted to the actual reviewer, while owner export includes authored choices", async () => {
  const author = await createPortalActor(db, "noteevidence"),
    reviewer = await createPortalActor(db, "notereviewer"),
    outsider = await createPortalActor(db, "noteoutsider");
  await seedOperatorGrants(db, reviewer, ["REVIEW_COMMUNITY_REPORTS"]);
  const post = await create(author.token, {
    contentNote: "Review this exact note",
    safeExcerpt: "Review this exact excerpt"
  });
  const report = await db.communityReport.create({
    data: {
      reporterId: outsider.id,
      targetType: "POST",
      targetId: post.id,
      targetVersion: 1,
      reason: "PRIVACY",
      details: "Fictional selected source"
    }
  });
  const view = await readCommunityReports(db, reviewer.token, {
    view: "review",
    id: report.id
  });
  assert.ok(
    view.evidence &&
      "contentNote" in view.evidence &&
      "safeExcerpt" in view.evidence
  );
  assert.equal(view.evidence.contentNote, "Review this exact note");
  assert.equal(view.evidence.safeExcerpt, "Review this exact excerpt");
  await denied(
    readCommunityReports(db, outsider.token, { view: "review", id: report.id }),
    404
  );
  const secret = process.env.AUTH_RATE_LIMIT_SECRET!;
  const proof = await prepareAccountExport(
    db,
    author.token,
    author.password,
    secret
  );
  const exported = JSON.parse(
    await downloadAccountExport(db, author.token, proof.authorization, secret)
  );
  assert.equal(
    exported.posts.find((p: { id: string }) => p.id === post.id).contentNote,
    "Review this exact note"
  );
  await db.platformPost.update({
    where: { id: post.id },
    data: { moderationState: "HIDDEN", version: { increment: 1 } }
  });
  assert.equal(await getPost(db, outsider.token, post.id), null);
  assert.equal(
    (await publicSharePreview(db, { kind: "post", id: post.id })).available,
    false
  );
});

test("withdrawal clears unreported note text immediately and the last selected-report expiry clears retained note evidence", async () => {
  const author = await createPortalActor(db, "noteretain"),
    reporter = await createPortalActor(db, "notereport");
  for (const reported of [false, true]) {
    const post = await create(author.token, {
      contentNote: "Canonical sensitive note",
      safeExcerpt: "Canonical selected excerpt"
    });
    const report = reported
      ? await db.communityReport.create({
          data: {
            reporterId: reporter.id,
            targetType: "POST",
            targetId: post.id,
            targetVersion: 1,
            reason: "PRIVACY",
            details: "Fictional retention acceptance"
          }
        })
      : null;
    await postCommand(db, author.token, {
      operation: "withdraw",
      postId: post.id,
      expectedVersion: 1,
      confirmed: true
    });
    const withdrawn = await db.platformPost.findUniqueOrThrow({
      where: { id: post.id }
    });
    assert.equal(
      withdrawn.contentNote,
      reported ? "Canonical sensitive note" : null
    );
    assert.equal(
      withdrawn.safeExcerpt,
      reported ? "Canonical selected excerpt" : null
    );
    assert.equal(await getPost(db, author.token, post.id), null);
    if (report) {
      await db.retentionPurge.create({
        data: {
          target: "REPORT",
          targetId: report.id,
          policy: "GC-MSG-RETENTION-v1",
          version: 1
        }
      });
      await db.$transaction((tx) =>
        purgeMessagingCandidate(tx, {
          target: "REPORT",
          id: report.id,
          version: 1
        })
      );
      const erased = await db.platformPost.findUniqueOrThrow({
        where: { id: post.id }
      });
      assert.equal(erased.content, "");
      assert.equal(erased.contentNote, null);
      assert.equal(erased.safeExcerpt, null);
    }
  }
});

test("published controls require the pinned account, confirm one exact receipt, reject changed retries and recheck authority", async () => {
  const f = await seedPortal(db),
    post = await create(f.memberA.token, {
      contentNote: "Before",
      safeExcerpt: "Before excerpt"
    });
  const body = m("edit", {
    postId: post.id,
    expectedVersion: 1,
    contentNote: "After",
    safeExcerpt: "After excerpt",
    linkUrl: ""
  });
  const origin = process.env.ACCOUNT_ORIGIN!;
  const send = (
    token: string,
    owner?: string,
    input: Record<string, unknown> = body
  ) =>
    handlePostRequest(
      db,
      new Request(origin + "/api/platform/posts", {
        method: "POST",
        headers: {
          Origin: origin,
          Cookie: "church_platform_session=" + token,
          "Content-Type": "application/json",
          ...(owner ? { "X-Expected-Account": owner } : {})
        },
        body: JSON.stringify(input)
      })
    );
  assert.equal((await send(f.memberA.token)).status, 401);
  assert.equal((await send(f.memberA.token, f.memberB.id)).status, 401);
  assert.equal(
    (await db.platformPost.findUniqueOrThrow({ where: { id: post.id } }))
      .version,
    1
  );
  const responses = await Promise.all([
    send(f.memberA.token, f.memberA.id),
    send(f.memberA.token, f.memberA.id)
  ]);
  assert.deepEqual(
    responses.map((r) => r.status),
    [200, 200]
  );
  const receipts = await Promise.all(responses.map((r) => r.json()));
  assert.deepEqual(receipts[0], receipts[1]);
  assert.equal(
    await db.postAudit.count({ where: { postId: post.id, action: "edited" } }),
    1
  );
  assert.equal(
    (
      await send(f.memberA.token, f.memberA.id, {
        ...body,
        safeExcerpt: "Different retry"
      })
    ).status,
    409
  );
  assert.equal((await send(f.memberB.token, f.memberA.id)).status, 401);
  const current = await getPostAvailability(db, f.memberA.token, post.id);
  assert.deepEqual(current, {
    available: true,
    entryVersion: 2,
    sourceVersion: null
  });
  assert.ok(!JSON.stringify(current).includes("After"));
  const get = await handlePostRequest(
    db,
    new Request(origin + "/api/platform/posts?postId=" + post.id, {
      headers: {
        Cookie: "church_platform_session=" + f.memberA.token,
        "X-Expected-Account": f.memberB.id
      }
    })
  );
  assert.equal(get.status, 401);
  const remove = m("withdraw", {
    postId: post.id,
    expectedVersion: 2,
    confirmed: true
  });
  const removed = await postCommand(db, f.memberA.token, remove);
  assert.deepEqual(await postCommand(db, f.memberA.token, remove), removed);
  assert.deepEqual(await getPostAvailability(db, f.memberA.token, post.id), {
    available: false,
    entryVersion: null,
    sourceVersion: null
  });
  await denied(postCommand(db, f.memberA.token, body), 403);
  await db.churchCapabilityGrant.create({
    data: {
      userId: f.memberA.id,
      churchId: f.churchA.id,
      capability: "PUBLISH_CHURCH_POSTS"
    }
  });
  const churchPost = await create(f.memberA.token, {
    authorChurchId: f.churchA.id
  });
  const churchEdit = m("edit", {
    postId: churchPost.id,
    expectedVersion: 1,
    contentNote: "Church author note"
  });
  await postCommand(db, f.memberA.token, churchEdit);
  await db.churchCapabilityGrant.updateMany({
    where: { userId: f.memberA.id, capability: "PUBLISH_CHURCH_POSTS" },
    data: { revokedAt: new Date() }
  });
  await denied(postCommand(db, f.memberA.token, churchEdit), 403);
});

test("account erasure clears unreported notes while only selected canonical report evidence survives", async () => {
  const author = await createPortalActor(db, "noteerase"),
    reporter = await createPortalActor(db, "noteeraserpt");
  const unreported = await create(author.token, {
    contentNote: "Erase this note",
    safeExcerpt: "Erase this excerpt"
  });
  const selected = await create(author.token, {
    contentNote: "Selected note",
    safeExcerpt: "Selected excerpt"
  });
  await db.communityReport.create({
    data: {
      reporterId: reporter.id,
      targetType: "POST",
      targetId: selected.id,
      targetVersion: 1,
      reason: "PRIVACY"
    }
  });
  const journal = { async recordAccount() {}, async completeAccount() {} };
  await requestPermanentAccountDeletion(
    db,
    author.token,
    author.password,
    true,
    createSessionToken(),
    journal
  );
  const request = await db.accountDeletion.findUniqueOrThrow({
    where: { userId: author.id }
  });
  await eraseRequestedAccountData(db, request.id, journal);
  const cleared = await db.platformPost.findUniqueOrThrow({
    where: { id: unreported.id }
  });
  assert.equal(cleared.content, "");
  assert.equal(cleared.contentNote, null);
  assert.equal(cleared.safeExcerpt, null);
  const retained = await db.platformPost.findUniqueOrThrow({
    where: { id: selected.id }
  });
  assert.equal(retained.contentNote, "Selected note");
  assert.equal(retained.safeExcerpt, "Selected excerpt");
  assert.equal(await getPost(db, reporter.token, selected.id), null);
});
