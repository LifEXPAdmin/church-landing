import test, { after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { homeFeedAudience, homeFeedMode } from "../lib/platform/home-feed";
import { readAccountLink } from "../lib/platform/account-link";

assert.equal(process.env.ACCOUNT_TEST_ISOLATED, "1");
assert.equal(new URL(process.env.DATABASE_URL!).hostname, "127.0.0.1");
const db = new PrismaClient();
after(() => db.$disconnect());

test("early public feed includes strangers for guests and members, retains following mode and excludes inactive authors", async () => {
  const users = await Promise.all(
    [0, 1, 2, 3, 4].map(async (i) => {
      const username = randomUUID().replaceAll("-", "").slice(0, 20);
      return db.platformUser.create({
        data: {
          name: "Community fixture",
          username,
          email: `${username}@example.test`,
          suspendedAt: i === 3 ? new Date() : null,
          deactivatedAt: i === 4 ? new Date() : null
        }
      });
    })
  );
  await db.platformFollow.create({
    data: { followerId: users[0].id, followingId: users[1].id }
  });
  await db.platformPost.createMany({
    data: users.map((u) => ({
      authorId: u.id,
      content: "Public community fixture"
    }))
  });
  const ids = users.map((u) => u.id);
  const read = async (userId?: string, mode?: "community" | "following") => {
    const where = await homeFeedAudience(db, userId, mode);
    const rows = await db.platformPost.findMany({
      where: { AND: [where, { authorId: { in: ids } }] },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 31
    });
    return rows.map((row) => row.authorId).sort();
  };
  assert.equal(homeFeedMode(), "community");
  assert.deepEqual(await read(), ids.slice(0, 3).sort());
  assert.deepEqual(await read(users[0].id), await read());
  assert.deepEqual(
    await read(users[0].id, "following"),
    ids.slice(0, 2).sort()
  );
  assert.deepEqual(await read(undefined, "following"), await read());
});

test("purpose-specific fragments accept new and legacy emails but reject incomplete or foreign-purpose grants", () => {
  const token = "x".repeat(43);
  assert.deepEqual(readAccountLink(`#token=${token}`, "VERIFY_EMAIL"), {
    token,
    purpose: "VERIFY_EMAIL"
  });
  assert.deepEqual(
    readAccountLink(`#token=${token}&purpose=VERIFY_EMAIL`, "RESET_PASSWORD"),
    { token, purpose: "VERIFY_EMAIL" }
  );
  assert.deepEqual(readAccountLink(`#token=${token}`, "RESET_PASSWORD"), {
    token,
    purpose: "RESET_PASSWORD"
  });
  for (const hash of [
    "",
    "#token=short",
    `#token=${token}&purpose=CHANGE_EMAIL`,
    `#token=${token}%22`
  ])
    assert.equal(readAccountLink(hash, "RESET_PASSWORD"), null);
});
