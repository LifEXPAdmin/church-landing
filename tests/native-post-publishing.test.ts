import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash, createHmac } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { assertPortalTestDatabase, createPortalActor } from "./seed-portal";
import { postCommand } from "../lib/platform/post-commands";
import { AccountSessionOwnerError } from "../lib/platform/account-sessions";
import { hashSessionToken } from "../lib/platform/auth";
import { apiWriteExamples } from "../lib/platform/api-contract-examples";
import { apiFailure, decodeApiResponse } from "../lib/platform/api-contracts";
import { handleNativePostCreateRequest } from "../lib/platform/native-post-boundary";
import { handleNativeReadRequest } from "../lib/platform/native-read-boundary";
import { handlePostRequest } from "../lib/platform/post-boundary";
import { accountConfig } from "../lib/platform/account-config";
import { sessionCookieFixtureName } from "../scripts/session-cookie-fixture.mjs";
import { processNotificationFanoutBatch } from "../lib/platform/notification-fanout";

const db = new PrismaClient();
before(() => assertPortalTestDatabase(db));
after(() => db.$disconnect());
const change = (fields: Record<string, unknown> = {}) => ({
  ...apiWriteExamples.createPost,
  requestKey: randomUUID(),
  ...fields
});
const creation = (fields: Record<string, unknown> = {}) => ({
  operation: "create",
  ...change(fields)
});
const receiptKey = (requestKey: string) =>
  "post-create:" + createHash("sha256").update(requestKey).digest("hex");

function boundCommand(
  client: PrismaClient,
  token: string,
  input: Record<string, unknown>,
  originalOwner: string
): ReturnType<typeof postCommand> {
  return postCommand(client, token, input, originalOwner);
}

type Actor = { id: string; token: string };
const origin = () => process.env.ACCOUNT_ORIGIN!;
const headers = (actor: Actor) => ({
  Authorization: "Bearer " + actor.token,
  "X-Expected-Account": actor.id,
  "Content-Type": "application/json"
});
function request(actor: Actor, body: BodyInit) {
  return new Request(origin() + "/api/platform/v1/posts", {
    method: "POST",
    headers: headers(actor),
    body,
    ...(body instanceof ReadableStream ? { duplex: "half" } : {})
  } as RequestInit);
}
async function result(response: Response) {
  assert.match(response.headers.get("cache-control")!, /private.*no-store/);
  assert.equal(response.headers.get("set-cookie"), null);
  assert.equal(response.headers.get("location"), null);
  assert.equal(response.headers.get("x-api-version"), "1");
  return { response, value: await response.json() };
}
async function call(
  actor: Actor,
  input: object,
  afterCreate?: (id: string, ownerId: string) => void
) {
  return result(
    await handleNativePostCreateRequest(
      db,
      request(actor, JSON.stringify(input)),
      afterCreate
    )
  );
}
function ok(r: Awaited<ReturnType<typeof call>>, owner: string) {
  assert.equal(r.response.status, 200, JSON.stringify(r.value));
  return decodeApiResponse("createPost", r.value, owner).data;
}
function denied(
  r: Awaited<ReturnType<typeof call>>,
  status: number,
  code: string
) {
  assert.equal(r.response.status, status, JSON.stringify(r.value));
  assert.equal(apiFailure.parse(r.value).error.code, code);
  assert.equal(r.value.data, undefined);
}
async function reading(postId: string, actor?: Actor) {
  return handleNativeReadRequest(
    db,
    new Request(origin() + "/api/platform/v1/posts/" + postId, {
      headers: actor ? headers(actor) : {}
    }),
    "post",
    { postId }
  );
}

test("original owner must be checked before creating or replaying a canonical post", async () => {
  const original = await createPortalActor(db, "postoriginal"),
    replacement = await createPortalActor(db, "postreplacement"),
    input = creation();
  await assert.rejects(
    boundCommand(db, replacement.token, input, original.id),
    AccountSessionOwnerError
  );
  assert.equal(
    await db.platformPost.count({ where: { requestKey: input.requestKey } }),
    0
  );
  assert.equal(
    await db.socialOperation.count({
      where: { key: receiptKey(input.requestKey) }
    }),
    0
  );

  const saved = await boundCommand(
    db,
    replacement.token,
    input,
    replacement.id
  );
  await assert.rejects(
    boundCommand(db, replacement.token, input, original.id),
    AccountSessionOwnerError
  );
  assert.deepEqual(
    await boundCommand(db, replacement.token, input, replacement.id),
    saved
  );
  assert.equal(
    await db.platformPost.count({ where: { requestKey: input.requestKey } }),
    1
  );
});

test("original owner is rechecked after outside-transaction link preparation", async () => {
  const original = await createPortalActor(db, "postbeforelink"),
    replacement = await createPortalActor(db, "postafterlink"),
    input = creation({ linkUrl: "" });
  let transactions = 0;
  const client = new Proxy(db, {
    get(target, property, receiver) {
      if (property !== "$transaction")
        return Reflect.get(target, property, receiver);
      return async (...args: unknown[]) => {
        const result = await Reflect.apply(db.$transaction, db, args);
        if (++transactions === 1) {
          await db.platformSession.update({
            where: { tokenHash: hashSessionToken(original.token) },
            data: { userId: replacement.id }
          });
        }
        return result;
      };
    }
  });
  await assert.rejects(
    boundCommand(client, original.token, input, original.id),
    AccountSessionOwnerError
  );
  assert.equal(transactions, 1);
  assert.equal(
    await db.platformPost.count({ where: { requestKey: input.requestKey } }),
    0
  );
  assert.equal(
    await db.socialOperation.count({
      where: { key: receiptKey(input.requestKey) }
    }),
    0
  );
});

test("canonical request-key retries retain raw input and one publication without a private draft", async () => {
  const actor = await createPortalActor(db, "postretry"),
    input = change({ content: "a\r\n".repeat(1500) });
  const receipts = await Promise.all([
    call(actor, input).then((r) => ok(r, actor.id)),
    call(actor, input).then((r) => ok(r, actor.id))
  ]);
  assert.deepEqual(receipts[0], receipts[1]);
  assert.deepEqual(
    await postCommand(db, actor.token, { operation: "create", ...input }),
    receipts[0]
  );
  const post = await db.platformPost.findUniqueOrThrow({
    where: { id: receipts[0].id }
  });
  assert.equal(post.content, "a\n".repeat(1500).trim());
  assert.equal(post.authorId, actor.id);
  assert.equal(post.audience, "PUBLIC");
  assert.equal(
    await db.platformPost.count({ where: { requestKey: input.requestKey } }),
    1
  );
  assert.equal(
    await db.socialOperation.count({
      where: { key: receiptKey(input.requestKey) }
    }),
    1
  );
  assert.equal(
    await db.postAudit.count({
      where: { postId: post.id, action: "published" }
    }),
    1
  );
  assert.equal(
    await db.privatePostDraft.count({ where: { ownerId: actor.id } }),
    0
  );
  denied(
    await call(actor, { ...input, content: post.content }),
    409,
    "conflict"
  );
  denied(await call(actor, { ...input, audience: "CHURCH" }), 409, "conflict");
});

test("optional original-owner binding also covers versioned and receipted website controls", async () => {
  const original = await createPortalActor(db, "postcontroloriginal"),
    replacement = await createPortalActor(db, "postcontrolreplacement");
  const post = await postCommand(db, replacement.token, creation());
  for (const fields of [
    {},
    { mutationId: randomUUID() },
    { operation: "edit", linkUrl: "" },
    { operation: "edit", linkUrl: "", mutationId: randomUUID() }
  ]) {
    await assert.rejects(
      postCommand(
        db,
        replacement.token,
        {
          operation: "pin",
          postId: post.id,
          expectedVersion: 1,
          pinned: true,
          ...fields
        },
        original.id
      ),
      AccountSessionOwnerError
    );
  }
  assert.equal(
    (await db.platformPost.findUniqueOrThrow({ where: { id: post.id } }))
      .version,
    1
  );
});

test("wire rejection and canonical validation leave no publication or receipt", async () => {
  const actor = await createPortalActor(db, "postvalidation");
  const changes = [
    { content: "x".repeat(3001) },
    { content: "   " },
    { contentNote: "x".repeat(121) },
    { safeExcerpt: "x".repeat(161) },
    { scripture: "x".repeat(121) },
    { topics: ["prayer", "prayer"] },
    { audience: "CHURCH" },
    { replyAudience: "CHURCH_MEMBERS" },
    { authorId: actor.id },
    { draftId: "unowned-draft" },
    { mutationId: randomUUID() },
    { photos: [] },
    { groupId: "private-group" },
    { linkUrl: "https://example.test" },
    { content: "😀".repeat(10000) }
  ];
  for (const fields of changes) {
    const input = change(fields);
    denied(await call(actor, input), 400, "validation");
    assert.equal(
      await db.platformPost.count({ where: { requestKey: input.requestKey } }),
      0
    );
    assert.equal(
      await db.socialOperation.count({
        where: { key: receiptKey(input.requestKey) }
      }),
      0
    );
  }
  assert.equal(
    await db.privatePostDraft.count({ where: { ownerId: actor.id } }),
    0
  );
});

test("original ownership and session validity are rechecked after body consumption", async () => {
  for (const loss of ["owner", "expiry", "revoke"]) {
    const actor = await createPortalActor(db, "postbodyowner"),
      replacement = await createPortalActor(db, "postbodyreplacement"),
      input = change();
    const tokenHash = hashSessionToken(actor.token);
    let pulls = 0;
    const body = new ReadableStream<Uint8Array>(
      {
        async pull(controller) {
          pulls++;
          if (loss === "owner")
            await db.platformSession.update({
              where: { tokenHash },
              data: { userId: replacement.id }
            });
          if (loss === "expiry")
            await db.platformSession.update({
              where: { tokenHash },
              data: { expiresAt: new Date(Date.now() - 1000) }
            });
          if (loss === "revoke")
            await db.platformSession.delete({ where: { tokenHash } });
          controller.enqueue(new TextEncoder().encode(JSON.stringify(input)));
          controller.close();
        }
      },
      { highWaterMark: 0 }
    );
    denied(
      await result(
        await handleNativePostCreateRequest(db, request(actor, body))
      ),
      401,
      loss === "owner" ? "account_changed" : "unauthenticated"
    );
    assert.equal(pulls, 1);
    assert.equal(
      await db.platformPost.count({ where: { requestKey: input.requestKey } }),
      0
    );
    assert.equal(
      await db.socialOperation.count({
        where: { key: receiptKey(input.requestKey) }
      }),
      0
    );
  }
});

test("church identity and audience use current membership and publisher grants before new writes and replay", async () => {
  const actor = await createPortalActor(db, "postchurchpublisher"),
    member = await createPortalActor(db, "postchurchmember"),
    outsider = await createPortalActor(db, "postchurchoutsider");
  const church = await db.church.create({
    data: {
      slug: "native-post-" + randomUUID(),
      name: "Fictional native post church",
      summary: "Isolated publication audience"
    }
  });
  const input = change({
    authorChurchId: church.id,
    audienceChurchId: church.id,
    audience: "CHURCH",
    replyAudience: "CHURCH_MEMBERS"
  });
  denied(await call(actor, input), 403, "forbidden");
  await db.churchConnection.createMany({
    data: [actor, member].map((a) => ({
      userId: a.id,
      churchId: church.id,
      state: "APPROVED"
    }))
  });
  denied(await call(actor, input), 403, "forbidden");
  const grant = await db.churchCapabilityGrant.create({
    data: {
      churchId: church.id,
      userId: actor.id,
      capability: "PUBLISH_CHURCH_POSTS"
    }
  });
  const receipt = ok(await call(actor, input), actor.id);
  assert.equal((await reading(receipt.id, member)).status, 200);
  const read = decodeApiResponse(
    "post",
    await (await reading(receipt.id, member)).json(),
    member.id
  );
  assert.ok(!JSON.stringify(read.data).includes(actor.id));
  assert.equal((await reading(receipt.id, outsider)).status, 404);
  assert.equal((await reading(receipt.id)).status, 404);
  await db.churchCapabilityGrant.delete({ where: { id: grant.id } });
  denied(await call(actor, input), 403, "forbidden");
  denied(
    await call(actor, { ...input, requestKey: randomUUID() }),
    403,
    "forbidden"
  );
  const personal = change({
    audienceChurchId: church.id,
    audience: "CHURCH",
    replyAudience: "CHURCH_MEMBERS"
  });
  ok(await call(actor, personal), actor.id);
  await db.churchConnection.updateMany({
    where: { churchId: church.id, userId: actor.id },
    data: { state: "REMOVED" }
  });
  denied(
    await call(actor, { ...personal, requestKey: randomUUID() }),
    403,
    "forbidden"
  );
  assert.equal(
    await db.platformPost.count({ where: { authorId: actor.id } }),
    2
  );
});

test("uncertain handoff and exact retry preserve one post and historical receipt without reviving withdrawal", async () => {
  const actor = await createPortalActor(db, "posthandoff"),
    input = change();
  denied(
    await call(actor, input, () => {
      throw Error("Fictional lost handoff");
    }),
    503,
    "unconfirmed"
  );
  const handoffs: string[][] = [];
  const saved = ok(
    await call(actor, input, (id, owner) => handoffs.push([id, owner])),
    actor.id
  );
  assert.deepEqual(handoffs, [[saved.id, actor.id]]);
  await db.platformPost.update({
    where: { id: saved.id },
    data: { content: "Fictional later website edit", version: { increment: 1 } }
  });
  assert.deepEqual(ok(await call(actor, input), actor.id), saved);
  assert.equal(
    (await db.platformPost.findUniqueOrThrow({ where: { id: saved.id } }))
      .content,
    "Fictional later website edit"
  );
  await db.platformPost.update({
    where: { id: saved.id },
    data: {
      status: "WITHDRAWN",
      withdrawnAt: new Date(),
      version: { increment: 1 }
    }
  });
  denied(await call(actor, input), 403, "forbidden");
  assert.equal(
    await db.platformPost.count({ where: { requestKey: input.requestKey } }),
    1
  );
  assert.equal(
    await db.socialOperation.count({
      where: { key: receiptKey(input.requestKey) }
    }),
    1
  );
  assert.equal(
    await db.postAudit.count({
      where: { postId: saved.id, action: "published" }
    }),
    1
  );
});

test("native and website publication share the posts rate bucket before a denied native body is read", async () => {
  const actor = await createPortalActor(db, "postrate");
  const key = createHmac("sha256", accountConfig().rateSecret + ":posts")
    .update("post-workspace:" + actor.id)
    .digest("hex");
  await db.platformAuthLimit.create({
    data: { key, hits: 239, expiresAt: new Date(Date.now() + 900000) }
  });
  ok(await call(actor, change()), actor.id);
  const web = await handlePostRequest(
    db,
    new Request(origin() + "/api/platform/posts", {
      method: "POST",
      headers: {
        Origin: origin(),
        Cookie: sessionCookieFixtureName() + "=" + actor.token,
        "X-Expected-Account": actor.id,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(creation())
    })
  );
  assert.equal(web.status, 429);
  let pulls = 0;
  const body = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        pulls++;
        controller.close();
      }
    },
    { highWaterMark: 0 }
  );
  const r = await result(
    await handleNativePostCreateRequest(db, request(actor, body))
  );
  denied(r, 429, "rate_limited");
  assert.equal(r.response.headers.get("retry-after"), "900");
  assert.equal(pulls, 0);
});

test("publication retries reuse the canonical author-bell fanout and current source visibility", async () => {
  const actor = await createPortalActor(db, "postfanoutauthor"),
    reader = await createPortalActor(db, "postfanoutreader");
  await db.platformFollow.create({
    data: { followerId: reader.id, followingId: actor.id }
  });
  await db.socialRelationship.create({
    data: {
      ownerId: reader.id,
      targetUserId: actor.id,
      authorBellSince: new Date(Date.now() - 10000)
    }
  });
  const input = change(),
    saved = ok(await call(actor, input), actor.id);
  const job = await db.notificationFanoutJob.findFirstOrThrow({
    where: { kind: "AUTHOR_POST", sourceId: saved.id }
  });
  await processNotificationFanoutBatch(db, job.id);
  await call(actor, input);
  await processNotificationFanoutBatch(db, job.id);
  assert.equal(
    await db.notificationFanoutJob.count({
      where: { kind: "AUTHOR_POST", sourceId: saved.id }
    }),
    1
  );
  assert.equal(
    await db.socialEvent.count({
      where: { postId: saved.id, recipientId: reader.id, kind: "AUTHOR_POST" }
    }),
    1
  );
  const privatePost = ok(await call(actor, change()), actor.id);
  await db.platformPost.update({
    where: { id: privatePost.id },
    data: { status: "WITHDRAWN", withdrawnAt: new Date() }
  });
  const canceled = await db.notificationFanoutJob.findFirstOrThrow({
    where: { kind: "AUTHOR_POST", sourceId: privatePost.id }
  });
  await processNotificationFanoutBatch(db, canceled.id);
  assert.equal(
    await db.socialEvent.count({ where: { postId: privatePost.id } }),
    0
  );
});
