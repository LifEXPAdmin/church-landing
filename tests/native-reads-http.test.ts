import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { request as httpsRequest } from "node:https";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { assertPortalTestDatabase, createPortalActor } from "./seed-portal";
import { decodeApiResponse } from "../lib/platform/api-contracts";
import { sessionCookieFixtureName } from "../scripts/session-cookie-fixture.mjs";
const db = new PrismaClient(),
  origin = process.env.ACCOUNT_ORIGIN!;
assert.match(origin, /^https:\/\/127\.0\.0\.1:\d+$/);
before(() => assertPortalTestDatabase(db));
after(() => db.$disconnect());
// Native networking has no browser-generated Origin, cookies or Fetch Metadata.
function send(
  path: string,
  method = "GET",
  body?: unknown,
  headers: Record<string, string> = {}
) {
  const data = body === undefined ? undefined : JSON.stringify(body);
  return new Promise<{
    status: number;
    headers: import("node:http").IncomingHttpHeaders;
    value: unknown;
  }>((resolve, reject) => {
    const request = httpsRequest(
      origin + path,
      {
        method,
        headers: {
          ...(data === undefined
            ? {}
            : {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(data)
              }),
          ...headers
        },
        timeout: 30000
      },
      (response) => {
        let raw = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          raw += chunk;
        });
        response.once("error", reject);
        response.once("end", () => {
          try {
            resolve({
              status: response.statusCode!,
              headers: response.headers,
              value: raw ? JSON.parse(raw) : null
            });
          } catch {
            reject(new Error("Native HTTPS response was not JSON"));
          }
        });
      }
    );
    request.once("error", reject);
    request.once("timeout", () =>
      request.destroy(new Error("Native HTTPS request timed out"))
    );
    request.end(data);
  });
}
const headers = (token: string, owner?: string) => ({
  Authorization: "Bearer " + token,
  ...(owner ? { "X-Expected-Account": owner } : {})
});
function privateResponse(response: Awaited<ReturnType<typeof send>>) {
  assert.match(String(response.headers["cache-control"]), /private.*no-store/);
  assert.match(
    String(response.headers.vary),
    /Authorization.*Cookie.*X-Expected-Account/i
  );
  assert.equal(response.headers["set-cookie"], undefined);
  assert.equal(response.headers["access-control-allow-origin"], undefined);
}

test("HTTPS native core routes return bounded versioned JSON with current viewer and private headers", async () => {
  const actor = await createPortalActor(db, "readhttp");
  const church = await db.church.create({
    data: {
      name: "Native HTTPS church",
      summary: "Fictional church",
      slug: randomUUID()
    }
  });
  const post = await db.platformPost.create({
    data: {
      authorId: actor.id,
      content: "Fictional HTTPS native post",
      publishedAt: new Date(Date.now() - 1000)
    }
  });
  const cases = [
    ["capabilities", "/capabilities"],
    ["feed", "/feed?mode=latest"],
    ["post", "/posts/" + post.id],
    ["profile", "/profiles/" + actor.username],
    ["churches", "/churches?query=Native"],
    ["church", "/churches/" + church.id]
  ] as const;
  for (const [operation, path] of cases) {
    const response = await send(
      "/api/platform/v1" + path,
      "GET",
      undefined,
      headers(actor.token, actor.id)
    );
    assert.equal(response.status, 200, JSON.stringify(response.value));
    privateResponse(response);
    assert.equal(
      decodeApiResponse(operation, response.value, actor.id).viewerId,
      actor.id
    );
    const guest = await send("/api/platform/v1" + path);
    assert.equal(guest.status, operation === "profile" ? 401 : 200);
    privateResponse(guest);
    if (operation !== "profile")
      assert.equal(
        decodeApiResponse(operation, guest.value, null).viewerId,
        null
      );
  }
  // Existing website read routes still serve the same public card.
  const web = await new Promise<string>((resolve, reject) => {
    const request = httpsRequest(
      origin + "/platform/posts/" + post.id,
      {},
      (response) => {
        let text = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          text += chunk;
        });
        response.once("end", () => resolve(text));
        response.once("error", reject);
      }
    );
    request.once("error", reject);
    request.end();
  });
  assert.ok(web.includes(post.content));
});
test("HTTPS read routes reject mixed credentials, duplicate input, unknown fields and unsupported methods", async () => {
  const actor = await createPortalActor(db, "readguard");
  const path = "/api/platform/v1/churches";
  for (const [extra, status] of [
    [{ Authorization: "Bearer invalid" }, 401],
    [
      {
        Authorization: "Bearer " + "x".repeat(43),
        "X-Expected-Account": actor.id
      },
      401
    ],
    [{ ...headers(actor.token, "other") }, 401],
    [{ ...headers(actor.token) }, 400],
    [
      {
        ...headers(actor.token, actor.id),
        Cookie: sessionCookieFixtureName(origin) + "=" + actor.token
      },
      401
    ],
    [{ Origin: origin }, 403],
    [{ "Sec-Fetch-Site": "none" }, 403],
    [{ Host: "wrong.example" }, 403]
  ] as const) {
    const response = await send(path, "GET", undefined, extra);
    assert.equal(response.status, status, JSON.stringify(response.value));
    privateResponse(response);
  }
  for (const query of [
    "?query=a&query=b",
    "?ownerId=other",
    "?cursor=unsigned",
    "?query=" + "a".repeat(101)
  ]) {
    const response = await send(path + query);
    assert.ok([400, 409].includes(response.status));
    privateResponse(response);
  }
  for (const method of ["POST", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
    const response = await send(path, method, {});
    assert.equal(response.status, 405);
    assert.equal(response.headers.allow, "GET");
    privateResponse(response);
  }
  const missing = await send("/api/platform/v1/posts/absent-fictional");
  assert.equal(missing.status, 404);
  privateResponse(missing);
});
test("HTTPS signed profile continuation reauthorizes current audience and rejects altered cursors", async () => {
  const actor = await createPortalActor(db, "readpage");
  const ids = Array.from({ length: 31 }, () => randomUUID())
    .sort()
    .reverse();
  await db.platformPost.createMany({
    data: ids.map((id) => ({
      id,
      authorId: actor.id,
      content: "HTTPS page " + id,
      publishedAt: new Date(Date.now() - 1000)
    }))
  });
  const path = "/api/platform/v1/profiles/" + actor.username;
  const first = await send(
    path,
    "GET",
    undefined,
    headers(actor.token, actor.id)
  );
  assert.equal(first.status, 200);
  const page = decodeApiResponse("profile", first.value, actor.id).data.posts;
  assert.equal(page.items.length, 30);
  assert.ok(page.nextCursor);
  const cursor = page.nextCursor;
  const next = await send(
    path + "?cursor=" + cursor,
    "GET",
    undefined,
    headers(actor.token, actor.id)
  );
  assert.equal(next.status, 200);
  const rows = decodeApiResponse("profile", next.value, actor.id).data.posts;
  assert.equal(rows.items.length, 1);
  assert.equal(rows.nextCursor, null);
  await db.platformPost.update({
    where: { id: rows.items[0].id },
    data: { withdrawnAt: new Date() }
  });
  const gone = await send(
    path + "?cursor=" + cursor,
    "GET",
    undefined,
    headers(actor.token, actor.id)
  );
  assert.equal(gone.status, 200);
  assert.equal(
    decodeApiResponse("profile", gone.value, actor.id).data.posts.items.length,
    0
  );
  const tampered = await send(
    path + "?cursor=" + cursor + "x",
    "GET",
    undefined,
    headers(actor.token, actor.id)
  );
  assert.equal(tampered.status, 409);
  privateResponse(tampered);
});
