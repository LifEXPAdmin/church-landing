import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { parse, type DefaultTreeAdapterMap } from "parse5";
import { seedSharing } from "./seed-sharing";
import { assertPortalTestDatabase } from "./seed-portal";
const db = new PrismaClient(),
  origin = process.env.ACCOUNT_ORIGIN!;
assert.match(origin, /^https:\/\/127\.0\.0\.1:\d+$/);
before(() => assertPortalTestDatabase(db));
after(() => db.$disconnect());
const get = (path: string, token = "", agent = "Googlebot") =>
  fetch(new URL(path, origin), {
    headers: { cookie: "church_platform_session=" + token, "User-Agent": agent }
  });
async function page(path: string, token = "", agent = "Googlebot") {
  const response = await get(path, token, agent),
    html = await response.text(),
    tags: Record<string, string> = {},
    structured: Record<string, unknown>[] = [];
  const walk = (node: DefaultTreeAdapterMap["node"]) => {
    if ("tagName" in node) {
      const a = Object.fromEntries(node.attrs.map((a) => [a.name, a.value]));
      if (node.tagName === "meta") tags[a.name ?? a.property] = a.content;
      if (node.tagName === "link" && a.rel === "canonical")
        tags.canonical = a.href;
      if (node.tagName === "title")
        tags.title = node.childNodes
          .filter((n) => n.nodeName === "#text")
          .map((n) => (n as DefaultTreeAdapterMap["textNode"]).value)
          .join("");
      if (node.tagName === "script" && a.type === "application/ld+json")
        structured.push(
          JSON.parse(
            node.childNodes
              .map((n) => (n as DefaultTreeAdapterMap["textNode"]).value)
              .join("")
          )
        );
    }
    if ("childNodes" in node) node.childNodes.forEach(walk);
  };
  walk(parse(html));
  return { response, html, tags, structured };
}
const locs = (xml: string) =>
  [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) =>
    m[1].replace(/&amp;/g, "&")
  );
async function sitemap(kind: string) {
  const index = await get("/sitemap.xml");
  assert.equal(index.status, 200);
  const children = locs(await index.text()).filter(
    (url) => new URL(url).searchParams.get("kind") === kind
  );
  const pages: string[] = [];
  for (const url of children) {
    assert.equal(new URL(url).origin, origin);
    const response = await get(url);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("cache-control")!, /no-store/);
    const body = await response.text();
    assert.ok(locs(body).length <= 500);
    pages.push(body);
  }
  return pages.join("\n");
}
test("actual public crawler, guest and member HTML share current canonical metadata and supplied structured facts", async () => {
  const f = await seedSharing(db);
  for (const token of ["", f.author.token])
    for (const agent of ["Googlebot", "Mozilla/5.0"]) {
      for (const [kind, id] of [
        ["churches", f.church.id],
        ["events", f.occurrence.id],
        ["posts", f.post.id]
      ]) {
        const path = "/platform/" + kind + "/" + id,
          p = await page(path, token, agent);
        assert.equal(p.response.status, 200);
        assert.match(p.response.headers.get("cache-control")!, /no-store/);
        assert.doesNotMatch(
          p.response.headers.get("x-robots-tag") ?? "",
          /noindex/
        );
        assert.doesNotMatch(p.tags.robots, /noindex/);
        assert.equal(p.tags.canonical, origin + path);
        assert.equal(p.tags["og:url"], origin + path);
        assert.match(p.tags.title, / \| God’s Churches$/);
        assert.ok(
          !JSON.stringify([p.tags, p.structured]).includes(f.author.email)
        );
        assert.ok(
          !JSON.stringify([p.tags, p.structured]).includes(f.church.publicEmail)
        );
        if (kind === "churches") {
          assert.equal(p.structured[0]["@type"], "Organization");
          assert.equal(p.structured[0].name, f.church.name);
          assert.ok(p.html.includes("Community listing"));
        }
        if (kind === "events") {
          assert.equal(p.structured[0].startDate, "2026-10-01T10:00:00.000Z");
          assert.ok(!Object.hasOwn(p.structured[0], "location"));
        }
        if (kind === "posts") assert.ok(p.tags.title.includes(f.post.content));
      }
    }
  await db.church.update({ where: { id: f.church.id }, data: { summary: "" } });
  const emptyChurch = await page("/platform/churches/" + f.church.id);
  assert.match(emptyChurch.tags.description, /View public church details/);
  assert.equal(
    emptyChurch.tags.description,
    emptyChurch.tags["og:description"]
  );
  await db.calendarOccurrence.update({
    where: { id: f.occurrence.id },
    data: { description: "" }
  });
  const emptyEvent = await page("/platform/events/" + f.occurrence.id);
  assert.match(emptyEvent.tags.description, /Read the published event details/);
  assert.equal(emptyEvent.tags.description, emptyEvent.tags["og:description"]);
});
test("public sitemap index covers current shards, static information and eligible resources with true optional dates", async () => {
  const f = await seedSharing(db),
    r = await get("/sitemap.xml");
  assert.equal(r.status, 200);
  assert.match(r.headers.get("content-type")!, /application\/xml/);
  assert.match(r.headers.get("cache-control")!, /no-store/);
  const index = await r.text();
  assert.ok(index.includes("<sitemapindex"));
  assert.ok(locs(index).every((url) => new URL(url).origin === origin));
  for (const [kind, id] of [
    ["churches", f.church.id],
    ["posts", f.post.id],
    ["events", f.occurrence.id]
  ])
    assert.ok(
      (await sitemap(kind)).includes(id),
      kind + " includes its current source across all batches"
    );
  const site = await sitemap("site");
  for (const path of ["/platform", "/about", "/help"])
    assert.ok(locs(site).includes(origin + path));
  assert.ok(!site.includes("lastmod"));
  const robots = await (await get("/robots.txt")).text();
  assert.ok(robots.includes("Sitemap: " + origin + "/sitemap.xml"));
  assert.ok(!robots.includes("Disallow: /admin"));
});
test("tracking is canonicalized, filtered pages remain excluded and valid directory continuation keeps its identity", async () => {
  const f = await seedSharing(db);
  const invalidZone = await page(
    "/platform/events/" + f.occurrence.id + "?timeZone=not-a-zone"
  );
  assert.match(invalidZone.tags.robots, /noindex/);
  assert.equal(invalidZone.structured.length, 0);
  const validZone = await page(
    "/platform/events/" + f.occurrence.id + "?timeZone=America%2FChicago"
  );
  assert.doesNotMatch(validZone.tags.robots, /noindex/);
  assert.equal(
    validZone.tags.canonical,
    origin + "/platform/events/" + f.occurrence.id
  );
  const home = await page("/platform?utm_source=fixture");
  assert.equal(home.tags.canonical, origin + "/platform");
  assert.doesNotMatch(home.tags.robots, /noindex/);
  assert.equal(home.structured[0]["@type"], "WebSite");
  for (const path of [
    "/platform?post=fixture&mode=pages",
    "/platform/churches?q=unmatched-fixture",
    "/platform/topics?mine=1",
    "/platform/search?q=fixture"
  ]) {
    const p = await page(path);
    assert.match(p.tags.robots, /noindex/);
  }
  const rows = Array.from({ length: 102 }, (_, i) => ({
    name: "Fictional page " + i,
    slug: randomUUID(),
    summary: "Public page fixture",
    communityListed: false
  }));
  await db.church.createMany({ data: rows });
  const first = await page("/platform/churches"),
    m = first.html.match(/href="([^\"]*cursor=[^\"]*)"[^>]*>More churches/);
  assert.ok(m, "Actual directory must expose a crawlable next page");
  const path = m[1].replace(/&amp;/g, "&"),
    next = await page(path);
  assert.equal(next.tags.canonical, origin + path);
  assert.doesNotMatch(next.tags.robots, /noindex/);
  assert.notEqual(next.tags.canonical, first.tags.canonical);
});
test("private routes and sensitive posts retain noindex without private metadata or structured-data expansion", async () => {
  const f = await seedSharing(db);
  for (const path of [
    "/platform/signup",
    "/platform/login",
    "/platform/account/recover",
    "/platform/profile/" + f.author.username,
    "/platform/getting-started",
    "/platform/churches/" + f.church.id + "/directory",
    "/platform/demo"
  ]) {
    const p = await page(path);
    assert.match(
      p.response.headers.get("x-robots-tag") ?? p.tags.robots ?? "",
      /noindex/
    );
    assert.ok(!JSON.stringify([p.tags, p.structured]).includes(f.author.email));
  }
  const prayer = await db.platformPost.create({
    data: {
      authorId: f.author.id,
      type: "PRAYER",
      content: "Public prayer body excluded from search copy"
    }
  });
  const p = await page("/platform/posts/" + prayer.id);
  assert.match(p.tags.robots, /noindex/);
  assert.ok(!JSON.stringify(p.tags).includes(prayer.content));
  assert.ok(!(await sitemap("posts")).includes(prayer.id));
  await db.platformPost.update({
    where: { id: prayer.id },
    data: { safeExcerpt: "My explicitly supplied public introduction" }
  });
  const allowed = await page("/platform/posts/" + prayer.id);
  assert.doesNotMatch(allowed.tags.robots, /noindex/);
  assert.ok(allowed.tags.description.includes("explicitly supplied"));
});
test("audience changes and cancellation remove indexing and structured data while controlled old image URLs fall back", async () => {
  const f = await seedSharing(db);
  for (const [kind, id, change] of [
    [
      "posts",
      f.post.id,
      () =>
        db.platformPost.update({
          where: { id: f.post.id },
          data: {
            audience: "CHURCH",
            audienceChurchId: f.church.id,
            content: "PRIVATE SEO SECRET"
          }
        })
    ],
    [
      "events",
      f.occurrence.id,
      () =>
        db.calendarEvent.update({
          where: { id: f.event.id },
          data: { visibility: "PRIVATE" }
        })
    ]
  ] as const) {
    const path = "/platform/" + kind + "/" + id,
      initial = await page(path);
    const oldImage = initial.tags["og:image"];
    await change();
    for (const token of ["", f.author.token]) {
      const p = await page(path, token);
      assert.match(p.tags.robots, /noindex/);
      assert.equal(p.structured.length, 0);
      assert.ok(!JSON.stringify(p.tags).includes("PRIVATE SEO SECRET"));
    }
    assert.ok(!(await sitemap(kind)).includes(id));
    const current = Buffer.from(await (await get(oldImage)).arrayBuffer()),
      fallback = Buffer.from(
        await (await get("/brand/share-card.png")).arrayBuffer()
      );
    assert.deepEqual(current, fallback);
  }
  await db.calendarEvent.update({
    where: { id: f.event.id },
    data: { visibility: "PUBLIC", canceledAt: new Date() }
  });
  const canceled = await page("/platform/events/" + f.occurrence.id);
  assert.ok(canceled.html.includes("Canceled"));
  assert.match(canceled.tags.robots, /noindex/);
  assert.equal(canceled.structured.length, 0);
});
