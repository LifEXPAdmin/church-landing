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
  items: unknown[] = [],
  retainUncertain = false
) {
  let id = 0;
  const transport: CommentTransport = async <T>(_path: string, body?: string) =>
    (body ? await handler(body) : { items }) as T;
  return new CommentDraftController(
    transport,
    "post",
    "reply",
    () => `00000000-0000-4000-8000-${String(++id).padStart(12, "0")}` as const,
    undefined,
    retainUncertain
  );
}
test("late hydration uses the empty server state after a private comment draft loads", async () => {
  const c = fixture(
    async () => ({}),
    [
      {
        id: "draft",
        version: 3,
        postId: "post",
        replyToId: "reply",
        ...fields("Private saved comment")
      }
    ]
  );
  const server = c.getServerSnapshot();
  const original = structuredClone(server);
  try {
    await c.start();
    assert.equal(c.getSnapshot().fields.content, "Private saved comment");
    c.change(fields("Private edited comment"));
    c.visibility(true);
    assert.equal(c.getSnapshot().fields.content, "Private edited comment");
    assert.equal(c.getSnapshot().dirty, true);
    assert.equal(c.getServerSnapshot(), server);
    assert.deepEqual(server, original);
    assert.equal(server.ready, false);
    assert.equal(server.fields.content, "");
  } finally {
    c.dispose();
  }
});
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
    () => "00000000-0000-4000-8000-000000000999",
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

const savedPrivateDraft = (content = "Saved private reply") => ({
  id: "private-draft",
  version: 7,
  postId: "post",
  replyToId: "reply",
  ...fields(content)
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test("private concealed save retains exact original bytes through 503, edits and 429", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const bodies: string[] = [],
    original = {
      content: "Original private reply\r\n  with exact spaces  ",
      mentionIds: ["first-person", "second-person"],
      authorChurchId: "original-church"
    },
    newer = {
      content: "Newer unsaved words",
      mentionIds: ["different-person"],
      authorChurchId: null
    };
  const c = fixture(
    async (body) => {
      bodies.push(body);
      if (bodies.length === 1)
        throw new SocialClientError(503, "Response lost");
      if (bodies.length === 2) throw new SocialClientError(429, "Wait", 60);
      return { id: "private-draft", version: 8, message: "saved" };
    },
    [savedPrivateDraft()],
    true
  );
  try {
    await c.start();
    c.change(original);
    assert.equal(await c.save(), false);
    assert.deepEqual(JSON.parse(bodies[0]), {
      operation: "draft-save",
      mutationId: "00000000-0000-4000-8000-000000000001",
      postId: "post",
      replyToId: "reply",
      ...original,
      draftId: "private-draft",
      expectedVersion: 7
    });
    c.change(newer);
    c.visibility(true);
    c.change(fields("A concealed edit must be ignored"));
    assert.equal(await c.save(), false);
    assert.equal(await c.retry(), false);
    assert.equal(await c.send(), false);
    assert.equal(bodies.length, 1);
    assert.equal(await c.retryOriginal(), false);
    assert.equal(c.getSnapshot().retry, true);
    assert.equal(c.getSnapshot().version, 7);
    assert.equal(c.discardChanges(), false);
    t.mock.timers.tick(60000);
    await Promise.resolve();
    assert.equal(
      bodies.length,
      2,
      "Cooldown and concealment cannot retry automatically"
    );
    assert.equal(await c.retryOriginal(), true);
    assert.deepEqual(bodies, [bodies[0], bodies[0], bodies[0]]);
    assert.deepEqual(c.getSnapshot().fields, newer);
    assert.equal(c.getSnapshot().dirty, true);
    assert.equal(c.getSnapshot().hidden, true);
    assert.equal(c.getSnapshot().version, 8);
    assert.equal(c.getSnapshot().retry, false);
    assert.equal(await c.retryOriginal(), false);
    assert.equal(
      bodies.length,
      3,
      "Original recovery cannot create a new save for newer edits"
    );
  } finally {
    c.dispose();
  }
});

test("private hidden controls and original recovery with no pending request never send", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const bodies: string[] = [];
  const c = fixture(
    async (body) => {
      bodies.push(body);
      return { id: "private-draft", version: 8, message: "saved" };
    },
    [savedPrivateDraft()],
    true
  );
  try {
    assert.equal(await c.retryOriginal(), false);
    await c.start();
    assert.equal(await c.retryOriginal(), false);
    c.visibility(true);
    assert.equal(
      await c.send(),
      false,
      "Even an acknowledged draft cannot publish while hidden"
    );
    assert.equal(await c.retry(), false);
    assert.equal(await c.retryOriginal(), false);
    c.visibility(false);
    c.change(fields("Retained unsaved changes"));
    assert.equal(await c.retryOriginal(), false);
    c.visibility(true);
    assert.equal(await c.save(), false);
    assert.equal(await c.send(), false);
    t.mock.timers.tick(60000);
    await Promise.resolve();
    assert.deepEqual(bodies, []);
    assert.equal(c.getSnapshot().dirty, true);
    assert.equal(c.getSnapshot().fields.content, "Retained unsaved changes");
    assert.equal(c.getSnapshot().version, 7);
  } finally {
    c.dispose();
  }
});

test("private concealed publication keeps its original draft version, key and fields after 503 and 429", async () => {
  const bodies: string[] = [],
    saved = savedPrivateDraft("Original publication\r\n  exact words  ");
  const c = fixture(
    async (body) => {
      bodies.push(body);
      if (bodies.length === 1)
        throw new SocialClientError(503, "Response lost");
      if (bodies.length === 2) throw new SocialClientError(429, "Wait", 60);
      return { id: "accepted-comment", version: 1, message: "sent" };
    },
    [saved],
    true
  );
  try {
    await c.start();
    assert.equal(await c.send(), false);
    assert.deepEqual(JSON.parse(bodies[0]), {
      operation: "create",
      mutationId: "00000000-0000-4000-8000-000000000001",
      postId: "post",
      replyToId: "reply",
      ...fields(saved.content),
      draftId: "private-draft",
      draftVersion: 7
    });
    c.change(fields("An uncertain publication cannot be replaced"));
    assert.equal(c.getSnapshot().fields.content, saved.content);
    c.visibility(true);
    assert.equal(await c.retryOriginal(), false);
    assert.equal(c.getSnapshot().sending, true);
    assert.equal(c.getSnapshot().retry, true);
    assert.equal(await c.retryOriginal(), true);
    assert.deepEqual(bodies, [bodies[0], bodies[0], bodies[0]]);
    assert.equal(c.getSnapshot().hidden, true);
    assert.equal(c.getSnapshot().createdId, "accepted-comment");
    assert.equal(c.getSnapshot().retry, false);
    assert.equal(await c.retryOriginal(), false);
    c.visibility(false);
    assert.equal(c.getSnapshot().createdId, "accepted-comment");
    assert.equal(await c.send(), false);
    assert.equal(bodies.length, 3);
  } finally {
    c.dispose();
  }
});

test("a publication accepted after concealment retains its receipt without another request", async () => {
  const accepted = deferred<{ id: string; version: number; message: string }>(),
    dispatched = deferred<void>(),
    bodies: string[] = [];
  const c = fixture(
    async (body) => {
      bodies.push(body);
      dispatched.resolve();
      return accepted.promise;
    },
    [savedPrivateDraft()],
    true
  );
  try {
    await c.start();
    const sending = c.send();
    await dispatched.promise;
    c.visibility(true);
    assert.equal(
      await c.retryOriginal(),
      false,
      "An in-flight original cannot be duplicated"
    );
    accepted.resolve({ id: "late-comment", version: 1, message: "sent" });
    assert.equal(await sending, true);
    assert.equal(c.getSnapshot().createdId, "late-comment");
    assert.equal(c.getSnapshot().hidden, true);
    assert.equal(c.getSnapshot().busy, false);
    assert.equal(c.getSnapshot().sending, false);
    assert.equal(await c.retryOriginal(), false);
    assert.equal(bodies.length, 1);
    c.visibility(false);
    assert.equal(c.getSnapshot().createdId, "late-comment");
    assert.equal(await c.send(), false);
    assert.equal(bodies.length, 1);
  } finally {
    c.dispose();
  }
});

test("a late concealed save acknowledges only its captured fields and preserves newer edits", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const accepted = deferred<{ id: string; version: number; message: string }>(),
    bodies: string[] = [];
  const c = fixture(
    async (body) => {
      bodies.push(body);
      return accepted.promise;
    },
    [savedPrivateDraft()],
    true
  );
  try {
    await c.start();
    c.change(fields("Captured draft fields"));
    const saving = c.save();
    const newer = {
      content: "Newer fields",
      mentionIds: [],
      authorChurchId: null
    };
    c.change(newer);
    c.visibility(true);
    accepted.resolve({ id: "private-draft", version: 8, message: "saved" });
    assert.equal(await saving, true);
    assert.equal(c.getSnapshot().hidden, true);
    assert.equal(c.getSnapshot().version, 8);
    assert.deepEqual(c.getSnapshot().fields, newer);
    assert.equal(c.getSnapshot().dirty, true);
    assert.equal(c.getSnapshot().retry, false);
    assert.equal(await c.retryOriginal(), false);
    t.mock.timers.tick(60000);
    await Promise.resolve();
    assert.equal(bodies.length, 1);
    assert.equal(JSON.parse(bodies[0]).content, "Captured draft fields");
    assert.equal(JSON.parse(bodies[0]).expectedVersion, 7);
  } finally {
    c.dispose();
  }
});

test("accepted private original recovery clears a prior conflict for subsequent deliberate work", async () => {
  const bodies: string[] = [];
  const c = fixture(
    async (body) => {
      bodies.push(body);
      if (bodies.length === 1)
        throw new SocialClientError(409, "Changed elsewhere");
      return {
        id: "private-draft",
        version: bodies.length + 6,
        message: "saved"
      };
    },
    [savedPrivateDraft()],
    true
  );
  try {
    await c.start();
    c.change(fields("Original save"));
    assert.equal(await c.save(), false);
    assert.equal(c.getSnapshot().conflict, true);
    assert.equal(c.getSnapshot().retry, true);
    c.visibility(true);
    assert.equal(await c.retry(), false);
    assert.equal(await c.retryOriginal(), true);
    assert.equal(bodies[0], bodies[1]);
    assert.equal(c.getSnapshot().retry, false);
    assert.equal(c.getSnapshot().conflict, false);
    c.visibility(false);
    c.change(fields("A new deliberate save"));
    assert.equal(await c.save(), true);
    assert.notEqual(
      JSON.parse(bodies[2]).mutationId,
      JSON.parse(bodies[0]).mutationId
    );
    assert.equal(JSON.parse(bodies[2]).expectedVersion, 8);
    assert.equal(JSON.parse(bodies[2]).content, "A new deliberate save");
  } finally {
    c.dispose();
  }
});

test("reviewing a newer copy cannot replace a private unresolved original request", async () => {
  const bodies: string[] = [],
    saved = savedPrivateDraft(),
    items = [saved];
  const c = fixture(
    async (body) => {
      bodies.push(body);
      if (bodies.length === 1)
        throw new SocialClientError(503, "Response lost");
      return { id: "private-draft", version: 8, message: "saved" };
    },
    items,
    true
  );
  try {
    await c.start();
    c.change(fields("Original uncertain save"));
    assert.equal(await c.save(), false);
    items[0] = { ...savedPrivateDraft("Other tab's saved copy"), version: 9 };
    await c.review();
    assert.equal(c.getSnapshot().latest?.version, 9);
    c.useLatest();
    assert.equal(c.getSnapshot().retry, true);
    assert.equal(c.getSnapshot().version, 7);
    assert.equal(c.getSnapshot().fields.content, "Original uncertain save");
    c.visibility(true);
    assert.equal(await c.retryOriginal(), true);
    assert.equal(bodies[0], bodies[1]);
  } finally {
    c.dispose();
  }
});

test("non-private controllers retain their existing 429 correction behavior", async () => {
  const bodies: string[] = [];
  const c = fixture(async (body) => {
    bodies.push(body);
    if (bodies.length === 1) throw new SocialClientError(503, "Response lost");
    if (bodies.length === 2) throw new SocialClientError(429, "Wait", 60);
    return { id: "draft", version: 1, message: "saved" };
  });
  try {
    await c.start();
    c.change(fields("Original words"));
    assert.equal(await c.save(), false);
    c.change(fields("Corrected words"));
    assert.equal(await c.retry(), false);
    assert.equal(bodies[0], bodies[1]);
    assert.equal(c.getSnapshot().retry, false);
    assert.equal(await c.retryOriginal(), false);
    assert.equal(await c.retry(), true);
    assert.notEqual(
      JSON.parse(bodies[2]).mutationId,
      JSON.parse(bodies[0]).mutationId
    );
    assert.equal(JSON.parse(bodies[2]).content, "Corrected words");
    assert.equal(JSON.parse(bodies[2]).expectedVersion, 0);
  } finally {
    c.dispose();
  }
});
