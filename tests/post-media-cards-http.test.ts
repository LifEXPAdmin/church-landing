import { sessionCookie } from "../lib/platform/account-boundary";
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  assertPortalTestDatabase,
  createPortalActor,
  type PortalActor
} from "./seed-portal";
import { mediaCatalogCommand } from "../lib/platform/media-catalog-commands";
import { mediaFields } from "../lib/platform/media-catalog-input";
import { MEDIA_POLICY } from "../lib/platform/media-catalog-options";
const db = new PrismaClient(),
  origin = process.env.ACCOUNT_ORIGIN!;
let actor: PortalActor, other: PortalActor, mediaId: string, title: string;
assert.match(origin, /^https:\/\/127\.0\.0\.1:\d+$/);
before(async () => {
  await assertPortalTestDatabase(db);
  actor = await createPortalActor(db, "mediacardhttp");
  other = await createPortalActor(db, "mediahttpother");
  title = "Resource metadata " + randomUUID();
  const fields = mediaFields({
    title,
    description: "Private source detail",
    format: "SERMON",
    presentation: "VIDEO",
    audience: "PUBLIC",
    details: { preachedOn: null },
    sourceUrl: "https://youtu.be/abcdefghijk"
  });
  const review = {
    fields,
    acknowledgment: {
      policy: MEDIA_POLICY,
      sourceUrl: fields.sourceUrl,
      audience: fields.audience,
      accepted: true
    },
    rights: {
      basis: "OWN",
      reviewed: true,
      publicRecording: true,
      textRights: true,
      evidenceReference: "private-http-evidence"
    }
  };
  const draft = await mediaCatalogCommand(db, actor.token, {
    operation: "create",
    ownerChurchId: null,
    mutationId: randomUUID(),
    ...review
  });
  const row = await mediaCatalogCommand(db, actor.token, {
    operation: "publish",
    mutationId: randomUUID(),
    itemId: draft.id,
    expectedVersion: draft.version,
    ...review
  });
  mediaId = row.id;
});
after(() => db.$disconnect());
function get(
  path: string,
  user: PortalActor | null = null,
  rsc = false,
  expected?: string
) {
  return fetch(origin + path, {
    headers: {
      ...(user
        ? {
            cookie: sessionCookie(
              user.token,
              new URL(origin).protocol === "https:"
            ).split(";", 1)[0]
          }
        : {}),
      ...(expected ? { "x-expected-account": expected } : {}),
      ...(rsc ? { RSC: "1" } : {})
    }
  });
}
function send(body: unknown, source = origin) {
  return fetch(origin + "/api/platform/posts", {
    method: "POST",
    headers: {
      origin: source,
      cookie: sessionCookie(
        actor.token,
        new URL(process.env.ACCOUNT_ORIGIN!).protocol === "https:"
      ).split(";", 1)[0],
      "x-expected-account": actor.id,
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });
}
test("HTTPS media card preview is owner-pinned, strictly bounded and private at every cache", async () => {
  const path = `/api/platform/post-resources?${new URLSearchParams({ references: JSON.stringify([{ kind: "mediaCatalogItem", id: mediaId }]) })}`;
  assert.equal((await get(path)).status, 401);
  assert.equal((await get(path, actor)).status, 401);
  assert.equal((await get(path, actor, false, other.id)).status, 401);
  assert.equal(
    (await get(path + "&extra=forged", actor, false, actor.id)).status,
    400
  );
  const response = await get(path, actor, false, actor.id);
  assert.equal(response.status, 200);
  for (const header of [
    "cache-control",
    "cdn-cache-control",
    "vercel-cdn-cache-control"
  ])
    assert.match(response.headers.get(header)!, /no-store/);
  assert.match(response.headers.get("x-robots-tag")!, /noindex/);
  const data = await response.json();
  assert.equal(data.resources[0].title, title);
  for (const forbidden of [
    actor.email,
    "private-http-evidence",
    "youtu",
    "Private source detail"
  ])
    assert.ok(!JSON.stringify(data).includes(forbidden));
});
test("HTTPS media card publishing stores one typed reference, rejects origins and forged metadata, and projects current cards only", async () => {
  const body = {
    operation: "create",
    requestKey: randomUUID(),
    content: "Fictional HTTPS attachment post",
    audience: "PUBLIC",
    resourceReferences: [{ kind: "mediaCatalogItem", id: mediaId }]
  };
  assert.equal((await send(body, "https://unrelated.example")).status, 403);
  assert.equal(
    (
      await send({
        ...body,
        resourceReferences: [
          { ...body.resourceReferences[0], title: "forged private title" }
        ]
      })
    ).status,
    400
  );
  const response = await send(body);
  assert.equal(response.status, 200);
  const post = await response.json();
  assert.equal((await (await send(body)).json()).id, post.id);
  const available = await get(
    `/api/platform/posts?view=availability-batch&postId=${post.id}`
  );
  assert.match(available.headers.get("cache-control")!, /no-store/);
  assert.equal((await available.json()).posts[0].resources[0].title, title);
  for (const rsc of [false, true]) {
    const response = await get(`/platform/posts/${post.id}`, null, rsc);
    assert.equal(response.status, 200);
    const body = await response.text();
    assert.ok(body.includes("Fictional HTTPS attachment post"));
    assert.ok(!body.includes(title));
    assert.ok(!body.includes(mediaId));
  }
  await db.mediaCatalogItem.update({
    where: { id: mediaId },
    data: { moderationState: "HIDDEN" }
  });
  const hidden = await get(
    `/api/platform/posts?view=availability-batch&postId=${post.id}`
  );
  const data = await hidden.json();
  assert.equal(data.posts[0].available, true);
  assert.deepEqual(data.posts[0].resources ?? [], []);
  assert.ok(!JSON.stringify(data).includes(mediaId));
  const revision = await send({
    operation: "edit",
    mutationId: randomUUID(),
    postId: post.id,
    expectedVersion: 1,
    resourceReferences: []
  });
  assert.equal(revision.status, 200);
  const row = await db.platformPost.findUniqueOrThrow({
    where: { id: post.id }
  });
  assert.ok(row.editedAt);
  assert.deepEqual(row.resourceReferences, []);
});
