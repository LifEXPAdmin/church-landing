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

test("resume protects dirty entries, keeps legacy unresolved permission and stored version", async () => {
  const f = fixture(),
    c = f.controller;
  await c.verify();
  c.start();
  c.change({
    ...c.getSnapshot().fields,
    content: "Unsent",
    linkReceipt: "old-preview"
  });
  f.replace();
  await c.resume("draft-1");
  assert.equal(c.getSnapshot().resumeId, "draft-1");
  assert.equal(c.getSnapshot().fields.content, "Unsent");
  c.cancelResume();
  assert.equal(c.getSnapshot().fields.content, "Unsent");
  await c.resume("draft-1", true);
  assert.equal(c.getSnapshot().version, 8);
  assert.equal(c.getSnapshot().fields.content, "Other tab");
  assert.equal(c.getSnapshot().fields.replyAudience, null);
  assert.equal(c.getSnapshot().fields.linkReceipt, undefined);
  assert.equal(await c.publish(), false);
  c.dispose();
});

test("resumed publication saves an explicit legacy choice then retries the same publish once", async () => {
  const f = fixture(),
    c = f.controller;
  await c.verify();
  c.start();
  f.replace();
  await c.resume("draft-1");
  c.change({ ...c.getSnapshot().fields, replyAudience: "CHURCH_MEMBERS" });
  await c.save();
  assert.equal(JSON.parse(f.bodies[0]).expectedVersion, 8);
  f.lose();
  await c.publish();
  const body = f.bodies.at(-1);
  assert.equal(JSON.parse(body!).expectedVersion, 9);
  await c.retry();
  assert.equal(f.bodies.at(-1), body);
  assert.equal(f.posts, 1);
  assert.equal(c.getSnapshot().fields.replyAudience, "CHURCH_MEMBERS");
  c.dispose();
});

test("independent social work aggregates into update protection without changing post fields", () => {
  const c = new DraftController(async () => ({ status: 401, data: {} }));
  const before = c.getSnapshot().fields;
  c.setExternalWork("comment", { dirty: true, saving: false, conflict: false });
  c.setExternalWork("edit", { dirty: false, saving: true, conflict: true });
  assert.deepEqual(c.getSnapshot().externalWork, {
    dirty: true,
    saving: true,
    conflict: true
  });
  c.setExternalWork("comment", null);
  assert.deepEqual(c.getSnapshot().externalWork, {
    dirty: false,
    saving: true,
    conflict: true
  });
  c.setExternalWork("edit", null);
  assert.deepEqual(c.getSnapshot().externalWork, {
    dirty: false,
    saving: false,
    conflict: false
  });
  assert.equal(c.getSnapshot().fields, before);
  c.dispose();
});

test("saved photo references survive the composer whitelist, immutable retry body and resume without altering reply permissions", async () => {
  const f = fixture(),
    c = f.controller;
  await c.verify();
  c.start();
  const photos = [
    { id: "saved-photo-1", version: 3 },
    { id: "saved-photo-2", version: 8 }
  ];
  const fields = {
    ...c.getSnapshot().fields,
    content: "Photo draft",
    replyAudience: "CHURCH_MEMBERS" as const,
    audienceChurchId: "church-1",
    photos
  };
  const payload = composerPayload(fields);
  photos[0].version = 99;
  assert.equal(payload.photos![0].version, 3, "Snapshot references are copied");
  c.change({ ...fields, photos: payload.photos });
  f.lose();
  await c.save();
  const body = f.bodies.at(-1)!;
  assert.deepEqual(JSON.parse(body).payload.photos, payload.photos);
  await c.retry();
  assert.equal(f.bodies.at(-1), body);
  await c.resume("draft-1");
  assert.deepEqual(c.getSnapshot().fields.photos, payload.photos);
  assert.equal(c.getSnapshot().fields.replyAudience, "CHURCH_MEMBERS");
  assert.ok(
    !("photos" in composerPayload(emptyComposer())),
    "Older empty snapshots remain unchanged"
  );
  c.dispose();
});

test("a route verification overlapping resume cannot silently abandon the selected photo draft", async () => {
  let pause = false,
    release!: () => void,
    entered!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const delayed = new Promise<void>((resolve) => {
    release = resolve;
  });
  const payload = {
    ...emptyComposer("church-a"),
    content: "Saved photo draft",
    replyAudience: "CHURCH_MEMBERS" as const,
    photos: [{ id: "saved-photo", version: 2 }]
  };
  const c = new DraftController(async (path) => {
    if (path === "/api/platform/profile") {
      if (pause) {
        pause = false;
        entered();
        await delayed;
      }
      return { status: 200, data: { id: "owner-a" } };
    }
    return {
      status: 200,
      data: { draft: { id: "selected-photo-draft", version: 1, payload } }
    };
  });
  await c.verify();
  pause = true;
  const resumed = c.resume("selected-photo-draft");
  await started;
  c.conceal();
  await c.verify();
  release();
  await resumed;
  assert.equal(c.getSnapshot().id, "selected-photo-draft");
  assert.deepEqual(c.getSnapshot().fields.photos, payload.photos);
  assert.equal(c.getSnapshot().fields.replyAudience, "CHURCH_MEMBERS");
  assert.equal(c.getSnapshot().dirty, false);
  c.dispose();
});

test("discard restores the acknowledged audience, source references and version without touching other work", async () => {
  const f = fixture(),
    c = f.controller;
  await c.verify();
  c.start();
  c.change({
    ...c.getSnapshot().fields,
    content: "Saved member text",
    replyAudience: "CHURCH_MEMBERS",
    photos: [{ id: "photo", version: 4 }]
  });
  await c.save();
  const saved = c.getSnapshot(),
    count = f.bodies.length;
  c.change({
    ...saved.fields,
    content: "Unsent",
    replyAudience: "VIEWERS",
    photos: []
  });
  c.setExternalWork("reply", { dirty: true, saving: false, conflict: false });
  assert.equal(c.discardChanges(), false);
  c.setExternalWork("reply", null);
  assert.equal(c.discardChanges(), true);
  assert.deepEqual(c.getSnapshot().fields, saved.fields);
  assert.equal(c.getSnapshot().id, saved.id);
  assert.equal(c.getSnapshot().version, saved.version);
  assert.equal(f.bodies.length, count);
  f.replace();
  await c.resume("draft-1");
  c.change({ ...c.getSnapshot().fields, replyAudience: "VIEWERS" });
  assert.equal(c.discardChanges(), true);
  assert.equal(c.getSnapshot().fields.replyAudience, null);
  c.dispose();
});

test("discard cannot abandon an uncertain mutation and discards a conflicting copy without overwriting its saved version", async () => {
  const f = fixture(),
    c = f.controller;
  await c.verify();
  c.start();
  c.change({ ...c.getSnapshot().fields, content: "Keep unknown response" });
  f.lose();
  await c.save();
  assert.equal(c.discardChanges(), false);
  await c.retry();
  assert.equal(f.bodies[0], f.bodies[1]);
  c.change({ ...c.getSnapshot().fields, content: "Keep conflict" });
  f.conflict(true);
  await c.save();
  const previousId = c.getSnapshot().id,
    writes = f.bodies.length;
  assert.equal(c.discardChanges(), true);
  assert.equal(c.getSnapshot().fields.content, "");
  assert.notEqual(c.getSnapshot().id, previousId);
  assert.equal(c.getSnapshot().version, 0);
  assert.equal(f.bodies.length, writes);
  c.dispose();
});

test("starting another post after publication retains independent unsent-work guards", async () => {
  const f = fixture(),
    c = f.controller;
  await c.verify();
  c.start();
  c.change({ ...c.getSnapshot().fields, content: "Published post" });
  await c.publish();
  c.setExternalWork("comment", { dirty: true, saving: false, conflict: false });
  c.newDraft();
  assert.equal(c.getSnapshot().fields.content, "");
  assert.equal(c.getSnapshot().externalWork.dirty, true);
  c.setExternalWork("comment", null);
  assert.equal(c.getSnapshot().externalWork.dirty, false);
  c.dispose();
});

test("quote source survives controller lost-response retry, conflict, resume and publication without changing reply permission", async () => {
  for (const mode of ["VIEWERS", "CHURCH_MEMBERS"] as const) {
    const f = fixture(),
      c = f.controller;
    await c.verify();
    c.start();
    c.change({
      ...c.getSnapshot().fields,
      content: "Quote thoughts",
      quoteSourceId: "source-original",
      replyAudience: mode
    });
    f.lose();
    await c.save();
    assert.equal(c.getSnapshot().retry, true);
    await c.retry();
    assert.equal(f.bodies[0], f.bodies[1]);
    await c.resume("draft-1");
    assert.equal(c.getSnapshot().fields.quoteSourceId, "source-original");
    assert.equal(c.getSnapshot().fields.replyAudience, mode);
    f.conflict(true);
    c.change({ ...c.getSnapshot().fields, content: "Unsent quote changes" });
    await c.save();
    assert.equal(c.getSnapshot().conflict, true);
    assert.equal(c.getSnapshot().fields.quoteSourceId, "source-original");
    f.conflict(false);
    await c.loadLatest();
    c.useLatest();
    assert.equal(c.getSnapshot().fields.quoteSourceId, "source-original");
    await c.publish();
    assert.equal(f.posts, 1);
    c.dispose();
  }
});
