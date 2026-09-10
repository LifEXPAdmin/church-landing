import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Resolver } from "node:dns/promises";
import { PrismaClient } from "@prisma/client";
import { assertPortalTestDatabase } from "./seed-portal";
import { seedParticipation } from "./seed-post-participation";
import { postCommand } from "../lib/platform/post-commands";
import { signPostPreview } from "../lib/platform/post-links";
import { getPost } from "../lib/platform/post-reads";
import { getPostEditor } from "../lib/platform/post-editor";
import { handlePostRequest } from "../lib/platform/post-boundary";
import { PortalError } from "../lib/platform/portal";
import { AccountError } from "../lib/platform/accounts";
const db = new PrismaClient(),
  origin = process.env.ACCOUNT_ORIGIN!;
before(() => assertPortalTestDatabase(db));
after(() => db.$disconnect());
const url = "https://example.com/fictional-resource";
const denied = (p: Promise<unknown>, status: number) =>
  assert.rejects(p, (e) => e instanceof PortalError && e.status === status);
const send = (token: string, input: Record<string, unknown>, source = origin) =>
  handlePostRequest(
    db,
    new Request(origin + "/api/platform/posts", {
      method: "POST",
      headers: {
        Origin: source,
        Cookie: "church_platform_session=" + token,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(input)
    })
  );
test("link cards obey current post audiences and versions, survive ordinary edits, and clear on withdrawal without removing participation", async () => {
  const f = await seedParticipation(db);
  const preview = {
    title: "Private link title " + randomUUID(),
    description: "A church resource",
    sourceUrl: url
  };
  const payload = {
    operation: "edit",
    postId: f.post.id,
    expectedVersion: 1,
    linkUrl: url,
    keepLinkPreview: true,
    linkReceipt: signPostPreview(f.ada.id, url, preview)
  };
  await denied(postCommand(db, f.lee.token, payload), 403);
  const result = await postCommand(db, f.ada.token, payload);
  assert.equal(result.version, 2);
  assert.equal(
    (await getPostEditor(db, f.ada.token, f.post.id)).linkTitle,
    preview.title
  );
  assert.equal(
    (await getPost(db, f.lee.token, f.post.id))?.linkTitle,
    preview.title
  );
  assert.equal(await getPost(db, "", f.post.id), null);
  assert.equal(await getPost(db, f.blake.token, f.post.id), null);
  await denied(postCommand(db, f.ada.token, { ...payload, linkUrl: "" }), 409);
  await postCommand(db, f.ada.token, {
    operation: "edit",
    postId: f.post.id,
    expectedVersion: 2,
    content: "An ordinary text edit."
  });
  assert.equal(
    (await getPost(db, f.lee.token, f.post.id))?.linkTitle,
    preview.title
  );
  const poll = await f.poll();
  const option = await db.postPollOption.findFirstOrThrow({
    where: { pollId: poll.id }
  });
  await f.command(f.lee, {
    operation: "vote",
    pollVersion: 1,
    expectedVersion: 0,
    optionIds: [option.id]
  });
  await postCommand(db, f.ada.token, {
    operation: "withdraw",
    postId: f.post.id,
    expectedVersion: 3,
    confirmed: true
  });
  const removed = await db.platformPost.findUniqueOrThrow({
    where: { id: f.post.id }
  });
  for (const field of [
    "linkUrl",
    "linkTitle",
    "linkDescription",
    "linkSourceUrl"
  ] as const)
    assert.equal(removed[field], null);
  assert.equal(await getPost(db, f.lee.token, f.post.id), null);
  assert.equal(
    await db.postPollBallot.count({ where: { pollId: poll.id } }),
    1
  );
});
test("preview boundary requires current sign-in, exact origin and bounded rates; unavailable previews still publish a plain link once", async () => {
  const f = await seedParticipation(db);
  await db.platformAuthLimit.deleteMany();
  const input = { operation: "preview-link", linkUrl: "https://127.0.0.1/" };
  assert.equal((await send("", input)).status, 401);
  assert.equal(
    (await send(f.lee.token, input, "https://wrong.example")).status,
    403
  );
  assert.equal(
    (await send(f.lee.token, { ...input, userId: f.ada.id })).status,
    400
  );
  for (let i = 0; i < 3; i++) {
    const response = await send(f.lee.token, input);
    assert.equal(response.status, 400);
    assert.match(response.headers.get("cache-control")!, /no-store/);
  }
  assert.equal((await send(f.lee.token, input)).status, 429);
  await db.platformAuthLimit.deleteMany();
  const fallbackUrl = "https://post-preview-fixture.invalid/article";
  const response = await send(f.lee.token, {
    operation: "preview-link",
    linkUrl: fallbackUrl
  });
  assert.equal(response.status, 200);
  const fallback = await response.json();
  assert.equal(fallback.preview, null);
  assert.match(fallback.message, /plain link/);
  const create = {
    operation: "create",
    requestKey: randomUUID(),
    content: "The resource remains a usable plain link.",
    linkUrl: fallback.url,
    linkReceipt: fallback.receipt,
    keepLinkPreview: true,
    linkTitle: "Forged title"
  };
  const first = await (await send(f.lee.token, create)).json();
  assert.equal((await (await send(f.lee.token, create)).json()).id, first.id);
  const saved = await db.platformPost.findUniqueOrThrow({
    where: { id: first.id }
  });
  assert.equal(saved.linkUrl, fallbackUrl);
  assert.equal(saved.linkTitle, null);
  await db.platformSession.deleteMany({ where: { userId: f.lee.id } });
  assert.equal(
    (
      await send(f.lee.token, {
        operation: "preview-link",
        linkUrl: fallbackUrl
      })
    ).status,
    401
  );
});
test("link preparation holds no database lock and rechecks revoked sessions before saving; saved create retries never refetch", async (t) => {
  const f = await seedParticipation(db),
    requestKey = randomUUID();
  const first = await postCommand(db, f.lee.token, {
    operation: "create",
    requestKey,
    content: "Already saved with a plain link.",
    linkUrl: url,
    linkReceipt: signPostPreview(f.lee.id, url, null)
  });
  let signalStarted: () => void = () => {},
    release: (addresses: string[]) => void = () => {};
  const started = new Promise<void>((resolve) => {
    signalStarted = resolve;
  });
  const lookup = t.mock.method(
    Resolver.prototype,
    "resolve4",
    () =>
      new Promise<string[]>((resolve) => {
        release = resolve;
        signalStarted();
      })
  );
  t.mock.method(Resolver.prototype, "resolve6", async () => []);
  // Even an expired receipt is unnecessary for an already saved creation key.
  assert.equal(
    (
      await postCommand(db, f.lee.token, {
        operation: "create",
        requestKey,
        content: "Retry",
        linkUrl: url,
        linkReceipt: "expired"
      })
    ).id,
    first.id
  );
  assert.equal(lookup.mock.callCount(), 0);
  const edit = postCommand(db, f.ada.token, {
    operation: "edit",
    postId: f.post.id,
    expectedVersion: 1,
    linkUrl: url
  });
  const rejection = assert.rejects(
    edit,
    (e) => e instanceof AccountError && e.code === "session"
  );
  await started;
  await db.platformSession.deleteMany({ where: { userId: f.ada.id } });
  release(["93.184.216.34"]);
  await rejection;
  const post = await db.platformPost.findUniqueOrThrow({
    where: { id: f.post.id }
  });
  assert.equal(post.version, 1);
  assert.equal(post.linkUrl, null);
});
