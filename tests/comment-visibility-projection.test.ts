import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { assertPortalTestDatabase, createPortalActor } from "./seed-portal";
import { topicCommand, readTopic } from "../lib/platform/topic-communities";
import { postCommand } from "../lib/platform/post-commands";
import { commentCommand } from "../lib/platform/comment-commands";
import { readComments } from "../lib/platform/comment-reads";
import { PortalError } from "../lib/platform/portal-policy";

const db = new PrismaClient();
before(() => assertPortalTestDatabase(db));
after(() => db.$disconnect());
const command = (operation: string, fields: Record<string, unknown>) => ({
  operation,
  mutationId: randomUUID(),
  ...fields
});

test("restricted Topic root stays neutral while its eligible child remains readable", async (t) => {
  const owner = await createPortalActor(db, "rootowner");
  const member = await createPortalActor(db, "rootmember");
  const slug = "projection-" + randomUUID();
  const topic = await topicCommand(
    db,
    owner.token,
    command("create", {
      name: "Fictional projection topic " + randomUUID(),
      slug,
      description: "Isolated comment visibility fixture.",
      rules: "Keep fictional discussion respectful.",
      acceptedRules: true
    })
  );
  const state = await readTopic(db, member.token, slug);
  await topicCommand(
    db,
    member.token,
    command("join", {
      communityId: topic.id,
      desired: true,
      acceptedRules: true,
      rulesVersion: state.community.rulesVersion,
      expectedVersion: state.viewer.version
    })
  );
  const post = await postCommand(db, owner.token, {
    operation: "create",
    requestKey: randomUUID(),
    topicCommunityId: topic.id,
    content: "Fictional visible discussion",
    allowReposts: true
  });
  const marker = "Fictional restricted root content " + randomUUID();
  const root = await commentCommand(
    db,
    member.token,
    command("create", { postId: post.id, content: marker })
  );
  const child = await commentCommand(
    db,
    owner.token,
    command("create", {
      postId: post.id,
      replyToId: root.id,
      content: "Fictional eligible reply"
    })
  );
  const initial = await readComments(db, undefined, { postId: post.id });
  assert.equal(initial.kind, "thread");
  if (initial.kind !== "thread") throw new Error("Expected thread");
  assert.equal(initial.items[0].content, marker);
  assert.equal(initial.visibleCount, 2);
  const membership = await db.topicMembership.findUniqueOrThrow({
    where: { communityId_userId: { communityId: topic.id, userId: member.id } }
  });
  await topicCommand(
    db,
    owner.token,
    command("restrict", {
      communityId: topic.id,
      targetId: member.id,
      expectedVersion: membership.version,
      desired: true,
      reason: "RULES"
    })
  );
  for (const [label, token] of [
    ["guest", undefined],
    ["owner", owner.token]
  ] as const) {
    for (const view of ["roots", "replies", "context"] as const) {
      await t.test(`${label} ${view}`, async () => {
        const result = await readComments(db, token, {
          postId: post.id,
          view,
          ...(view === "replies" ? { rootId: root.id } : {}),
          ...(view === "context" ? { commentId: child.id } : {})
        });
        assert.equal(result.kind, "thread");
        if (result.kind !== "thread") throw new Error("Expected thread");
        assert.equal(result.visibleCount, 1);
        const projectedRoot = view === "roots" ? result.items[0] : result.root;
        assert.ok(projectedRoot);
        assert.equal(projectedRoot?.id, root.id);
        assert.equal(projectedRoot?.unavailable, true);
        assert.equal(projectedRoot.content, null);
        assert.equal(projectedRoot.author, null);
        assert.equal(projectedRoot.version, null);
        assert.equal(projectedRoot.editedAt, null);
        assert.equal(projectedRoot.likeCount, null);
        assert.equal(projectedRoot.prayerUpdateKind, null);
        assert.deepEqual(projectedRoot.mentions, []);
        assert.equal(projectedRoot.canReply, false);
        assert.equal(projectedRoot.canEdit, false);
        assert.equal(projectedRoot.canDelete, false);
        assert.equal(projectedRoot.replyCount, 1);
        if (view !== "roots") {
          const reply = result.items.find((row) => row.id === child.id);
          assert.equal(reply?.unavailable, false);
          assert.equal(reply?.replyTo?.name, null);
          if (view === "context") assert.equal(result.target?.id, child.id);
        }
        const wire = JSON.stringify(result);
        assert.ok(!wire.includes(marker));
        assert.ok(!wire.includes(member.name));
        assert.ok(!wire.includes(member.username));
      });
    }
    await assert.rejects(
      readComments(db, token, {
        postId: post.id,
        view: "context",
        commentId: root.id
      }),
      (error: unknown) => error instanceof PortalError && error.status === 404
    );
  }
});
