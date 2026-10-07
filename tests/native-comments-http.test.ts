import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { request as httpsRequest } from "node:https";
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { assertPortalTestDatabase, createPortalActor } from "./seed-portal";
import { apiFailure, decodeApiResponse } from "../lib/platform/api-contracts";
import { sessionCookieFixtureName } from "../scripts/session-cookie-fixture.mjs";
import { commentCommand } from "../lib/platform/comment-commands";
import { topicCommand, readTopic } from "../lib/platform/topic-communities";
import { postCommand } from "../lib/platform/post-commands";

const db = new PrismaClient(),
  origin = process.env.ACCOUNT_ORIGIN!;
assert.match(origin, /^https:\/\/127\.0\.0\.1:\d+$/);
before(() => assertPortalTestDatabase(db));
after(() => db.$disconnect());
type Actor = { id: string; token: string };
const path = (id: string, query = "") =>
  `/api/platform/v1/posts/${id}/comments${query}`;
const command = (operation: string, fields: Record<string, unknown>) => ({
  operation,
  mutationId: randomUUID(),
  ...fields
});

// The runner trusts only the fixture certificate through NODE_EXTRA_CA_CERTS.
function send(
  path: string,
  actor: Actor | null = null,
  headers: Record<string, string> = {}
) {
  return new Promise<{
    status: number;
    headers: import("node:http").IncomingHttpHeaders;
    bytes: Buffer;
  }>((resolve, reject) => {
    const request = httpsRequest(
      origin + path,
      {
        method: "GET",
        servername: "localhost",
        timeout: 30000,
        headers: {
          ...(actor
            ? {
                Authorization: "Bearer " + actor.token,
                "X-Expected-Account": actor.id
              }
            : {}),
          ...headers
        }
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.once("error", reject);
        response.once("end", () =>
          resolve({
            status: response.statusCode!,
            headers: response.headers,
            bytes: Buffer.concat(chunks)
          })
        );
      }
    );
    request.once("error", reject);
    request.once("timeout", () =>
      request.destroy(new Error("Fictional comment HTTPS timeout"))
    );
    request.end();
  });
}
type Result = Awaited<ReturnType<typeof send>>;
function privateResponse(result: Result) {
  assert.match(String(result.headers["cache-control"]), /private.*no-store/);
  assert.equal(result.headers["cdn-cache-control"], "no-store");
  assert.equal(result.headers["vercel-cdn-cache-control"], "no-store");
  assert.equal(result.headers["x-api-version"], "1");
  assert.equal(result.headers["referrer-policy"], "no-referrer");
  for (const field of [
    "authorization",
    "cookie",
    "x-expected-account",
    "x-api-version"
  ])
    assert.ok(
      String(result.headers.vary).toLowerCase().split(/,\s*/).includes(field)
    );
  for (const field of ["set-cookie", "location", "access-control-allow-origin"])
    assert.equal(result.headers[field], undefined);
}
function ok(result: Result, owner: string | null = null) {
  assert.equal(result.status, 200, result.bytes.toString());
  privateResponse(result);
  return decodeApiResponse(
    "comments",
    JSON.parse(result.bytes.toString()),
    owner
  ).data;
}
function denied(result: Result, status: number, code: string) {
  assert.equal(result.status, status, result.bytes.toString());
  privateResponse(result);
  assert.equal(
    apiFailure.parse(JSON.parse(result.bytes.toString())).error.code,
    code
  );
}
async function fixture() {
  const owner = await createPortalActor(db, "chttpown");
  const reader = await createPortalActor(db, "chttpread");
  const post = await db.platformPost.create({
    data: {
      authorId: owner.id,
      content: "Fictional HTTPS discussion",
      publishedAt: new Date()
    }
  });
  return { owner, reader, post };
}

test("trusted HTTPS native and website readers traverse the same bounded canonical discussion", async () => {
  const f = await fixture();
  assert.deepEqual(ok(await send(path(f.post.id))).items, []);
  const ids = Array.from({ length: 23 }, () => randomUUID()).sort();
  const createdAt = new Date("2026-01-01T00:00:00.000Z");
  await db.platformPostComment.createMany({
    data: ids.map((id) => ({
      id,
      postId: f.post.id,
      authorId: f.owner.id,
      content: "Fictional HTTPS root",
      createdAt
    }))
  });
  const first = ok(await send(path(f.post.id), f.reader), f.reader.id);
  assert.equal(first.items.length, 20);
  assert.ok(first.nextCursor);
  const tail = ok(
    await send(path(f.post.id, "?cursor=" + first.nextCursor), f.reader),
    f.reader.id
  );
  assert.deepEqual(
    [...first.items, ...tail.items].map((row) => row.id),
    ids
  );
  assert.equal(tail.nextCursor, null);
  const web = await send(`/api/platform/comments?postId=${f.post.id}`, null, {
    Cookie: `${sessionCookieFixtureName()}=${f.reader.token}`,
    "X-Expected-Account": f.reader.id
  });
  assert.equal(web.status, 200, web.bytes.toString());
  const webBody = JSON.parse(web.bytes.toString());
  assert.deepEqual(
    first.items.map((row) => row.id),
    webBody.items.map((row: { id: string }) => row.id)
  );
  assert.equal(first.visibleCount, webBody.visibleCount);
  denied(
    await send(path(f.post.id, "?cursor=" + webBody.nextCursor), f.reader),
    409,
    "cursor_invalid"
  );
  denied(
    await send(path(f.post.id, "?cursor=" + first.nextCursor), f.owner),
    409,
    "cursor_invalid"
  );
  await db.platformPost.update({
    where: { id: f.post.id },
    data: { withdrawnAt: new Date(), status: "WITHDRAWN" }
  });
  denied(
    await send(path(f.post.id, "?cursor=" + first.nextCursor), f.reader),
    404,
    "not_found"
  );
});

test("trusted HTTPS comment admission rejects browser and changed credentials and unsupported query semantics", async () => {
  const f = await fixture();
  denied(
    await send(path(f.post.id), { id: f.reader.id, token: "a".repeat(43) }),
    401,
    "unauthenticated"
  );
  denied(
    await send(path(f.post.id), f.reader, { "X-Expected-Account": f.owner.id }),
    401,
    "account_changed"
  );
  denied(
    await send(path(f.post.id), null, {
      Authorization: "Bearer " + f.reader.token
    }),
    400,
    "validation"
  );
  denied(
    await send(path(f.post.id), null, {
      Cookie: `${sessionCookieFixtureName()}=${f.reader.token}`
    }),
    401,
    "unauthenticated"
  );
  denied(
    await send(path(f.post.id), f.reader, { Origin: origin }),
    403,
    "forbidden"
  );
  denied(
    await send(path(f.post.id), f.reader, { "Sec-Fetch-Site": "same-origin" }),
    403,
    "forbidden"
  );
  denied(
    await send(path(f.post.id), f.reader, { "X-API-Version": "2" }),
    426,
    "unsupported_version"
  );
  for (const query of [
    "?sort=oldest&sort=newest",
    "?view=drafts",
    "?view=mentions",
    "?view=replies",
    "?rootId=root",
    "?ownerId=other"
  ])
    denied(await send(path(f.post.id, query), f.reader), 400, "validation");
  assert.equal(
    await db.platformPostComment.count({ where: { postId: f.post.id } }),
    0
  );
});

test("trusted HTTPS Topic restrictions preserve only neutral root context and the permitted child", async () => {
  const f = await fixture();
  const slug = "fictional-http-" + randomUUID();
  const topic = await topicCommand(
    db,
    f.owner.token,
    command("create", {
      name: "Fictional HTTPS Topic " + randomUUID(),
      slug,
      description: "Isolated reader fixture",
      rules: "Keep fictional discussion respectful.",
      acceptedRules: true
    })
  );
  const state = await readTopic(db, f.reader.token, slug);
  await topicCommand(
    db,
    f.reader.token,
    command("join", {
      communityId: topic.id,
      desired: true,
      acceptedRules: true,
      rulesVersion: state.community.rulesVersion,
      expectedVersion: state.viewer.version
    })
  );
  const post = await postCommand(db, f.owner.token, {
    operation: "create",
    requestKey: randomUUID(),
    topicCommunityId: topic.id,
    content: "Fictional browser Topic discussion"
  });
  const marker = "Fictional restricted Topic root " + randomUUID();
  const root = await commentCommand(
    db,
    f.reader.token,
    command("create", { postId: post.id, content: marker })
  );
  const child = await commentCommand(
    db,
    f.owner.token,
    command("create", {
      postId: post.id,
      replyToId: root.id,
      content: "Fictional permitted Topic child"
    })
  );
  const before = ok(await send(path(post.id)));
  assert.ok(before.items[0].available && !before.items[0].requiresWeb);
  const membership = await db.topicMembership.findUniqueOrThrow({
    where: {
      communityId_userId: { communityId: topic.id, userId: f.reader.id }
    }
  });
  await topicCommand(
    db,
    f.owner.token,
    command("restrict", {
      communityId: topic.id,
      targetId: f.reader.id,
      expectedVersion: membership.version,
      desired: true,
      reason: "RULES"
    })
  );
  for (const actor of [null, f.owner]) {
    for (const view of ["roots", "replies", "context"]) {
      const query = `?view=${view}${view === "replies" ? "&rootId=" + root.id : view === "context" ? "&commentId=" + child.id : ""}`;
      const native = ok(
        await send(path(post.id, query), actor),
        actor?.id ?? null
      );
      const projectedRoot = view === "roots" ? native.items[0] : native.root;
      assert.ok(projectedRoot && !projectedRoot.available);
      assert.equal(native.visibleCount, 1);
      assert.ok(!JSON.stringify(native).includes(marker));
      assert.ok(!JSON.stringify(native).includes(f.reader.name));
      const web = await send(
        `/api/platform/comments?postId=${post.id}&${query.slice(1)}`,
        null,
        actor
          ? {
              Cookie: `${sessionCookieFixtureName()}=${actor.token}`,
              "X-Expected-Account": actor.id
            }
          : {}
      );
      assert.equal(web.status, 200, web.bytes.toString());
      const webBody = JSON.parse(web.bytes.toString());
      assert.equal(
        (view === "roots" ? webBody.items[0] : webBody.root).unavailable,
        true
      );
      assert.ok(!web.bytes.toString().includes(marker));
    }
    denied(
      await send(path(post.id, `?view=context&commentId=${root.id}`), actor),
      404,
      "not_found"
    );
  }
  writeFileSync(
    join(
      dirname(process.env.ACCOUNT_TEST_SINK_DIR!),
      "comment-browser-fixture.json"
    ),
    JSON.stringify({
      postId: post.id,
      rootId: root.id,
      childId: child.id,
      hiddenContent: marker,
      hiddenName: f.reader.name,
      childContent: "Fictional permitted Topic child",
      owner: { id: f.owner.id, token: f.owner.token }
    }),
    { mode: 0o600, flag: "wx" }
  );
});
