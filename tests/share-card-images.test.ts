import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { PrismaClient } from "@prisma/client";
import { shareCardSvg } from "../lib/share-card";
import {
  defaultShareCard,
  renderShareCard
} from "../lib/platform/share-card-image";
import { sharePreviewResponse } from "../lib/platform/share-preview-response";
import { publicSharePreview } from "../lib/platform/public-sharing";
import { seedSharing } from "./seed-sharing";
import { assertPortalTestDatabase, createPortalActor } from "./seed-portal";
import { relationshipCommand } from "../lib/platform/relationships";
import { randomUUID } from "node:crypto";

const db = new PrismaClient();
before(() => assertPortalTestDatabase(db));
after(() => db.$disconnect());
const origin = process.env.ACCOUNT_ORIGIN!;
const request = (kind = "", id = "", token = "") =>
  new Request(
    origin +
      "/api/platform/share-preview?format=png" +
      (kind ? "&" + new URLSearchParams({ kind, id }) : ""),
    { headers: { cookie: `church_platform_session=${token}` } }
  );
const bytes = async (response: Response) => {
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type")!, /^image\/png/);
  for (const header of [
    "cache-control",
    "cdn-cache-control",
    "vercel-cdn-cache-control"
  ])
    assert.match(response.headers.get(header)!, /no-store/);
  const buffer = Buffer.from(await response.arrayBuffer());
  const image = await sharp(buffer).metadata();
  assert.equal(image.width, 1200);
  assert.equal(image.height, 630);
  return buffer;
};

test("the shared brand layout escapes hostile copy and renders bounded PNGs without any remote font or image fetch", async () => {
  const fetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw Error("No network permitted while rendering");
  };
  try {
    const hostile = {
      title: '<script src="https://example.test"/>',
      description: '</span><img src="file:///private"/>&'
    };
    const svg = shareCardSvg(hostile);
    assert.ok(!svg.includes("<script") && !svg.includes("<img"));
    assert.ok(svg.includes("&lt;") && svg.includes("&amp;"));
    const samples = [
      {},
      hostile,
      { title: "Espérance · Ελπίδα · Мир" },
      {
        title: "W".repeat(1000),
        description: "Long public sample ".repeat(100)
      }
    ];
    for (const input of samples) {
      const output = await renderShareCard(input);
      const m = await sharp(output).metadata();
      assert.equal(m.width, 1200);
      assert.equal(m.height, 630);
      assert.ok(output.length < 150000);
    }
    assert.deepEqual(
      await renderShareCard({ title: "平安" }),
      await defaultShareCard()
    );
  } finally {
    globalThis.fetch = fetch;
  }
});

test("public post, church and event image URLs come only from canonical projections and ignore injected copy or image URLs", async () => {
  const f = await seedSharing(db);
  for (const [kind, id] of [
    ["post", f.post.id],
    ["church", f.church.id],
    ["event", f.occurrence.id]
  ]) {
    const preview = await publicSharePreview(db, { kind, id });
    assert.equal(preview.available, true);
    const url = new URL(preview.image.url);
    assert.equal(url.origin, origin);
    assert.equal(url.searchParams.get("format"), "png");
    assert.equal(url.searchParams.get("kind"), kind);
    assert.equal(url.searchParams.get("id"), id);
    assert.ok(!JSON.stringify(preview).includes(f.church.publicEmail!));
    const response = await sharePreviewResponse(
      db,
      new Request(
        url + "&title=INJECTED&image=http://127.0.0.1/secret&width=100000"
      )
    );
    const output = await bytes(response);
    assert.notDeepEqual(output, await defaultShareCard());
  }
});

test("the same former public image URL becomes generic after restriction, draft, withdrawal, deletion or viewer block", async () => {
  const f = await seedSharing(db);
  const preview = await publicSharePreview(db, { kind: "post", id: f.post.id });
  const original = await bytes(
    await sharePreviewResponse(db, new Request(preview.image.url))
  );
  for (const change of [
    { audience: "CHURCH" as const, audienceChurchId: f.church.id },
    { status: "DRAFT" as const },
    { status: "WITHDRAWN" as const, withdrawnAt: new Date() },
    { moderationState: "HIDDEN" as const }
  ]) {
    await db.platformPost.update({ where: { id: f.post.id }, data: change });
    for (const token of ["", f.author.token])
      assert.deepEqual(
        await bytes(
          await sharePreviewResponse(db, request("post", f.post.id, token))
        ),
        await defaultShareCard()
      );
    await db.platformPost.update({
      where: { id: f.post.id },
      data: {
        audience: "PUBLIC",
        audienceChurchId: null,
        status: "PUBLISHED",
        withdrawnAt: null,
        moderationState: "VISIBLE"
      }
    });
  }
  const viewer = await createPortalActor(db, "imageblock");
  await relationshipCommand(db, viewer.token, {
    operation: "block",
    mutationId: randomUUID(),
    kind: "person",
    targetId: f.author.id,
    expectedVersion: 0,
    desired: true
  });
  assert.deepEqual(
    await bytes(
      await sharePreviewResponse(db, request("post", f.post.id, viewer.token))
    ),
    await defaultShareCard()
  );
  assert.deepEqual(
    await bytes(await sharePreviewResponse(db, new Request(preview.image.url))),
    original,
    "A signed-in block cannot remove an otherwise public preview for the internet"
  );
  await db.platformPost.delete({ where: { id: f.post.id } });
  assert.deepEqual(
    await bytes(await sharePreviewResponse(db, new Request(preview.image.url))),
    await defaultShareCard()
  );
});

test("source restriction during PNG rendering discards the earlier public projection before responding", async () => {
  const f = await seedSharing(db);
  const response = await sharePreviewResponse(
    db,
    request("post", f.post.id),
    async (input) => {
      await db.platformPost.update({
        where: { id: f.post.id },
        data: {
          audience: "CHURCH",
          audienceChurchId: f.church.id,
          content: "New private source text"
        }
      });
      return renderShareCard(input);
    }
  );
  assert.deepEqual(await bytes(response), await defaultShareCard());
});

test("church removal, event restriction/cancellation and member profiles never leave a controlled public derivative", async () => {
  const f = await seedSharing(db);
  await db.church.update({
    where: { id: f.church.id },
    data: { communityListed: false }
  });
  assert.deepEqual(
    await bytes(await sharePreviewResponse(db, request("church", f.church.id))),
    await defaultShareCard()
  );
  await db.calendarEvent.update({
    where: { id: f.event.id },
    data: { visibility: "PRIVATE" }
  });
  assert.deepEqual(
    await bytes(
      await sharePreviewResponse(
        db,
        request("event", f.occurrence.id, f.author.token)
      )
    ),
    await defaultShareCard()
  );
  await db.calendarEvent.update({
    where: { id: f.event.id },
    data: { visibility: "PUBLIC", canceledAt: new Date() }
  });
  assert.deepEqual(
    await bytes(
      await sharePreviewResponse(db, request("event", f.occurrence.id))
    ),
    await defaultShareCard()
  );
  assert.deepEqual(
    await bytes(
      await sharePreviewResponse(
        db,
        request("profile", f.author.username, f.author.token)
      )
    ),
    await defaultShareCard()
  );
});

test("missing sources, invalid parameters, renderer failure and source-service outages return actual safe fallback PNGs", async () => {
  const f = await seedSharing(db);
  for (const [kind, id] of [
    ["", ""],
    ["post", "missing-image-source"],
    ["admin", "https://elsewhere.test"]
  ])
    assert.deepEqual(
      await bytes(await sharePreviewResponse(db, request(kind, id))),
      await defaultShareCard()
    );
  assert.deepEqual(
    await bytes(
      await sharePreviewResponse(db, request("post", f.post.id), async () => {
        throw Error("Fictional render failure");
      })
    ),
    await defaultShareCard()
  );
  const unavailable = {
    $transaction: async () => {
      throw Error("Fictional database outage");
    }
  } as unknown as PrismaClient;
  assert.deepEqual(
    await bytes(
      await sharePreviewResponse(unavailable, request("post", f.post.id))
    ),
    await defaultShareCard()
  );
});
