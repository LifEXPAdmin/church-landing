import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { parse, type DefaultTreeAdapterMap } from "parse5";
import { seedSharing } from "./seed-sharing";
import { assertPortalTestDatabase } from "./seed-portal";

const db = new PrismaClient(),
  origin = process.env.ACCOUNT_ORIGIN!;
assert.match(origin, /^https:\/\/127\.0\.0\.1:\d+$/);
before(() => assertPortalTestDatabase(db));
after(() => db.$disconnect());
const get = (url: string, token = "") =>
  fetch(new URL(url, origin), {
    headers: {
      "User-Agent": "Twitterbot/1.0",
      cookie: `church_platform_session=${token}`
    }
  });
async function metadata(path: string, token = "") {
  const response = await get(path, token);
  assert.match(response.headers.get("cache-control")!, /no-store/);
  const tags: Record<string, string> = {};
  function visit(node: DefaultTreeAdapterMap["node"]) {
    if ("tagName" in node && node.tagName === "meta") {
      const attrs = Object.fromEntries(
        node.attrs.map((a) => [a.name, a.value])
      );
      if (attrs.property || attrs.name)
        tags[attrs.property || attrs.name] = attrs.content;
    }
    if ("childNodes" in node) node.childNodes.forEach(visit);
  }
  visit(parse(await response.text()));
  return tags;
}
async function png(url: string, token = "") {
  const response = await get(url, token);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type")!, /^image\/png/);
  const image = Buffer.from(await response.arrayBuffer());
  assert.deepEqual(
    image.subarray(0, 8),
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  );
  assert.equal(image.readUInt32BE(16), 1200);
  assert.equal(image.readUInt32BE(20), 630);
  if (new URL(url, origin).pathname.startsWith("/api/"))
    for (const header of [
      "cache-control",
      "cdn-cache-control",
      "vercel-cdn-cache-control"
    ])
      assert.match(response.headers.get(header)!, /no-store/);
  return image;
}

test("actual production HTTPS crawler HTML points to public-only PNGs; the old image URL is revoked with its source", async () => {
  const f = await seedSharing(db),
    fallback = await png("/brand/share-card.png");
  const sources = [
    {
      path: `/platform/posts/${f.post.id}`,
      title: f.author.name,
      revoke: () =>
        db.platformPost.update({
          where: { id: f.post.id },
          data: {
            audience: "CHURCH",
            audienceChurchId: f.church.id,
            content: "PRIVATE IMAGE SECRET"
          }
        })
    },
    {
      path: `/platform/churches/${f.church.id}`,
      title: f.church.name,
      revoke: () =>
        db.church.update({
          where: { id: f.church.id },
          data: { communityListed: false }
        })
    },
    {
      path: `/platform/events/${f.occurrence.id}`,
      title: f.occurrence.title,
      revoke: () =>
        db.calendarEvent.update({
          where: { id: f.event.id },
          data: { visibility: "PRIVATE" }
        })
    }
  ];
  for (const source of sources) {
    const tags = await metadata(source.path);
    assert.ok(tags["og:title"].includes(source.title));
    assert.equal(tags["og:url"], origin + source.path);
    assert.equal(tags["og:image:width"], "1200");
    assert.equal(tags["og:image:height"], "630");
    assert.equal(tags["twitter:card"], "summary_large_image");
    assert.equal(tags["twitter:image"], tags["og:image"]);
    assert.ok(tags["og:image:alt"].includes("God’s Churches"));
    const imageUrl = new URL(tags["og:image"]);
    assert.equal(imageUrl.origin, origin);
    assert.equal(imageUrl.searchParams.get("format"), "png");
    assert.notDeepEqual(await png(imageUrl.href), fallback);
    assert.ok(!JSON.stringify(tags).includes(f.church.publicEmail!));
    const optimizer = await get(
      "/_next/image?" +
        new URLSearchParams({
          url: imageUrl.pathname + imageUrl.search,
          w: "640",
          q: "75"
        })
    );
    assert.equal(
      optimizer.status,
      400,
      "Withdrawable cards must not enter the public optimizer cache"
    );
    await source.revoke();
    for (const token of ["", f.author.token]) {
      assert.deepEqual(await png(imageUrl.href, token), fallback);
      const hidden = await metadata(source.path, token);
      // Next's not-found boundary can use the site's generic root metadata.
      // Both generic titles are safe; neither may retain former source copy.
      assert.ok(
        ["God’s Churches", "God’s Churches | The Revival"].includes(
          hidden["og:title"]
        )
      );
      assert.equal(hidden["og:image"], origin + "/brand/share-card.png");
      assert.ok(!JSON.stringify(hidden).includes("PRIVATE IMAGE SECRET"));
      assert.ok(!JSON.stringify(hidden).includes(source.title));
    }
  }
});

test("actual HTTPS missing, invalid and profile cards use the same generic PNG and cannot accept caller-supplied content", async () => {
  const f = await seedSharing(db),
    fallback = await png("/brand/share-card.png");
  for (const query of [
    "format=png",
    "format=png&kind=post&id=missing-card",
    "format=png&kind=admin&id=secret",
    "format=png&kind=profile&id=" + f.author.username,
    "format=png&title=INJECTED&image=https://elsewhere.test/image&width=500000"
  ])
    assert.deepEqual(
      await png("/api/platform/share-preview?" + query, f.author.token),
      fallback
    );
  const tags = await metadata(
    "/platform/profile/" + f.author.username,
    f.author.token
  );
  assert.equal(tags["og:title"], "God’s Churches");
  assert.ok(!JSON.stringify(tags).includes(f.author.name));
  assert.equal(
    (
      await get(
        "/api/platform/share-preview?format=svg&kind=post&id=" + f.post.id
      )
    ).status,
    400
  );
  assert.equal(
    (await get("/api/platform/share-preview?kind=admin&id=secret")).status,
    400
  );
});
