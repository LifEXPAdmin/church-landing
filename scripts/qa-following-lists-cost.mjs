import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
const fixtureDir = process.argv[2];
assert.ok(
  fixtureDir,
  "Pass the existing isolated following-list preview directory"
);
const config = JSON.parse(
  readFileSync(fixtureDir + "/browser-env.json", "utf8")
);
assert.match(config.origin, /^https:\/\/following-fixture\.example\.test:\d+$/);
assert.match(config.localOrigin, /^https:\/\/127\.0\.0\.1:\d+$/);
assert.equal(new URL(config.database).hostname, "127.0.0.1");
Object.assign(process.env, {
  DATABASE_URL: config.database,
  DIRECT_URL: config.database,
  ACCOUNT_ORIGIN: config.localOrigin,
  NEXT_PUBLIC_SITE_URL: config.localOrigin,
  ACCOUNT_TEST_ISOLATED: "1",
  ACCOUNT_DELIVERY_MODE: "test-sink",
  RETENTION_TEST_DIR: process.cwd() + "/" + fixtureDir + "/retention",
  ACCOUNT_TEST_SINK_DIR: process.cwd() + "/" + fixtureDir + "/sink",
  AUTH_RATE_LIMIT_SECRET: "medium-fixture-only-secret-".repeat(3),
  NODE_ENV: "test",
  VERCEL: "",
  PRIVILEGED_MFA_MODE: "enroll",
  COMMUNITY_REPORTS_ENABLED: "true",
  BLOB_READ_WRITE_TOKEN: "",
  RESEND_API_KEY: "",
  MAILERLITE_API_KEY: "",
  MEDIA_STORAGE_MODE: "local-test",
  MEDIA_TEST_DIR: process.cwd() + "/" + fixtureDir + "/images"
});
const { PrismaClient } = await import("@prisma/client");
const { createPortalActor, assertPortalTestDatabase } =
  await import("../tests/seed-portal.ts");
const queries = [];
const db = new PrismaClient({ log: [{ emit: "event", level: "query" }] });
db.$on("query", (e) => queries.push(e.query));
await assertPortalTestDatabase(db);

const { readFeed } = await import("../lib/platform/feed-reads.ts");
const { followingListCommand, readFollowingLists } =
  await import("../lib/platform/following-lists.ts");
const { saveFeedPreference } =
  await import("../lib/platform/feed-preferences.ts");
const { ADULT_POLICY } = await import("../lib/platform/portal-types.ts");
try {
  const owner = await createPortalActor(db, "listcost"),
    suffix = randomUUID().replaceAll("-", "").slice(0, 10),
    at = new Date(Date.now() - 1000);
  const ids = Array.from({ length: 100 }, (_, i) => `list-cost-${suffix}-${i}`);
  await db.platformUser.createMany({
    data: ids.map((id, n) => ({
      id,
      email: id + "@example.test",
      username: `lc_${suffix}_${n}`,
      name: `Fictional cost person ${n}`,
      emailVerifiedAt: at,
      adultAcknowledgedAt: at,
      adultPolicyVersion: ADULT_POLICY
    }))
  });
  await db.platformFollow.createMany({
    data: ids.map((followingId) => ({ followerId: owner.id, followingId }))
  });
  await db.platformPost.createMany({
    data: ids.map((authorId, i) => ({
      authorId,
      content: `Fictional private list cost ${suffix} ${i}`,
      publishedAt: at
    }))
  });
  const report = {
    at: new Date().toISOString(),
    fixture: { follows: 100, posts: 100, lists: 20, entriesPerList: 100 },
    samples: {},
    productionWrites: 0
  };
  async function measure(label, fn) {
    const values = [];
    for (let n = 0; n < 4; n++) {
      queries.length = 0;
      const start = performance.now(),
        result = await fn();
      values.push({
        milliseconds: performance.now() - start,
        selects: queries.filter((q) => q.startsWith("SELECT")).length,
        statements: queries.length,
        bytes: Buffer.byteLength(JSON.stringify(result))
      });
    }
    report.samples[label] = values;
  }
  const time = new Date(),
    baseline = await readFeed(db, owner.token, { mode: "following" }, time);
  assert.equal(baseline.posts.length, 30);
  const digest = (posts) =>
    createHash("sha256").update(JSON.stringify(posts)).digest("hex");
  report.postPageHash = digest(baseline.posts);
  await measure(
    "followingWithoutLists",
    async () =>
      (
        await readFeed(
          db,
          owner.token,
          { mode: "following", cursor: baseline.pageCursor },
          time
        )
      ).posts
  );
  const entries = (
    await db.platformFollow.findMany({
      where: { followerId: owner.id },
      select: { id: true, followingId: true }
    })
  ).map((f) => ({
    kind: "person",
    targetId: f.followingId,
    relationshipId: f.id,
    since: null
  }));
  let version = 0,
    selected;
  for (let n = 0; n < 20; n++) {
    const created = await followingListCommand(db, owner.token, {
      operation: "create",
      name: "Private bounded list " + n,
      expectedVersion: version++,
      mutationId: randomUUID()
    });
    await followingListCommand(db, owner.token, {
      operation: "members",
      listId: created.id,
      members: entries,
      expectedVersion: version++,
      mutationId: randomUUID()
    });
    selected ??= created.id;
  }
  await saveFeedPreference(db, owner.token, {
    mode: "following",
    followingListId: selected,
    expectedVersion: 0,
    expectedListsVersion: version,
    mutationId: randomUUID()
  });
  const current = await readFeed(db, owner.token, { mode: "following" }, time);
  assert.equal(digest(current.posts), report.postPageHash);
  await measure(
    "followingSelected100From20Lists",
    async () =>
      (
        await readFeed(
          db,
          owner.token,
          { mode: "following", cursor: current.pageCursor },
          time
        )
      ).posts
  );
  await measure("privateEditor100Members20CandidatePage", async () => {
    const result = await readFollowingLists(db, owner.token, {
      listId: selected
    });
    assert.equal(result.list.members.length, 100);
    assert.equal(result.candidates.length, 20);
    assert.ok(result.nextCursor);
    return result;
  });
  const latest = await readFeed(db, owner.token, { mode: "latest" }, time);
  queries.length = 0;
  await readFeed(
    db,
    owner.token,
    { mode: "latest", cursor: latest.pageCursor },
    time
  );
  report.otherFeedsLoadListDocument = queries.some((q) =>
    q.includes('"followingLists"')
  );
  assert.equal(report.otherFeedsLoadListDocument, false);
  const pref = await db.socialPreferences.findUniqueOrThrow({
    where: { ownerId: owner.id },
    select: { followingLists: true }
  });
  report.privateDocumentBytes = Buffer.byteLength(
    JSON.stringify(pref.followingLists)
  );
  writeFileSync(
    fixtureDir + "/following-lists-cost.json",
    JSON.stringify(report, null, 2)
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await db.$disconnect();
}
