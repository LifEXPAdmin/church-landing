import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { request as httpsRequest } from "node:https";
import { randomUUID, createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { assertPortalTestDatabase, createPortalActor } from "./seed-portal";
import { apiFailure, decodeApiResponse } from "../lib/platform/api-contracts";
import { apiWriteExamples } from "../lib/platform/api-contract-examples";
import { sessionCookieFixtureName } from "../scripts/session-cookie-fixture.mjs";

const db = new PrismaClient(),
  origin = process.env.ACCOUNT_ORIGIN!;
assert.match(origin, /^https:\/\/127\.0\.0\.1:\d+$/);
before(() => assertPortalTestDatabase(db));
after(() => db.$disconnect());
type Actor = { id: string; token: string };
const target = "/api/platform/v1/posts";
const change = (fields: Record<string, unknown> = {}) => ({
  ...apiWriteExamples.createPost,
  requestKey: randomUUID(),
  ...fields
});
const key = (requestKey: string) =>
  "post-create:" + createHash("sha256").update(requestKey).digest("hex");
function send(
  path: string,
  actor: Actor | null,
  input?: object,
  headers: Record<string, string> = {},
  method = input ? "POST" : "GET"
) {
  const body = input ? JSON.stringify(input) : undefined;
  return new Promise<{
    status: number;
    headers: import("node:http").IncomingHttpHeaders;
    bytes: Buffer;
  }>((resolve, reject) => {
    const request = httpsRequest(
      origin + path,
      {
        method,
        servername: "localhost",
        timeout: 30000,
        headers: {
          ...(actor
            ? {
                Authorization: "Bearer " + actor.token,
                "X-Expected-Account": actor.id
              }
            : {}),
          ...(body
            ? {
                "Content-Type": "application/json",
                "Content-Length": String(Buffer.byteLength(body))
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
      request.destroy(Error("Fictional post publication HTTPS timeout"))
    );
    request.end(body);
  });
}
type Result = Awaited<ReturnType<typeof send>>;
function privateResponse(r: Result) {
  assert.match(String(r.headers["cache-control"]), /private.*no-store/);
  for (const key of ["cdn-cache-control", "vercel-cdn-cache-control"])
    assert.equal(r.headers[key], "no-store");
  assert.equal(r.headers["x-api-version"], "1");
  assert.equal(r.headers["referrer-policy"], "no-referrer");
  for (const key of [
    "authorization",
    "cookie",
    "x-expected-account",
    "x-api-version"
  ])
    assert.ok(String(r.headers.vary).toLowerCase().split(/,\s*/).includes(key));
  for (const key of ["set-cookie", "location", "access-control-allow-origin"])
    assert.equal(r.headers[key], undefined);
}
function ok(r: Result, owner: string) {
  assert.equal(r.status, 200, r.bytes.toString());
  privateResponse(r);
  return decodeApiResponse("createPost", JSON.parse(r.bytes.toString()), owner)
    .data;
}
function denied(r: Result, status: number, code: string) {
  assert.equal(r.status, status, r.bytes.toString());
  privateResponse(r);
  assert.equal(
    apiFailure.parse(JSON.parse(r.bytes.toString())).error.code,
    code
  );
}

const webHeaders = (actor: Actor) => ({
  Origin: origin,
  Cookie: sessionCookieFixtureName(origin) + "=" + actor.token,
  "X-Expected-Account": actor.id
});

test("trusted HTTPS website and native direct publication share the exact canonical receipt in both directions", async () => {
  for (const first of ["native", "web"]) {
    const actor = await createPortalActor(db, "directhttp"),
      input = change({ content: "Fictional raw\r\npost publication" });
    const native = () => send(target, actor, input);
    const web = () =>
      send(
        "/api/platform/posts",
        null,
        { operation: "create", ...input },
        webHeaders(actor)
      );
    if (first === "native") ok(await native(), actor.id);
    else assert.equal((await web()).status, 200);
    const receipt = ok(await native(), actor.id),
      webReply = await web();
    assert.equal(webReply.status, 200, webReply.bytes.toString());
    assert.deepEqual(JSON.parse(webReply.bytes.toString()), receipt);
    assert.equal(
      await db.platformPost.count({
        where: { requestKey: input.requestKey, authorId: actor.id }
      }),
      1
    );
    assert.equal(
      await db.socialOperation.count({
        where: { ownerId: actor.id, key: key(input.requestKey) }
      }),
      1
    );
    assert.equal(
      await db.privatePostDraft.count({ where: { ownerId: actor.id } }),
      0
    );
    const read = await send(target + "/" + receipt.id, actor);
    privateResponse(read);
    const row = decodeApiResponse(
      "post",
      JSON.parse(read.bytes.toString()),
      actor.id
    ).data;
    assert.equal(row.id, receipt.id);
    assert.equal(row.body.text, "Fictional raw\npost publication");
    denied(
      await send(target, actor, { ...input, content: row.body.text }),
      409,
      "conflict"
    );
  }
});

test("trusted HTTPS publication rejects browser authority, foreign owners, unsupported controls and malformed input", async () => {
  const actor = await createPortalActor(db, "posthttpadmission"),
    other = await createPortalActor(db, "posthttpother"),
    input = change();
  denied(await send(target, null, input), 401, "unauthenticated");
  denied(
    await send(target, null, input, {
      Cookie: sessionCookieFixtureName(origin) + "=" + actor.token
    }),
    401,
    "unauthenticated"
  );
  denied(
    await send(target, actor, input, { Origin: origin }),
    403,
    "forbidden"
  );
  denied(
    await send(target, actor, input, { "Sec-Fetch-Site": "same-origin" }),
    403,
    "forbidden"
  );
  denied(
    await send(target, actor, input, { "X-Expected-Account": other.id }),
    401,
    "account_changed"
  );
  denied(
    await send(target, actor, input, { "X-Expected-Account": "" }),
    400,
    "validation"
  );
  denied(
    await send(target, actor, input, { "X-API-Version": "2" }),
    426,
    "unsupported_version"
  );
  denied(
    await send(target + "?operation=create", actor, input),
    400,
    "validation"
  );
  for (const field of [
    "authorId",
    "operation",
    "mutationId",
    "draftId",
    "photos",
    "scheduleLocal",
    "groupId",
    "topicCommunityId",
    "resourceReferences"
  ]) {
    denied(
      await send(target, actor, { ...input, [field]: "forged" }),
      400,
      "validation"
    );
  }
  const method = await send(target, actor);
  denied(method, 405, "method_not_allowed");
  assert.equal(method.headers.allow, "POST");
  denied(
    await send(target, actor, input, {}, "DELETE"),
    405,
    "method_not_allowed"
  );
  denied(
    await send(target, actor, { ...input, content: "😀".repeat(10000) }),
    400,
    "validation"
  );
  assert.equal(
    await db.platformPost.count({ where: { authorId: actor.id } }),
    0
  );
  const capabilities = await send("/api/platform/v1/capabilities", null);
  const features = decodeApiResponse(
    "capabilities",
    JSON.parse(capabilities.bytes.toString()),
    null
  ).data.features;
  assert.equal(
    features.find((f) => f.name === "posts.create")?.available,
    true
  );
  assert.equal(
    features.find((f) => f.name === "posts.write")?.available,
    false
  );
});

test("trusted HTTPS publication retains current church authority and seeds actual website parity", async () => {
  const author = await createPortalActor(db, "posthttpchurch"),
    member = await createPortalActor(db, "posthttpmember"),
    outsider = await createPortalActor(db, "posthttpoutsider");
  const church = await db.church.create({
    data: {
      slug: "http-post-" + randomUUID(),
      name: "Fictional HTTPS publication church",
      summary: "Private fictional test audience"
    }
  });
  await db.churchConnection.createMany({
    data: [author, member].map((a) => ({
      churchId: church.id,
      userId: a.id,
      state: "APPROVED"
    }))
  });
  const grant = await db.churchCapabilityGrant.create({
    data: {
      churchId: church.id,
      userId: author.id,
      capability: "PUBLISH_CHURCH_POSTS"
    }
  });
  const input = change({
    authorChurchId: church.id,
    audienceChurchId: church.id,
    audience: "CHURCH",
    replyAudience: "CHURCH_MEMBERS"
  });
  const receipt = ok(await send(target, author, input), author.id);
  assert.equal((await send(target + "/" + receipt.id, member)).status, 200);
  denied(await send(target + "/" + receipt.id, outsider), 404, "not_found");
  denied(await send(target + "/" + receipt.id, null), 404, "not_found");
  await db.churchCapabilityGrant.delete({ where: { id: grant.id } });
  denied(await send(target, author, input), 403, "forbidden");
  const actor = await createPortalActor(db, "postbrowser");
  const nativeInput = change({
    content: "Fictional native post for website parity " + randomUUID()
  });
  const nativeReceipt = ok(await send(target, actor, nativeInput), actor.id);
  writeFileSync(
    join(
      dirname(process.env.ACCOUNT_TEST_SINK_DIR!),
      "post-publishing-browser-fixture.json"
    ),
    JSON.stringify({ actor, nativeInput, nativeReceipt }, null, 2),
    { flag: "wx", mode: 0o600 }
  );
});
