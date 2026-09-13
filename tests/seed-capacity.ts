import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import {
  assertPortalTestDatabase,
  createPortalActor,
  requestConnection
} from "./seed-portal";
import { seedParticipation } from "./seed-post-participation";
import { portalCommand, ADULT_POLICY } from "../lib/platform/portal";
import { getPostParticipation } from "../lib/platform/post-participation-reads";

// Development-only, disposable cluster. Never imported by application code.
const db = new PrismaClient();
try {
  await assertPortalTestDatabase(db);
  assert.equal(
    await db.platformUser.count(),
    0,
    "Use a fresh isolated database"
  );
  const f = await seedParticipation(db);
  const actors = [];
  for (let i = 0; i < 100; i++) {
    const actor = await createPortalActor(db, `load${i}`);
    const connection = await requestConnection(db, actor, f.churchA.id);
    await portalCommand(db, f.reviewerA.token, {
      operation: "transition",
      action: "APPROVE",
      churchId: f.churchA.id,
      connectionId: connection.id,
      expectedVersion: connection.version
    });
    actors.push({ id: actor.id, token: actor.token });
  }
  await f.poll();
  const httpSlot = await f.slot();
  const serviceSlot = await f.slot({ role: "Fictional service race place" });
  const participation = await getPostParticipation(
    db,
    actors[0].token,
    f.post.id
  );
  const users = 10000 - (await db.platformUser.count());
  await db.$executeRaw`
    INSERT INTO "PlatformUser" (id,"updatedAt",name,username,email,"emailVerifiedAt","adultAcknowledgedAt","adultPolicyVersion")
    SELECT 'cap-user-' || i, now(), 'Fictional Capacity ' || i, 'cap_user_' || i,
      'cap-user-' || i || '@example.test', now(), now(), ${ADULT_POLICY}
    FROM generate_series(1, ${users}::integer) AS i`;
  await db.$executeRaw`
    INSERT INTO "Church" (id,slug,name,summary)
    SELECT 'cap-church-' || i, 'fictional-capacity-' || i, 'Fictional Capacity Church ' || i,
      'Fictional isolated capacity fixture; not a real congregation.'
    FROM generate_series(1,98) AS i`;
  // Each bulk account belongs to one fictional church; active clients use the
  // normal verified signup and church approval flows above.
  await db.$executeRaw`
    INSERT INTO "ChurchConnection" (id,"userId","churchId",state,"updatedAt")
    SELECT 'cap-connection-' || i, 'cap-user-' || i, 'cap-church-' || (1 + i % 98),
      'APPROVED', now() FROM generate_series(1, ${users}::integer) AS i`;
  await db.$executeRaw`
    INSERT INTO "PlatformPost" (id,"createdAt","updatedAt","authorId","audienceChurchId",audience,content,"publishedAt","allowReposts",type)
    SELECT 'cap-post-' || i, now() - i * interval '1 second', now(),
      'cap-user-' || (1 + i % ${users}::integer),
      CASE WHEN i % 3 = 0 THEN ${f.churchA.id} ELSE NULL END,
      CASE WHEN i % 3 = 0 THEN 'CHURCH'::"PostAudience" ELSE 'PUBLIC'::"PostAudience" END,
      'Fictional capacity update ' || i || ' about service, welcome and community.',
      now() - i * interval '1 second', true,
      CASE WHEN i % 5 = 0 THEN 'PRAYER'::"PlatformPostType" ELSE 'UPDATE'::"PlatformPostType" END
    FROM generate_series(1,99999) AS i`;
  // 400k comments spread across all posts, plus 100k on the latest 100 posts.
  await db.$executeRaw`
    INSERT INTO "PlatformPostComment" (id,"postId","authorId",content,"createdAt")
    SELECT 'cap-comment-' || i,
      'cap-post-' || CASE WHEN i <= 400000 THEN 1 + i % 99999 ELSE 1 + i % 100 END,
      'cap-user-' || (1 + i % ${users}::integer),
      'Fictional capacity comment ' || i, now() - i * interval '1 second'
    FROM generate_series(1,500000) AS i`;
  await db.platformAuthLimit.deleteMany();
  const counts = {
    accounts: await db.platformUser.count(),
    churches: await db.church.count(),
    posts: await db.platformPost.count(),
    comments: await db.platformPostComment.count()
  };
  assert.deepEqual(counts, {
    accounts: 10000,
    churches: 100,
    posts: 100000,
    comments: 500000
  });
  await writeFile(
    join(process.env.CAPACITY_FIXTURE_DIR!, "actors.json"),
    JSON.stringify({
      actors,
      postId: f.post.id,
      churchId: f.churchA.id,
      slot: participation.slots.find((slot) => slot.id === httpSlot.id),
      serviceSlot: participation.slots.find(
        (slot) => slot.id === serviceSlot.id
      ),
      poll: participation.poll,
      outsider: { id: f.blake.id, token: f.blake.token },
      reviewer: { id: f.reviewerA.id, token: f.reviewerA.token },
      counts
    }),
    { mode: 0o600 }
  );
  console.log(JSON.stringify({ seeded: counts }));
} finally {
  await db.$disconnect();
}
