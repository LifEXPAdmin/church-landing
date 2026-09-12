import test from "node:test";
import assert from "node:assert/strict";
import {
  CommentDraftController,
  type CommentTransport
} from "../lib/platform/comment-draft-controller";
import { SocialClientError } from "../lib/platform/social-client";
const fields = (content: string) => ({
  content,
  mentionIds: ["person"],
  authorChurchId: "church"
});
function fixture(
  handler: (body: string) => Promise<unknown>,
  items: unknown[] = []
) {
  let id = 0;
  const transport: CommentTransport = async <T>(_path: string, body?: string) =>
    (body ? await handler(body) : { items }) as T;
  return new CommentDraftController(
    transport,
    "post",
    "reply",
    () => `uuid-${++id}`
  );
}
test("saved target restores exact text, mention IDs and church identity", async () => {
  const c = fixture(
    async () => ({}),
    [
      {
        id: "draft",
        version: 3,
        postId: "post",
        replyToId: "reply",
        ...fields(" saved \r\n ")
      }
    ]
  );
  await c.start();
  assert.deepEqual(c.getSnapshot().fields, fields(" saved \r\n "));
  assert.equal(c.getSnapshot().version, 3);
  c.dispose();
});
test("lost save retries exact bytes while preserving newer changes, then publishes latest acknowledged snapshot", async () => {
  const bodies: string[] = [];
  let lose = true;
  const c = fixture(async (body) => {
    bodies.push(body);
    if (lose) {
      lose = false;
      throw Error("lost");
    }
    const p = JSON.parse(body);
    return {
      id: p.operation === "create" ? "comment" : "draft",
      version: p.expectedVersion + 1 || 1,
      message: "ok"
    };
  });
  await c.start();
  c.change(fields("first"));
  await c.save();
  c.change(fields("second"));
  await c.retry();
  assert.equal(bodies[0], bodies[1]);
  assert.equal(c.getSnapshot().dirty, true);
  assert.equal(c.getSnapshot().fields.content, "second");
  assert.equal(await c.send(), true);
  const saved = JSON.parse(bodies[2]),
    sent = JSON.parse(bodies[3]);
  assert.equal(saved.content, sent.content);
  assert.deepEqual(sent.mentionIds, ["person"]);
  assert.equal(sent.authorChurchId, "church");
  assert.equal(sent.replyToId, "reply");
  assert.equal(sent.draftVersion, 2);
  c.dispose();
});
test("lost publication freezes fields and retries one stable receipt", async () => {
  const bodies: string[] = [];
  let lose = true;
  const c = fixture(async (body) => {
    bodies.push(body);
    const p = JSON.parse(body);
    if (p.operation === "create" && lose) {
      lose = false;
      throw Error("lost");
    }
    return { id: "receipt", version: 1, message: "ok" };
  });
  await c.start();
  c.change(fields("publish this"));
  assert.equal(await c.send(), false);
  c.change(fields("must not replace"));
  assert.equal(c.getSnapshot().fields.content, "publish this");
  assert.equal(await c.send(), false);
  await c.retry();
  assert.equal(bodies[1], bodies[2]);
  assert.equal(c.getSnapshot().createdId, "receipt");
  c.dispose();
});
test("conflict keeps unsent text and requires explicit replacement", async () => {
  const latest = {
    id: "draft",
    version: 4,
    postId: "post",
    replyToId: "reply",
    ...fields("other tab")
  };
  const c = fixture(async () => {
    throw new SocialClientError(409, "Changed");
  }, [latest]);
  await c.start();
  c.change(fields("my text"));
  await c.save();
  assert.equal(c.getSnapshot().conflict, true);
  await c.review();
  assert.equal(c.getSnapshot().fields.content, "my text");
  c.useLatest();
  assert.equal(c.getSnapshot().fields.content, "other tab");
  assert.equal(c.getSnapshot().version, 4);
  c.dispose();
});
test("revoked access does not publish, consume a draft, or loop retries", async () => {
  let creates = 0;
  const c = fixture(async (body) => {
    if (JSON.parse(body).operation === "create") {
      creates++;
      throw new SocialClientError(403, "Access revoked");
    }
    return { id: "draft", version: 1, message: "saved" };
  });
  await c.start();
  c.change(fields("keep this"));
  await c.send();
  assert.equal(creates, 1);
  assert.equal(c.getSnapshot().createdId, null);
  assert.equal(c.getSnapshot().retry, false);
  assert.equal(c.getSnapshot().fields.content, "keep this");
  c.dispose();
});
test("double send serializes one save and one create", async () => {
  const operations: string[] = [];
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const c = fixture(async (body) => {
    operations.push(JSON.parse(body).operation);
    await gate;
    return { id: "id", version: 1, message: "ok" };
  });
  await c.start();
  c.change(fields("hello"));
  const one = c.send();
  const two = c.send();
  release();
  await Promise.all([one, two]);
  assert.deepEqual(operations, ["draft-save", "create"]);
  c.dispose();
});

test("a consumed or discarded explicit resume ID cannot restore a different target draft", async () => {
  const c = new CommentDraftController(
    async <T>() => ({ items: [] }) as T,
    "post",
    null,
    () => "fresh-id",
    "discarded-id"
  );
  await c.start();
  assert.equal(c.getSnapshot().ready, false);
  assert.match(c.getSnapshot().message, /cannot be restored/);
  c.dispose();
});

test("autosave waits five idle seconds and restarts after new edits", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const bodies: string[] = [];
  const c = fixture(async (body) => {
    bodies.push(body);
    return { id: "draft", version: 1, message: "ok" };
  });
  await c.start();
  c.change(fields("first"));
  t.mock.timers.tick(4999);
  assert.equal(bodies.length, 0);
  c.change(fields("second"));
  t.mock.timers.tick(4999);
  assert.equal(bodies.length, 0);
  t.mock.timers.tick(1);
  await Promise.resolve();
  assert.equal(bodies.length, 1);
  assert.equal(JSON.parse(bodies[0]).content, "second");
  c.dispose();
});

test("discard keeps the exact saved reply target, identity, mentions and version without a write", async () => {
  const bodies: string[] = [];
  const c = fixture(
    async (body) => {
      bodies.push(body);
      return {};
    },
    [
      {
        id: "kept",
        version: 7,
        postId: "post",
        replyToId: "reply",
        ...fields("saved reply")
      }
    ]
  );
  await c.start();
  c.change({ content: "unsent", authorChurchId: null, mentionIds: [] });
  assert.equal(c.discardChanges(), true);
  assert.deepEqual(c.getSnapshot().fields, fields("saved reply"));
  assert.equal(c.getSnapshot().id, "kept");
  assert.equal(c.getSnapshot().version, 7);
  assert.deepEqual(bodies, []);
  c.dispose();
});

test("discard cannot clear an uncertain comment request; a rejected conflicting copy may be discarded without a write", async () => {
  let mode = "lost";
  const c = fixture(async () => {
    if (mode === "lost") throw Error("lost");
    throw new SocialClientError(409, "Changed elsewhere");
  });
  await c.start();
  c.change(fields("keep my words"));
  await c.save();
  assert.equal(c.discardChanges(), false);
  mode = "conflict";
  await c.retry();
  assert.equal(c.discardChanges(), true);
  assert.equal(c.getSnapshot().fields.content, "");
  assert.equal(c.getSnapshot().ready, false);
  assert.equal(c.getSnapshot().version, 0);
  c.dispose();
});
