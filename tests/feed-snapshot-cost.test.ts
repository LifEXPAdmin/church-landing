import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { cpus } from "node:os";
import { PrismaClient, type Prisma } from "@prisma/client";
import { assertPortalTestDatabase, createPortalActor } from "./seed-portal";
import { readFeed } from "../lib/platform/feed-reads";
import { defaultDiscoveryPreferences } from "../lib/platform/discovery-options";

// Explicit hosted measurement of saved-set reads, not a production load test.
// Ordinary test invocations do not allocate this fixture.
test(
  "measure saved feed reads without changing source access or page order",
  {
    skip: process.env.FEED_SNAPSHOT_MEASUREMENT !== "1"
  },
  async (t) => {
    assert.equal(process.env.GITHUB_ACTIONS, "true");
    const db = new PrismaClient({ log: [{ emit: "event", level: "query" }] });
    let capture = false;
    let events: Prisma.QueryEvent[] = [];
    db.$on("query", (event) => {
      if (capture) events.push(event);
    });
    let authorId: string | undefined;
    try {
      await assertPortalTestDatabase(db);
      const reader = await createPortalActor(db, "scanreader");
      const author = await createPortalActor(db, "scanauthor");
      authorId = author.id;
      const marker = "Fictional snapshot cost " + randomUUID();
      const prefs = defaultDiscoveryPreferences();
      prefs.filters.denominations = [marker];
      await db.socialPreferences.create({
        data: {
          ownerId: reader.id,
          discovery: prefs as unknown as Prisma.InputJsonObject
        }
      });
      const at = new Date();
      const ids = Array.from(
        { length: 10000 },
        (_, i) => "scan_" + randomUUID().replaceAll("-", "") + "_" + i
      );
      for (let offset = 0; offset < ids.length; offset += 500) {
        await db.platformPost.createMany({
          data: ids.slice(offset, offset + 500).map((id, i) => ({
            id,
            authorId: author.id,
            content: marker,
            discoveryDenomination: marker,
            publishedAt: new Date(+at - 3600000 - offset - i)
          }))
        });
        await db.platformPostLike.createMany({
          data: ids.slice(offset, offset + 500).map((postId) => ({
            postId,
            userId: reader.id,
            firstLikedAt: new Date(+at - 1000)
          }))
        });
      }
      const idSet = new Set(ids);
      const summary = (values: number[]) => {
        const sorted = [...values].sort((a, b) => a - b);
        return {
          p50: sorted[Math.floor(sorted.length / 2)],
          p95: sorted[Math.ceil(sorted.length * 0.95) - 1]
        };
      };
      for (const mode of ["public", "weekly"] as const) {
        const first = await readFeed(db, reader.token, { mode }, at);
        assert.deepEqual(
          first.posts.map((post) => post.id),
          ids.slice(0, 30)
        );
        const snapshot = await db.feedSnapshot.findFirstOrThrow({
          where: { ownerId: reader.id, mode },
          orderBy: { createdAt: "desc" }
        });
        // Keep the real signed cursor and actual saved order. Only the fixture's
        // retained reference count changes between workload sizes.
        for (const count of [100, 1000, 10000]) {
          await db.feedSnapshot.update({
            where: { id: snapshot.id },
            data: { postIds: ids.slice(0, count) }
          });
          const read = () =>
            readFeed(db, reader.token, { mode, cursor: first.pageCursor }, at);
          await read();
          const samples = [];
          for (let i = 0; i < 7; i++) {
            events = [];
            capture = true;
            const start = performance.now();
            const result = await read();
            const ms = performance.now() - start;
            capture = false;
            assert.deepEqual(
              result.posts.map((post) => post.id),
              ids.slice(0, 30)
            );
            assert.ok(result.nextCursor);
            const refsPerQuery = events.map(
              (event) =>
                (JSON.parse(event.params) as unknown[])
                  .flat(Infinity)
                  .filter(
                    (value) => typeof value === "string" && idSet.has(value)
                  ).length
            );
            samples.push({
              ms,
              selects: events.filter((event) => /^\s*SELECT/i.test(event.query))
                .length,
              maxFixtureReferencesPerQuery: Math.max(0, ...refsPerQuery),
              totalFixtureReferences: refsPerQuery.reduce(
                (sum, n) => sum + n,
                0
              ),
              queryParameterBytes: events.reduce(
                (sum, event) => sum + Buffer.byteLength(event.params),
                0
              )
            });
          }
          t.diagnostic(
            "SNAPSHOT_MEASUREMENT " +
              JSON.stringify({
                schema: 1,
                sourceSha: execFileSync("git", ["rev-parse", "HEAD"], {
                  encoding: "utf8"
                }).trim(),
                node: process.version,
                cpu: cpus()[0].model,
                mode,
                references: count,
                timedOperation: "read existing signed page cursor",
                pageSize: 30,
                warmups: 1,
                milliseconds: summary(samples.map((sample) => sample.ms)),
                samples
              })
          );
        }
        await db.platformPost.updateMany({
          where: { id: { in: ids.slice(0, 150) } },
          data: { moderationState: "HIDDEN" }
        });
        const revoked = await readFeed(
          db,
          reader.token,
          { mode, cursor: first.pageCursor },
          at
        );
        assert.deepEqual(
          revoked.posts.map((post) => post.id),
          ids.slice(150, 180)
        );
        assert.ok(revoked.nextCursor);
        const next = await readFeed(
          db,
          reader.token,
          { mode, cursor: revoked.nextCursor },
          at
        );
        assert.deepEqual(
          next.posts.map((post) => post.id),
          ids.slice(180, 210)
        );
        await db.platformPost.updateMany({
          where: { id: { in: ids.slice(0, 150) } },
          data: { moderationState: "VISIBLE" }
        });
      }
    } finally {
      capture = false;
      if (authorId)
        await db.platformPost.updateMany({
          where: { authorId },
          data: { status: "WITHDRAWN", withdrawnAt: new Date() }
        });
      await db.$disconnect();
    }
  }
);
