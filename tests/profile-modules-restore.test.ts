import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { assertPortalTestDatabase, createPortalActor } from "./seed-portal";
import { updateAccountProfile } from "../lib/platform/accounts";
import { getProfileEditor } from "../lib/platform/profiles";
import { emptyProfileModules } from "../lib/platform/profile-modules";
import {
  replayRetentionControls,
  type RetentionControlEntry
} from "../lib/platform/retention-controls";
const db = new PrismaClient();
before(() => assertPortalTestDatabase(db));
after(() => db.$disconnect());

test("opaque module replay clears old content, preserves newer choices and prevents absent-row stale saves", async () => {
  const a = await createPortalActor(db, "modulerestore"),
    b = await createPortalActor(db, "moduleunrelated");
  const original = {
    ...emptyProfileModules(),
    testimony: "Withdrawn testimony marker",
    order: ["links", "skills", "testimony"]
  };
  await updateAccountProfile(db, a.token, {
    name: a.name,
    expectedVersion: 0,
    profileModules: original
  });
  const old = await db.profilePresentation.findUniqueOrThrow({
    where: { userId: a.id }
  });
  await updateAccountProfile(db, a.token, {
    name: a.name,
    expectedVersion: 1,
    profileModules: emptyProfileModules()
  });
  const entries = (
    await db.retentionControl.findMany({
      where: { kind: "PROFILE_MODULES", sourceId: a.id },
      orderBy: { version: "asc" }
    })
  ).map((row) => row.payload as unknown as RetentionControlEntry);
  assert.equal(entries.length, 2);
  assert.equal(JSON.stringify(entries).includes(original.testimony), false);
  await db.profilePresentation.update({
    where: { userId: a.id },
    data: {
      version: old.version,
      modulesVersion: old.modulesVersion,
      modules: original
    }
  });
  await replayRetentionControls(db, entries);
  const restored = await getProfileEditor(db, a.token);
  assert.deepEqual(restored.presentation.modules, emptyProfileModules());
  assert.ok(restored.presentation.version > 2);
  await replayRetentionControls(db, entries);
  assert.deepEqual(await getProfileEditor(db, a.token), restored);
  await assert.rejects(
    updateAccountProfile(db, a.token, {
      name: a.name,
      expectedVersion: old.version,
      profileModules: original
    }),
    /profile-conflict/
  );
  const reviewed = { ...original, testimony: "Reviewed new story" };
  await updateAccountProfile(db, a.token, {
    name: a.name,
    expectedVersion: restored.presentation.version,
    profileModules: reviewed
  });
  await replayRetentionControls(db, entries);
  assert.deepEqual(
    (await getProfileEditor(db, a.token)).presentation.modules,
    reviewed
  );
  await db.profilePresentation.delete({ where: { userId: a.id } });
  await replayRetentionControls(db, entries);
  assert.deepEqual(
    (await getProfileEditor(db, a.token)).presentation.modules,
    emptyProfileModules()
  );
  await assert.rejects(
    updateAccountProfile(db, a.token, {
      name: a.name,
      expectedVersion: 0,
      profileModules: original
    }),
    /profile-conflict/
  );
  await assert.rejects(
    replayRetentionControls(db, [{ ...entries[1], targetId: b.id }])
  );
  assert.equal((await getProfileEditor(db, b.token)).presentation.version, 0);
});
