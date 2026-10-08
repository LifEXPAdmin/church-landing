import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import {
  profilePhotoFixture,
  profilePhotoMemoryStore,
  saveProfileSectionPhotos,
  uploadProfileSectionPhoto
} from "./profile-photo-sections-fixture";
import { getProfileEditor } from "../lib/platform/profiles";
import { emptyProfileModules } from "../lib/platform/profile-modules";
import {
  prepareAccountExport,
  downloadAccountExport
} from "../lib/platform/account-export";
import { requestPermanentAccountDeletion } from "../lib/platform/account-deletion";
import { eraseRequestedAccountData } from "../lib/platform/account-erasure";
import { createSessionToken } from "../lib/platform/auth";
import {
  replayRetentionControls,
  type RetentionControlEntry
} from "../lib/platform/retention-controls";

const db = new PrismaClient(),
  oldFlag = process.env.PERSONAL_PHOTO_LIBRARY_ENABLED;
let f: Awaited<ReturnType<typeof profilePhotoFixture>>;
before(async () => {
  process.env.PERSONAL_PHOTO_LIBRARY_ENABLED = "true";
  f = await profilePhotoFixture(db, profilePhotoMemoryStore());
});
after(async () => {
  if (oldFlag === undefined) delete process.env.PERSONAL_PHOTO_LIBRARY_ENABLED;
  else process.env.PERSONAL_PHOTO_LIBRARY_ENABLED = oldFlag;
  await db.$disconnect();
});
const entries = async () =>
  (
    await db.retentionControl.findMany({
      where: { kind: "PROFILE_MODULES", sourceId: f.owner.id },
      orderBy: { version: "asc" }
    })
  ).map((row) => row.payload as unknown as RetentionControlEntry);
const editor = () => getProfileEditor(db, f.owner.token);

test("photo selections reuse own export and opaque profile replay without copying or changing canonical photos", async () => {
  const selected = [f.photos.members.id, f.photos.public.id];
  await saveProfileSectionPhotos(db, f.owner, selected, {
    testimony: "Retained fictional story",
    skills: ["Listening"],
    order: ["skills", "photos", "links", "testimony"]
  });
  const original = await db.profilePresentation.findUniqueOrThrow({
    where: { userId: f.owner.id }
  });
  const sources = await db.mediaAsset.findMany({
    where: { id: { in: selected } },
    orderBy: { id: "asc" }
  });
  const secret = process.env.AUTH_RATE_LIMIT_SECRET!,
    proof = await prepareAccountExport(
      db,
      f.owner.token,
      f.owner.password,
      secret
    );
  const exported = JSON.parse(
    await downloadAccountExport(db, f.owner.token, proof.authorization, secret)
  );
  assert.deepEqual(exported.account.presentation.modules.photoIds, selected);
  assert.deepEqual(exported.account.presentation.modules.order, [
    "skills",
    "photos",
    "links",
    "testimony"
  ]);
  await saveProfileSectionPhotos(db, f.owner, []);
  const controls = await entries();
  for (const photo of Object.values(f.photos)) {
    assert.ok(!JSON.stringify(controls).includes(photo.id));
    assert.ok(!JSON.stringify(controls).includes(photo.caption));
  }
  await db.profilePresentation.update({
    where: { userId: f.owner.id },
    data: {
      modules: original.modules!,
      modulesVersion: original.modulesVersion,
      version: original.version
    }
  });
  await replayRetentionControls(db, controls);
  const restored = await editor();
  assert.deepEqual(restored.presentation.modules, emptyProfileModules());
  await replayRetentionControls(db, [...controls].reverse());
  assert.deepEqual(await editor(), restored);
  await assert.rejects(
    saveProfileSectionPhotos(
      db,
      f.owner,
      selected,
      {},
      { expectedVersion: original.version }
    ),
    /profile-conflict/
  );
  await saveProfileSectionPhotos(db, f.owner, [selected[0]]);
  const reviewed = await editor();
  await replayRetentionControls(db, controls);
  assert.deepEqual(await editor(), reviewed);
  assert.deepEqual(
    await db.mediaAsset.findMany({
      where: { id: { in: selected } },
      orderBy: { id: "asc" }
    }),
    sources
  );
  await db.profilePresentation.delete({ where: { userId: f.owner.id } });
  await replayRetentionControls(db, controls);
  assert.deepEqual(
    (await editor()).presentation.modules,
    emptyProfileModules()
  );
  await assert.rejects(
    saveProfileSectionPhotos(db, f.owner, selected, {}, { expectedVersion: 0 }),
    /profile-conflict/
  );
});

test("canonical account erasure removes photo section selections and replay cannot reconstruct them or another owner's content", async () => {
  const otherPhoto = await uploadProfileSectionPhoto(db, f.outsider, {
    store: f.store
  });
  await saveProfileSectionPhotos(db, f.outsider, [otherPhoto.id], {
    testimony: "Unrelated owner's retained story"
  });
  const unrelated = await getProfileEditor(db, f.outsider.token);
  await saveProfileSectionPhotos(db, f.owner, [
    f.photos.public.id,
    f.photos.private.id
  ]);
  const controls = await entries();
  const journal = { async recordAccount() {}, async completeAccount() {} };
  await requestPermanentAccountDeletion(
    db,
    f.owner.token,
    f.owner.password,
    true,
    createSessionToken(),
    journal
  );
  const deletion = await db.accountDeletion.findUniqueOrThrow({
    where: { userId: f.owner.id }
  });
  await eraseRequestedAccountData(db, deletion.id, journal);
  await replayRetentionControls(db, controls);
  assert.equal(
    await db.profilePresentation.count({ where: { userId: f.owner.id } }),
    0
  );
  for (const photo of Object.values(f.photos)) {
    const row = await db.mediaAsset.findUniqueOrThrow({
      where: { id: photo.id }
    });
    assert.equal(row.status, "RETIRED");
    assert.equal(row.caption, "");
    assert.equal(row.alt, "");
  }
  assert.deepEqual(await getProfileEditor(db, f.outsider.token), unrelated);
  assert.equal(
    (await db.mediaAsset.findUniqueOrThrow({ where: { id: otherPhoto.id } }))
      .status,
    "READY"
  );
});
