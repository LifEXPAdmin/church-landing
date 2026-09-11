import test from "node:test";
import assert from "node:assert/strict";
import {
  DraftController,
  composerPayload,
  emptyComposer,
  type DraftTransport
} from "../lib/platform/draft-controller";
function fixture() {
  let owner = "owner-a",
    version = 0,
    payload = composerPayload(emptyComposer());
  const bodies: string[] = [],
    receipts = new Map<
      string,
      { version: number; id: string; postId?: string }
    >();
  let lost = false,
    conflict = false,
    posts = 0;
  const transport: DraftTransport = async (path, body) => {
    if (path === "/api/platform/profile")
      return { status: owner ? 200 : 401, data: { id: owner } };
    if (!body)
      return {
        status: 200,
        data: { draft: { id: "draft-1", version, payload } }
      };
    bodies.push(body);
    const command = JSON.parse(body);
    if (conflict)
      return { status: 409, data: { message: "Changed elsewhere" } };
    let receipt = receipts.get(body);
    if (!receipt) {
      version++;
      receipt = { id: command.id, version };
      if (command.operation === "save-draft") payload = command.payload;
      else {
        posts++;
        receipt.postId = "post-1";
      }
      receipts.set(body, receipt);
    }
    if (lost) {
      lost = false;
      throw Error("response lost after commit");
    }
    return { status: 200, data: receipt };
  };
  let id = 0;
  const controller = new DraftController(transport, () =>
    ++id === 1 ? "draft-1" : `key-${id}`
  );
  return {
    controller,
    bodies,
    receipts,
    get posts() {
      return posts;
    },
    setOwner: (v: string) => {
      owner = v;
    },
    lose: () => {
      lost = true;
    },
    conflict: (v: boolean) => {
      conflict = v;
    },
    replace: () => {
      version = 8;
      payload = { ...payload, content: "Other tab", replyAudience: null };
    }
  };
}
const settle = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};
test("autosave debounces five seconds, serializes and persists only supported fields", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const f = fixture(),
    c = f.controller;
  await c.verify();
  c.start();
  c.change({
    ...c.getSnapshot().fields,
    content: "First",
    replyAudience: "CHURCH_MEMBERS",
    linkReceipt: "ephemeral",
    keepLinkPreview: true
  });
  t.mock.timers.tick(4999);
  await settle();
  assert.equal(f.bodies.length, 0);
  c.change({ ...c.getSnapshot().fields, content: "Latest" });
  t.mock.timers.tick(4999);
  await settle();
  assert.equal(f.bodies.length, 0);
  t.mock.timers.tick(1);
  await settle();
  assert.equal(f.bodies.length, 1);
  const p = JSON.parse(f.bodies[0]).payload;
  assert.equal(p.content, "Latest");
  assert.equal(p.replyAudience, "CHURCH_MEMBERS");
  assert.ok(!("linkReceipt" in p));
  assert.ok(!("keepLinkPreview" in p));
  assert.equal(c.getSnapshot().dirty, false);
  t.mock.timers.tick(60000);
  await settle();
  assert.equal(f.bodies.length, 1);
  c.dispose();
});
test("uncertain save retries exact body before saving edits made after the failed request", async () => {
  const f = fixture(),
    c = f.controller;
  await c.verify();
  c.start();
  c.change({
    ...c.getSnapshot().fields,
    content: "Original",
    replyAudience: "CHURCH_MEMBERS"
  });
  f.lose();
  assert.equal(await c.save(), false);
  const original = f.bodies[0];
  c.change({
    ...c.getSnapshot().fields,
    content: "New unsent text",
    replyAudience: "VIEWERS"
  });
  await c.retry();
  assert.equal(f.bodies[1], original);
  assert.equal(c.getSnapshot().dirty, true);
  assert.equal(c.getSnapshot().fields.content, "New unsent text");
  await c.save();
  assert.equal(JSON.parse(f.bodies[2]).expectedVersion, 1);
  assert.equal(JSON.parse(f.bodies[2]).payload.replyAudience, "VIEWERS");
  c.dispose();
});
test("conflict review leaves unsent fields intact and explicit reload retains legacy null", async () => {
  const f = fixture(),
    c = f.controller;
  await c.verify();
  c.start();
  c.change({ ...c.getSnapshot().fields, content: "Mine" });
  f.conflict(true);
  await c.save();
  assert.equal(c.getSnapshot().conflict, true);
  f.replace();
  await c.loadLatest();
  assert.equal(c.getSnapshot().fields.content, "Mine");
  c.useLatest();
  assert.equal(c.getSnapshot().version, 8);
  assert.equal(c.getSnapshot().fields.replyAudience, null);
  assert.equal(await c.publish(), false);
  assert.equal(f.posts, 0);
  c.dispose();
});
test("save as new preserves unsent snapshot, uses a new id and version zero", async () => {
  const f = fixture(),
    c = f.controller;
  await c.verify();
  c.start();
  c.change({
    ...c.getSnapshot().fields,
    content: "Keep mine",
    replyAudience: "CHURCH_MEMBERS"
  });
  f.conflict(true);
  await c.save();
  f.conflict(false);
  c.saveAsNew();
  await settle();
  const body = JSON.parse(f.bodies.at(-1)!);
  assert.notEqual(body.id, "draft-1");
  assert.equal(body.expectedVersion, 0);
  assert.equal(body.payload.content, "Keep mine");
  assert.equal(body.payload.replyAudience, "CHURCH_MEMBERS");
  c.dispose();
});
test("publication flushes draft, cannot double submit and freezes uncertain publication until exact retry", async () => {
  const f = fixture(),
    c = f.controller;
  await c.verify();
  c.start();
  c.change({ ...c.getSnapshot().fields, content: "Publish me" });
  await c.save();
  f.lose();
  const result = await Promise.all([c.publish(), c.publish()]);
  assert.deepEqual(result, [false, false]);
  assert.equal(c.getSnapshot().publishing, true);
  const before = c.getSnapshot().fields;
  c.change({ ...before, content: "Must not replace uncertain publication" });
  assert.equal(c.getSnapshot().fields, before);
  const body = f.bodies.at(-1);
  await c.retry();
  assert.equal(f.bodies.at(-1), body);
  assert.equal(f.posts, 1);
  assert.equal(c.getSnapshot().postId, "post-1");
  c.dispose();
});
test("account switching clears old drafts and pending requests before any new-account mutation", async () => {
  const f = fixture(),
    c = f.controller;
  await c.verify();
  c.start();
  c.change({ ...c.getSnapshot().fields, content: "Private A" });
  f.lose();
  await c.save();
  f.setOwner("owner-b");
  await c.retry();
  assert.equal(f.bodies.length, 1);
  assert.equal(c.getSnapshot().ownerId, "owner-b");
  assert.equal(c.getSnapshot().fields.content, "");
  assert.equal(c.getSnapshot().retry, false);
  f.setOwner("");
  await c.verify();
  assert.equal(c.getSnapshot().ownerId, null);
  assert.equal(c.getSnapshot().hidden, true);
  c.dispose();
});
