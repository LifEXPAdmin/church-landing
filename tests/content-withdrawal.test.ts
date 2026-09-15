import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { assertPortalTestDatabase, createPortalActor } from "./seed-portal";
import { postCommand } from "../lib/platform/post-commands";
import { commentCommand } from "../lib/platform/comment-commands";
import { getPost } from "../lib/platform/post-reads";
import {
  protectReportedWithdrawal,
  replayRetentionControls,
  type RetentionControlEntry
} from "../lib/platform/retention-controls";
import { purgeMessagingCandidate } from "../lib/platform/messaging-retention";
const db = new PrismaClient();
before(() => assertPortalTestDatabase(db));
after(() => db.$disconnect());
async function fixture(type: "POST" | "COMMENT") {
  const author = await createPortalActor(db, "withdrawauthor"),
    reporter = await createPortalActor(db, "withdrawreporter");
  const post = await db.platformPost.create({
    data: {
      authorId: author.id,
      content: "Selected post evidence " + randomUUID(),
      discoveryCountry: "US",
      discoveryLanguage: "en",
      discoveryDenomination: "withdrawn-tradition"
    }
  });
  const comment =
    type === "COMMENT"
      ? await db.platformPostComment.create({
          data: {
            postId: post.id,
            authorId: author.id,
            content: "Selected comment evidence " + randomUUID()
          }
        })
      : null;
  const source = comment ?? post;
  const report = await db.communityReport.create({
    data: {
      reporterId: reporter.id,
      targetType: type,
      targetId: source.id,
      targetVersion: 1,
      reason: "PRIVACY",
      details: "Fictional selected report"
    }
  });
  return { author, reporter, post, comment, source, report };
}
async function purge(id: string) {
  await db.retentionPurge.create({
    data: {
      target: "REPORT",
      targetId: id,
      policy: "GC-MSG-RETENTION-v1",
      version: 1
    }
  });
  await db.$transaction((tx) =>
    purgeMessagingCandidate(tx, { target: "REPORT", id, version: 1 })
  );
  await db.retentionPurge.update({
    where: { target_targetId: { target: "REPORT", targetId: id } },
    data: { completedAt: new Date() }
  });
}
test("reported post withdrawal retains only selected canonical evidence, protects recovery and never republishes an older backup", async () => {
  const f = await fixture("POST");
  await postCommand(db, f.author.token, {
    operation: "withdraw",
    postId: f.post.id,
    expectedVersion: 1,
    confirmed: true
  });
  const saved = await db.platformPost.findUniqueOrThrow({
    where: { id: f.post.id }
  });
  assert.equal(saved.content, f.post.content);
  assert.equal(saved.status, "WITHDRAWN");
  assert.equal(saved.discoveryCountry, null);
  assert.equal(saved.discoveryLanguage, null);
  assert.equal(saved.discoveryDenomination, null);
  assert.equal(await getPost(db, f.author.token, f.post.id), null);
  const entry = await db.retentionControl.findFirstOrThrow({
    where: { kind: "AUTHOR_WITHDRAW_POST", sourceId: f.post.id }
  });
  assert.equal(
    (entry.payload as RetentionControlEntry).operatorId,
    f.author.id
  );
  assert.ok(!JSON.stringify(entry.payload).includes(f.post.content));
  assert.equal(
    await protectReportedWithdrawal(db, "POST", f.post.id, {
      record: async () => {
        throw Error("fixture provider unavailable");
      }
    }),
    false
  );
  assert.equal(
    (await db.retentionControl.findUniqueOrThrow({ where: { id: entry.id } }))
      .journaledAt,
    null
  );
  let writes = 0;
  assert.equal(
    await protectReportedWithdrawal(db, "POST", f.post.id, {
      record: async () => {
        writes++;
      }
    }),
    true
  );
  assert.equal(
    await protectReportedWithdrawal(db, "POST", f.post.id, {
      record: async () => {
        writes++;
      }
    }),
    true
  );
  assert.equal(writes, 1);
  try {
    await db.platformPost.update({
      where: { id: f.post.id },
      data: {
        status: "PUBLISHED",
        withdrawnAt: null,
        discussionClosed: false,
        discoveryCountry: "US",
        version: saved.version + 5
      }
    });
    await replayRetentionControls(db, [entry.payload as RetentionControlEntry]);
    const restored = await db.platformPost.findUniqueOrThrow({
      where: { id: f.post.id }
    });
    assert.equal(restored.status, "WITHDRAWN");
    assert.equal(restored.discussionClosed, true);
    assert.equal(restored.discoveryCountry, null);
    assert.equal(restored.version, saved.version + 5);
    assert.equal(await getPost(db, null, f.post.id), null);
  } finally {
    await db.platformPost.update({
      where: { id: saved.id },
      data: {
        status: saved.status,
        withdrawnAt: saved.withdrawnAt,
        discussionClosed: saved.discussionClosed,
        version: saved.version
      }
    });
  }
  await purge(f.report.id);
  assert.equal(
    (await db.platformPost.findUniqueOrThrow({ where: { id: f.post.id } }))
      .content,
    ""
  );
  const plain = await db.platformPost.create({
    data: { authorId: f.author.id, content: "Unreported text" }
  });
  await postCommand(db, f.author.token, {
    operation: "withdraw",
    postId: plain.id,
    expectedVersion: 1,
    confirmed: true
  });
  assert.equal(
    (await db.platformPost.findUniqueOrThrow({ where: { id: plain.id } }))
      .content,
    ""
  );
  assert.equal(
    await db.retentionControl.count({ where: { sourceId: plain.id } }),
    0
  );
});
test("comment deletion retries once, survives restoration and clears evidence only after its last report expires", async () => {
  const f = await fixture("COMMENT");
  const second = await db.communityReport.create({
    data: {
      reporterId: f.author.id,
      targetType: "COMMENT",
      targetId: f.comment!.id,
      targetVersion: 1,
      reason: "OTHER",
      details: "Another selected report"
    }
  });
  const input = {
    operation: "delete",
    mutationId: randomUUID(),
    postId: f.post.id,
    commentId: f.comment!.id,
    expectedVersion: 1
  };
  const result = await commentCommand(db, f.author.token, input);
  assert.deepEqual(await commentCommand(db, f.author.token, input), result);
  const saved = await db.platformPostComment.findUniqueOrThrow({
    where: { id: f.comment!.id }
  });
  assert.equal(saved.content, f.comment!.content);
  assert.ok(saved.deletedAt);
  const entries = await db.retentionControl.findMany({
    where: { kind: "AUTHOR_WITHDRAW_COMMENT", sourceId: f.comment!.id }
  });
  assert.equal(entries.length, 1);
  try {
    await db.platformPostComment.update({
      where: { id: saved.id },
      data: { deletedAt: null, version: saved.version + 3 }
    });
    await replayRetentionControls(db, [
      entries[0].payload as RetentionControlEntry
    ]);
    assert.ok(
      (
        await db.platformPostComment.findUniqueOrThrow({
          where: { id: saved.id }
        })
      ).deletedAt
    );
  } finally {
    await db.platformPostComment.update({
      where: { id: saved.id },
      data: { deletedAt: saved.deletedAt, version: saved.version }
    });
  }
  await purge(f.report.id);
  assert.equal(
    (
      await db.platformPostComment.findUniqueOrThrow({
        where: { id: saved.id }
      })
    ).content,
    saved.content
  );
  await purge(second.id);
  assert.equal(
    (
      await db.platformPostComment.findUniqueOrThrow({
        where: { id: saved.id }
      })
    ).content,
    ""
  );
  const plain = await db.platformPostComment.create({
    data: {
      postId: f.post.id,
      authorId: f.author.id,
      content: "Unreported comment"
    }
  });
  await commentCommand(db, f.author.token, {
    ...input,
    mutationId: randomUUID(),
    commentId: plain.id
  });
  assert.equal(
    (
      await db.platformPostComment.findUniqueOrThrow({
        where: { id: plain.id }
      })
    ).content,
    ""
  );
});
