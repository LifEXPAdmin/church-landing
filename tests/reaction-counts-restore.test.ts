import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { createPortalActor, assertPortalTestDatabase } from "./seed-portal";
import { setAuthorCounts } from "./reaction-count-fixture";
import { readReactionPreferences } from "../lib/platform/reaction-preferences";
import {
  replayRetentionControls,
  type RetentionControlEntry
} from "../lib/platform/retention-controls";
const db = new PrismaClient();
before(() => assertPortalTestDatabase(db));
after(() => db.$disconnect());
test("opaque restore quarantines older and absent choices, rejects forged ownership and preserves newer explicit review", async () => {
  const a = await createPortalActor(db, "countrestore"),
    b = await createPortalActor(db, "countretain");
  await setAuthorCounts(db, a, false);
  await setAuthorCounts(db, a, true);
  const entries = (
    await db.retentionControl.findMany({
      where: { kind: "REACTION_COUNT_PREFERENCES", sourceId: a.id },
      orderBy: { version: "asc" }
    })
  ).map((r) => r.payload as unknown as RetentionControlEntry);
  assert.equal(entries.length, 2);
  assert.ok(!JSON.stringify(entries).includes("hideAuthoredReactionCounts"));
  await db.socialPreferences.update({
    where: { ownerId: a.id },
    data: { hideAuthoredReactionCounts: false, reactionCountVersion: 1 }
  });
  await replayRetentionControls(db, entries);
  const restored = await readReactionPreferences(db, a.token, a.id);
  assert.deepEqual(restored, {
    ownerId: a.id,
    hideAuthoredReactionCounts: true,
    version: 2,
    recoveryRequired: true
  });
  await replayRetentionControls(db, entries);
  assert.deepEqual(await readReactionPreferences(db, a.token, a.id), restored);
  await setAuthorCounts(db, a, false);
  await replayRetentionControls(db, entries);
  assert.equal(
    (await readReactionPreferences(db, a.token, a.id))
      .hideAuthoredReactionCounts,
    false
  );
  assert.equal((await readReactionPreferences(db, a.token, a.id)).version, 3);
  await db.socialPreferences.delete({ where: { ownerId: a.id } });
  await replayRetentionControls(db, entries);
  assert.deepEqual(await readReactionPreferences(db, a.token, a.id), restored);
  await assert.rejects(
    replayRetentionControls(db, [{ ...entries[1], targetId: b.id }])
  );
  assert.equal((await readReactionPreferences(db, b.token, b.id)).version, 0);
});
