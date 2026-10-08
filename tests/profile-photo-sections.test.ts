import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  profilePhotoFixture,
  profilePhotoMemoryStore,
  uploadProfileSectionPhoto,
  changeSectionPhoto,
  saveProfileSectionPhotos
} from "./profile-photo-sections-fixture";
import {
  getProfilePhotoChoices,
  getProfilePhotoSection
} from "../lib/platform/profile-photo-sections";
import {
  profilePhotoIds,
  validateProfileModules,
  emptyProfileModules
} from "../lib/platform/profile-modules";
import {
  getProfileEditor,
  getMemberProfile,
  getVisitorProfilePreview
} from "../lib/platform/profiles";
import { updateAccountProfile } from "../lib/platform/accounts";
import { postCommand } from "../lib/platform/post-commands";
import { readImage } from "../lib/platform/media";

const db = new PrismaClient();
const oldFlag = process.env.PERSONAL_PHOTO_LIBRARY_ENABLED;
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
const current = () => getProfileEditor(db, f.owner.token);
const read = (actor = f.member, preview = false) =>
  getProfilePhotoSection(db, actor.token, f.owner.username, preview, actor.id);
const ids = (value: { images: { id: string }[] }) =>
  value.images.map((image) => image.id);
const savedIds = () => Object.values(f.photos).map((image) => image.id);

test("typed photo references are bounded, distinct canonical IDs without arbitrary URLs or copied photo metadata", () => {
  const value = Array.from({ length: 6 }, () => randomUUID());
  assert.deepEqual(profilePhotoIds(value), value);
  assert.deepEqual(
    validateProfileModules({ ...emptyProfileModules(), photoIds: value })
      .photoIds,
    value
  );
  for (const invalid of [
    null,
    {},
    "id",
    [...value, randomUUID()],
    [value[0], value[0]],
    ["https://example.test/photo"],
    [{ id: value[0] }],
    ["x".repeat(101)],
    [""],
    ["photo\n"],
    ["photo\u0000"],
    ["phоto"],
    ["photo\u202e"]
  ])
    assert.throws(() => profilePhotoIds(invalid));
  assert.throws(() =>
    validateProfileModules({
      ...emptyProfileModules(),
      photoIds: value,
      photoCaptions: ["Unowned text"]
    })
  );
});

test("photo order and references survive legacy text edits without resetting sibling sections or current profile versions", async () => {
  const original = savedIds(),
    order = ["links", "photos", "skills", "testimony"];
  await saveProfileSectionPhotos(db, f.owner, original, {
    testimony: "Fictional saved testimony",
    skills: ["Listening"],
    links: [{ label: "Fictional work", url: "https://example.test/work" }],
    order
  });
  let before = await current();
  await updateAccountProfile(
    db,
    f.owner.token,
    {
      name: f.owner.name,
      expectedVersion: before.presentation.version,
      profileModules: {
        testimony: "Older client text",
        skills: ["Listening"],
        links: before.presentation.modules.links,
        order: ["testimony", "skills", "links"]
      }
    },
    f.owner.id
  );
  let after = await current();
  assert.deepEqual(after.presentation.modules.photoIds, original);
  assert.deepEqual(after.presentation.modules.order, [
    "testimony",
    "photos",
    "skills",
    "links"
  ]);
  before = after;
  await updateAccountProfile(
    db,
    f.owner.token,
    {
      name: f.owner.name,
      expectedVersion: before.presentation.version,
      profileModules: {
        testimony: "Omitted order edit",
        skills: ["Listening"],
        links: before.presentation.modules.links
      }
    },
    f.owner.id
  );
  after = await current();
  assert.deepEqual(after.presentation.modules.photoIds, original);
  assert.deepEqual(
    after.presentation.modules.order,
    before.presentation.modules.order
  );
  await assert.rejects(
    saveProfileSectionPhotos(
      db,
      f.owner,
      [],
      {},
      { expectedVersion: before.presentation.version }
    ),
    /profile-conflict/
  );
  assert.deepEqual(await current(), after);
  await saveProfileSectionPhotos(db, f.owner, [...original].reverse());
  assert.deepEqual(
    (await current()).presentation.modules.photoIds,
    [...original].reverse()
  );
  await saveProfileSectionPhotos(db, f.owner, []);
  const cleared = await current();
  assert.deepEqual(cleared.presentation.modules.photoIds, []);
  assert.equal(cleared.presentation.modules.testimony, "Omitted order edit");
  assert.deepEqual(cleared.presentation.modules.skills, ["Listening"]);
  assert.deepEqual(
    cleared.presentation.modules.links,
    after.presentation.modules.links
  );
});

test("current section reads intersect profile and photo audiences while member DTOs expose no raw photo selection", async () => {
  const all = savedIds();
  await saveProfileSectionPhotos(db, f.owner, all);
  assert.deepEqual(ids(await read(f.owner)), all);
  assert.deepEqual(ids(await read()), [
    f.photos.public.id,
    f.photos.members.id,
    f.photos.church.id
  ]);
  assert.deepEqual(ids(await read(f.outsider)), [
    f.photos.public.id,
    f.photos.members.id
  ]);
  assert.deepEqual(ids(await read(f.owner, true)), [
    f.photos.public.id,
    f.photos.members.id
  ]);
  const projected = await read(f.outsider);
  assert.doesNotMatch(
    JSON.stringify(projected),
    /storagePrefix|audienceChurchId|fingerprint|leaseUntil|Private owner|Private church/
  );
  for (const actor of [f.owner, f.member, f.outsider]) {
    const dto = await getMemberProfile(db, actor.token, f.owner.username);
    assert.equal(Object.hasOwn(dto.presentation.modules, "photoIds"), false);
    for (const id of all) assert.ok(!JSON.stringify(dto).includes(id));
  }
  assert.deepEqual(
    await getVisitorProfilePreview(db, f.owner.token, f.owner.username),
    { name: f.owner.name, username: f.owner.username }
  );
  await assert.rejects(
    getProfilePhotoSection(
      db,
      f.member.token,
      f.owner.username,
      false,
      f.outsider.id
    )
  );
  await assert.rejects(
    getProfilePhotoSection(db, "", f.owner.username, false, f.member.id)
  );
  await db.churchConnection.updateMany({
    where: { userId: f.member.id, churchId: f.church.id },
    data: { state: "LEFT" }
  });
  assert.deepEqual(ids(await read()), [
    f.photos.public.id,
    f.photos.members.id
  ]);
  await db.churchConnection.updateMany({
    where: { userId: f.member.id, churchId: f.church.id },
    data: { state: "APPROVED" }
  });
});

test("fresh foreign, wrong-purpose, hidden and deleted additions fail atomically while unavailable saved selections remain removable", async () => {
  const hidden = await uploadProfileSectionPhoto(db, f.owner, {
      store: f.store
    }),
    deleted = await uploadProfileSectionPhoto(db, f.owner, { store: f.store });
  const foreign = await uploadProfileSectionPhoto(db, f.outsider, {
    store: f.store
  });
  const avatar = await uploadProfileSectionPhoto(db, f.owner, {
    purpose: "PROFILE_AVATAR",
    store: f.store
  });
  const post = await postCommand(db, f.owner.token, {
    operation: "create",
    requestKey: randomUUID(),
    content: "Fictional post-photo purpose control"
  });
  const postPhoto = await uploadProfileSectionPhoto(db, f.owner, {
    purpose: "POST_PHOTO",
    targetId: post.id,
    store: f.store
  });
  await changeSectionPhoto(db, f.owner, hidden.id, "hide");
  await changeSectionPhoto(db, f.owner, deleted.id, "delete", {
    confirmed: true
  });
  const before = await current(),
    controls = await db.retentionControl.count({
      where: { kind: "PROFILE_MODULES", sourceId: f.owner.id }
    });
  for (const id of [
    foreign.id,
    avatar.id,
    postPhoto.id,
    hidden.id,
    deleted.id,
    "missing-photo"
  ]) {
    await assert.rejects(
      saveProfileSectionPhotos(db, f.owner, [id], {
        testimony: "Must not partially save"
      })
    );
    assert.deepEqual(await current(), before);
    assert.equal(
      await db.retentionControl.count({
        where: { kind: "PROFILE_MODULES", sourceId: f.owner.id }
      }),
      controls
    );
  }
  const selected = await uploadProfileSectionPhoto(db, f.owner, {
    store: f.store
  });
  await saveProfileSectionPhotos(db, f.owner, [
    selected.id,
    f.photos.members.id
  ]);
  await changeSectionPhoto(db, f.owner, selected.id, "hide");
  await saveProfileSectionPhotos(db, f.owner, [
    f.photos.members.id,
    selected.id
  ]);
  assert.deepEqual(ids(await read(f.owner)), [f.photos.members.id]);
  await saveProfileSectionPhotos(db, f.owner, [f.photos.members.id]);
  await assert.rejects(saveProfileSectionPhotos(db, f.owner, [selected.id]));
});

test("audience revocation, hiding, deletion and account blocking remove current cards without changing canonical selections", async () => {
  const photo = await uploadProfileSectionPhoto(db, f.owner, {
    store: f.store,
    audience: "MEMBERS"
  });
  await saveProfileSectionPhotos(db, f.owner, [photo.id]);
  assert.deepEqual(ids(await read()), [photo.id]);
  await changeSectionPhoto(db, f.owner, photo.id, "audience", {
    audience: "ONLY_ME"
  });
  assert.deepEqual(ids(await read()), []);
  await assert.rejects(
    readImage(db, f.member.token, photo.id, "thumb", f.store)
  );
  assert.deepEqual(ids(await read(f.owner)), [photo.id]);
  await changeSectionPhoto(db, f.owner, photo.id, "audience", {
    audience: "MEMBERS"
  });
  const block = await db.socialRelationship.create({
    data: { ownerId: f.member.id, targetUserId: f.owner.id, blocked: true }
  });
  await assert.rejects(read());
  await db.socialRelationship.delete({ where: { id: block.id } });
  await changeSectionPhoto(db, f.owner, photo.id, "hide");
  assert.deepEqual(ids(await read(f.owner)), []);
  await changeSectionPhoto(db, f.owner, photo.id, "restore");
  assert.deepEqual(ids(await read()), [photo.id]);
  await changeSectionPhoto(db, f.owner, photo.id, "delete", {
    confirmed: true
  });
  assert.deepEqual(ids(await read(f.owner)), []);
  assert.deepEqual((await current()).presentation.modules.photoIds, [photo.id]);
});

test("picker pages remain owner-only and bounded before pagination and selected metadata preserves requested order", async () => {
  const created: Awaited<ReturnType<typeof uploadProfileSectionPhoto>>[] = [];
  for (let i = 0; i < 25; i++)
    created.push(
      await uploadProfileSectionPhoto(db, f.owner, {
        store: f.store,
        label: `Bounded picker photo ${i}`
      })
    );
  const first = await getProfilePhotoChoices(db, f.owner.token, {}, f.owner.id);
  assert.equal(first.images.length, 24);
  assert.ok(first.nextCursor);
  const next = await getProfilePhotoChoices(
    db,
    f.owner.token,
    { after: first.nextCursor },
    f.owner.id
  );
  assert.ok(next.images.length <= 24);
  assert.equal(
    new Set([...ids(first), ...ids(next)]).size,
    first.images.length + next.images.length
  );
  assert.ok(
    [...first.images, ...next.images].every(
      (image) => image.purpose === "PROFILE_PHOTO"
    )
  );
  const selected = [created[3].id, created[0].id, created[2].id];
  assert.deepEqual(
    ids(
      await getProfilePhotoChoices(
        db,
        f.owner.token,
        { ids: selected },
        f.owner.id
      )
    ),
    selected
  );
  assert.deepEqual(
    ids(
      await getProfilePhotoChoices(
        db,
        f.outsider.token,
        { ids: selected },
        f.outsider.id
      )
    ),
    []
  );
  await assert.rejects(
    getProfilePhotoChoices(db, f.owner.token, {}, f.outsider.id)
  );
  process.env.PERSONAL_PHOTO_LIBRARY_ENABLED = "false";
  try {
    assert.throws(
      () => getProfilePhotoChoices(db, f.owner.token, {}, f.owner.id),
      { status: 503 }
    );
  } finally {
    process.env.PERSONAL_PHOTO_LIBRARY_ENABLED = "true";
  }
});
