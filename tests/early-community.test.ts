import test, { after } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { homeFeedMode } from "../lib/platform/home-feed";
import { seedPortal, createPortalActor } from "./seed-portal";
import { listPosts } from "../lib/platform/post-reads";
import { readAccountLink } from "../lib/platform/account-link";

assert.equal(process.env.ACCOUNT_TEST_ISOLATED, "1");
assert.equal(new URL(process.env.DATABASE_URL!).hostname, "127.0.0.1");
const db = new PrismaClient();
after(() => db.$disconnect());

test("early community selection keeps audience, publication and author checks before following filters", async () => {
  const f = await seedPortal(db);
  const inactive = await createPortalActor(db, "inactive");
  await db.platformFollow.create({
    data: { followerId: f.coordinator.id, followingId: f.contact.id }
  });
  const post = (data: Parameters<typeof db.platformPost.create>[0]["data"]) =>
    db.platformPost.create({ data });
  const own = await post({
    authorId: f.coordinator.id,
    content: "Own public fixture"
  });
  const followed = await post({
    authorId: f.contact.id,
    content: "Followed public fixture"
  });
  const stranger = await post({
    authorId: f.memberB.id,
    content: "Stranger public fixture"
  });
  const churchA = await post({
    authorId: f.memberA.id,
    authorChurchId: f.churchA.id,
    audienceChurchId: f.churchA.id,
    audience: "CHURCH",
    content: "Private Church A"
  });
  const churchB = await post({
    authorId: f.memberB.id,
    authorChurchId: f.churchB.id,
    audienceChurchId: f.churchB.id,
    audience: "CHURCH",
    content: "Private Church B"
  });
  const churchPublic = await post({
    authorId: f.memberA.id,
    authorChurchId: f.churchA.id,
    audienceChurchId: f.churchA.id,
    audience: "PUBLIC",
    content: "Public church fixture"
  });
  const draft = await post({
    authorId: f.coordinator.id,
    status: "DRAFT",
    publishedAt: null,
    content: "Unpublished fixture"
  });
  const withdrawn = await post({
    authorId: f.contact.id,
    withdrawnAt: new Date(),
    content: "Withdrawn fixture"
  });
  const future = await post({
    authorId: f.memberB.id,
    publishedAt: new Date(Date.now() + 86400000),
    content: "Future fixture"
  });
  const hiddenAuthor = await post({
    authorId: inactive.id,
    content: "Inactive author fixture"
  });
  await db.platformUser.update({
    where: { id: inactive.id },
    data: { suspendedAt: new Date() }
  });
  const all = new Set(
    [
      own,
      followed,
      stranger,
      churchA,
      churchB,
      churchPublic,
      draft,
      withdrawn,
      future,
      hiddenAuthor
    ].map((p) => p.id)
  );
  const read = async (token?: string) =>
    (await listPosts(db, token, { feed: true }))
      .map((p) => p.id)
      .filter((id) => all.has(id))
      .sort();
  const publicIds = [own.id, followed.id, stranger.id, churchPublic.id].sort();
  const prior = process.env.PLATFORM_HOME_FEED_MODE;
  try {
    delete process.env.PLATFORM_HOME_FEED_MODE;
    assert.equal(homeFeedMode(), "community");
    assert.deepEqual(await read(), publicIds);
    assert.deepEqual(
      await read(f.coordinator.token),
      [...publicIds, churchA.id].sort()
    );
    assert.deepEqual(
      await read(f.memberB.token),
      [...publicIds, churchB.id].sort()
    );
    process.env.PLATFORM_HOME_FEED_MODE = "following";
    assert.deepEqual(
      await read(f.coordinator.token),
      [own.id, followed.id, churchA.id, churchPublic.id].sort()
    );
    assert.deepEqual(await read(), publicIds);
    await db.platformUser.update({
      where: { id: inactive.id },
      data: { suspendedAt: null, deactivatedAt: new Date() }
    });
    delete process.env.PLATFORM_HOME_FEED_MODE;
    assert.deepEqual(await read(), publicIds);
  } finally {
    if (prior === undefined) delete process.env.PLATFORM_HOME_FEED_MODE;
    else process.env.PLATFORM_HOME_FEED_MODE = prior;
  }
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
