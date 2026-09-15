import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  indexingEnvironment,
  publicPageIdentity
} from "../lib/indexing-policy";
import {
  publicSitemapResponse,
  sitemapPageSize
} from "../lib/platform/public-sitemap";
import {
  publicStructuredData,
  serializeStructuredData
} from "../lib/platform/public-structured-data";
import { seedSharing } from "./seed-sharing";
import { assertPortalTestDatabase } from "./seed-portal";
const db = new PrismaClient();
before(() => assertPortalTestDatabase(db));
after(() => db.$disconnect());
const origin = process.env.ACCOUNT_ORIGIN!;
async function sitemap(kind?: string, page?: number): Promise<string> {
  if (kind && page === undefined) {
    const index = await sitemap();
    const children = [...index.matchAll(/<loc>([^<]+)<\/loc>/g)]
      .map((match) => new URL(match[1].replace(/&amp;/g, "&")))
      .filter((url) => url.searchParams.get("kind") === kind);
    const pages: string[] = [];
    for (const child of children) {
      assert.equal(child.origin, origin);
      pages.push(await sitemap(kind, Number(child.searchParams.get("page"))));
    }
    return pages.join("\n");
  }
  const r = await publicSitemapResponse(
    db,
    new Request(
      origin +
        "/sitemap.xml" +
        (kind
          ? "?" + new URLSearchParams({ kind, page: String(page ?? 0) })
          : "")
    )
  );
  assert.equal(r.status, 200);
  for (const key of [
    "cache-control",
    "cdn-cache-control",
    "vercel-cdn-cache-control"
  ])
    assert.match(r.headers.get(key)!, /no-store/);
  return r.text();
}
test("only the canonical production environment or guarded isolated fixture opts into indexing; queries cannot select another host", () => {
  assert.deepEqual(
    indexingEnvironment({
      VERCEL_ENV: "production",
      NEXT_PUBLIC_SITE_URL: "https://godschurches.com"
    }),
    { origin: "https://godschurches.com", index: true }
  );
  for (const env of [
    { VERCEL_ENV: "preview", NEXT_PUBLIC_SITE_URL: "https://godschurches.com" },
    {
      VERCEL_ENV: "production",
      NEXT_PUBLIC_SITE_URL: "https://untrusted.test"
    },
    {
      ACCOUNT_TEST_ISOLATED: "1",
      NEXT_PUBLIC_SITE_URL: "https://127.0.0.1:1234",
      DATABASE_URL: "postgres://production.test/database"
    }
  ])
    assert.equal(indexingEnvironment(env).index, false);
  assert.deepEqual(
    publicPageIdentity(
      "/platform/churches",
      { cursor: "abc", utm_source: "sample" },
      ["cursor"]
    ),
    { path: "/platform/churches?cursor=abc", filtered: false, paginated: true }
  );
  assert.equal(
    publicPageIdentity("/platform/churches", { q: "private query" }).filtered,
    true
  );
  assert.equal(
    publicPageIdentity(
      "/platform/posts/abc",
      { before: "2026-09-15T01:00:00.000Z" },
      ["before", "cursor"]
    ).filtered,
    true
  );
  assert.equal(
    publicPageIdentity("/platform", { next: "https://untrusted.test" }).path,
    "/platform"
  );
});
test("sitemaps cover every current canonical church beyond the first 500, including official provenance, without invented modification dates", async () => {
  const prefix = "seo-" + randomUUID();
  const rows = Array.from({ length: sitemapPageSize + 1 }, (_, i) => ({
    id: prefix + "-" + String(i).padStart(4, "0"),
    slug: prefix + "-" + i,
    name: "Fictional sitemap church " + i,
    summary: "Public fixture",
    communityListed: i % 2 === 0
  }));
  await db.church.createMany({ data: rows });
  const index = await sitemap();
  assert.ok(index.includes("<sitemapindex"));
  const shards = [...index.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((m) => m[1].replace(/&amp;/g, "&"))
    .filter((url) => url.includes("kind=churches"));
  assert.ok(shards.length >= 2);
  const locations = new Set<string>();
  for (const url of shards) {
    const r = await publicSitemapResponse(db, new Request(url));
    assert.equal(r.status, 200);
    const text = await r.text();
    assert.ok(!text.includes("lastmod"));
    const found = [...text.matchAll(/<loc>([^<]+)<\/loc>/g)];
    assert.ok(found.length <= sitemapPageSize);
    for (const m of found) {
      assert.ok(!locations.has(m[1]));
      locations.add(m[1]);
    }
  }
  for (const row of rows)
    assert.ok(locations.has(origin + "/platform/churches/" + row.id));
  const site = await sitemap("site");
  assert.ok(site.includes(origin + "/platform</loc>"));
  assert.ok(!site.includes("lastmod"));
  assert.ok(!site.includes("/signup"));
  assert.ok(!site.includes("/platform/demo"));
  for (const query of [
    "kind=posts&page=-1",
    "kind=private&page=0",
    "kind=posts&page=0&page=1",
    "page=0",
    "kind=site&page=1",
    "kind=posts&page=0&secret=x"
  ]) {
    const r = await publicSitemapResponse(
      db,
      new Request(origin + "/sitemap.xml?" + query)
    );
    assert.ok([400, 404].includes(r.status));
  }
});
test("anonymous sitemap eligibility follows publication, sensitivity choices and actual source changes without revealing private drafts", async () => {
  const f = await seedSharing(db);
  await db.platformPost.update({
    where: { id: f.post.id },
    data: {
      publishedAt: new Date("2026-09-01T12:00:00Z"),
      editedAt: new Date("2026-09-02T13:00:00Z")
    }
  });
  const privatePost = await db.platformPost.create({
    data: {
      authorId: f.author.id,
      content: "PRIVATE-SITEMAP-BODY",
      audience: "CHURCH",
      audienceChurchId: f.church.id
    }
  });
  const prayer = await db.platformPost.create({
    data: {
      authorId: f.author.id,
      content: "SENSITIVE-PRAYER-BODY",
      type: "PRAYER"
    }
  });
  const noted = await db.platformPost.create({
    data: {
      authorId: f.author.id,
      content: "SENSITIVE-NOTED-BODY",
      contentNote: "Read deliberately"
    }
  });
  let posts = await sitemap("posts");
  assert.ok(posts.includes(f.post.id));
  assert.ok(posts.includes("2026-09-02T13:00:00.000Z"));
  for (const row of [privatePost, prayer, noted])
    assert.ok(!posts.includes(row.id));
  assert.ok(!posts.includes("BODY"));
  await db.platformPost.update({
    where: { id: prayer.id },
    data: { safeExcerpt: "Explicit public safe introduction" }
  });
  posts = await sitemap("posts");
  assert.ok(posts.includes(prayer.id));
  assert.ok((await sitemap("events")).includes(f.occurrence.id));
  await db.calendarEvent.update({
    where: { id: f.event.id },
    data: { visibility: "PRIVATE" }
  });
  assert.ok(!(await sitemap("events")).includes(f.occurrence.id));
  await db.platformPost.update({
    where: { id: f.post.id },
    data: { audience: "CHURCH", audienceChurchId: f.church.id }
  });
  assert.ok(!(await sitemap("posts")).includes(f.post.id));
});
test("structured data uses public supplied facts, survives hostile text and drops restricted or canceled events", async () => {
  const f = await seedSharing(db);
  const hostile = "Congregation </script><script>bad()</script>&";
  await db.church.update({
    where: { id: f.church.id },
    data: {
      communityListed: false,
      name: hostile,
      locationModel: "NO_BUILDING",
      city: "Fictional town"
    }
  });
  const church = await publicStructuredData(db, "church", f.church.id);
  assert.equal(church?.["@type"], "Organization");
  assert.equal(church?.name, hostile);
  const encoded = serializeStructuredData(church);
  assert.ok(!encoded.includes("<") && !encoded.includes("&"));
  assert.equal(JSON.parse(encoded).name, hostile);
  for (const field of [
    "address",
    "telephone",
    "email",
    "review",
    "aggregateRating",
    "sameAs"
  ])
    assert.ok(!Object.hasOwn(church!, field));
  let event = await publicStructuredData(db, "event", f.occurrence.id);
  assert.ok(event);
  assert.ok(
    !Object.hasOwn(event, "location") && !Object.hasOwn(event, "organizer")
  );
  assert.ok("startDate" in event);
  assert.equal(event.startDate, "2026-10-01T10:00:00.000Z");
  await db.calendarOccurrence.update({
    where: { id: f.occurrence.id },
    data: { allDay: true, startLocal: "2026-10-01", endLocal: "2026-10-03" }
  });
  event = await publicStructuredData(db, "event", f.occurrence.id);
  assert.ok(event && "startDate" in event);
  assert.equal(event.startDate, "2026-10-01");
  assert.equal(event.endDate, "2026-10-02");
  await db.calendarOccurrence.update({
    where: { id: f.occurrence.id },
    data: { canceledAt: new Date() }
  });
  assert.equal(await publicStructuredData(db, "event", f.occurrence.id), null);
  await db.calendarOccurrence.update({
    where: { id: f.occurrence.id },
    data: { canceledAt: null }
  });
  await db.calendarEvent.update({
    where: { id: f.event.id },
    data: { visibility: "PRIVATE" }
  });
  assert.equal(await publicStructuredData(db, "event", f.occurrence.id), null);
  assert.equal(
    await publicStructuredData(db, "church", "missing-public-church"),
    null
  );
});
