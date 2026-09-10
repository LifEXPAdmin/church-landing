import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { PrismaClient } from "@prisma/client";
import { assertPortalTestDatabase, createPortalActor } from "./seed-portal";
import { seedParticipation } from "./seed-post-participation";
import { updateAccountProfile, AccountError } from "../lib/platform/accounts";
import {
  getMemberProfile,
  getProfileEditor,
  getVisitorProfilePreview
} from "../lib/platform/profiles";
import { defaultProfileStyle } from "../lib/platform/profile-style";
import { uploadImage, readImage } from "../lib/platform/media";
import { postCommand } from "../lib/platform/post-commands";
import {
  prepareAccountExport,
  downloadAccountExport
} from "../lib/platform/account-export";
import { imageStorage } from "../lib/platform/media-storage";
const db = new PrismaClient();
before(() => assertPortalTestDatabase(db));
after(() => db.$disconnect());
const fields = {
  name: "Profile Fixture",
  bio: "Members-only bio marker",
  location: "Profile town",
  website: "https://example.test",
  interests: "Reading, Service",
  ...defaultProfileStyle,
  version: undefined
};
const save = (version: number, changes = {}) => {
  const { version: _version, ...rest } = fields;
  void _version;
  return { ...rest, expectedVersion: version, ...changes };
};
const image = () =>
  sharp({
    create: { width: 120, height: 80, channels: 3, background: "green" }
  })
    .png()
    .toBuffer();

test("versioned profile writes preserve legacy details and resolve concurrent saves explicitly", async () => {
  const a = await createPortalActor(db, "profile");
  assert.equal((await getProfileEditor(db, a.token)).presentation.version, 0);
  const outcomes = await Promise.allSettled([
    updateAccountProfile(db, a.token, save(0, { palette: "blue" })),
    updateAccountProfile(db, a.token, save(0, { palette: "warm" }))
  ]);
  assert.equal(outcomes.filter((r) => r.status === "fulfilled").length, 1);
  const failed = outcomes.find(
    (r) => r.status === "rejected"
  ) as PromiseRejectedResult;
  assert.ok(
    failed.reason instanceof AccountError &&
      failed.reason.code === "profile-conflict"
  );
  const edited = await getProfileEditor(db, a.token);
  assert.equal(edited.bio, fields.bio);
  assert.equal(edited.presentation.version, 1);
  await updateAccountProfile(db, a.token, {
    name: "Legacy profile update",
    bio: "Legacy bio"
  });
  const legacy = await getProfileEditor(db, a.token);
  assert.equal(legacy.presentation.version, 2);
  assert.equal(legacy.presentation.palette, edited.presentation.palette);
  await assert.rejects(
    updateAccountProfile(db, a.token, save(1)),
    /profile-conflict/
  );
  await updateAccountProfile(
    db,
    a.token,
    save(2, {
      sectionOrder: "posts-first",
      introduction: "Welcome to my profile"
    })
  );
  assert.equal((await getProfileEditor(db, a.token)).presentation.version, 3);
});
test("invalid appearance, injected contacts and stale sessions cannot alter profile fields", async () => {
  const a = await createPortalActor(db, "profile");
  for (const input of [
    save(0, { palette: "red" }),
    save(0, { background: "<script>" }),
    save(0, { expectedVersion: "0" }),
    save(0, { expectedVersion: -1 }),
    save(0, { introduction: "x".repeat(1001) }),
    save(0, { email: "injected@example.test" }),
    save(0, { userId: a.id }),
    {
      name: "Missing style version",
      palette: "sage",
      background: "plain",
      sectionOrder: "about-first",
      introduction: ""
    }
  ])
    await assert.rejects(updateAccountProfile(db, a.token, input));
  assert.equal((await getProfileEditor(db, a.token)).presentation.version, 0);
  await db.platformSession.deleteMany({ where: { userId: a.id } });
  await assert.rejects(updateAccountProfile(db, a.token, save(0)));
  await assert.rejects(getProfileEditor(db, a.token));
  assert.equal(
    await db.profilePresentation.count({ where: { userId: a.id } }),
    0
  );
});
test("member profiles, their previews and images follow current account and post audiences", async () => {
  const f = await seedParticipation(db);
  await updateAccountProfile(db, f.ada.token, save(0));
  const pub = await postCommand(db, f.ada.token, {
    operation: "create",
    requestKey: randomUUID(),
    content: "Public personal profile post",
    audience: "PUBLIC"
  });
  const priv = await postCommand(db, f.ada.token, {
    operation: "create",
    requestKey: randomUUID(),
    content: "Private personal profile post",
    audience: "CHURCH",
    audienceChurchId: f.churchA.id
  });
  const crop = { x: 1, y: 0.25, zoom: 2 };
  const avatar = await uploadImage(
    db,
    f.ada.token,
    {
      purpose: "PROFILE_AVATAR",
      targetId: f.ada.id,
      requestKey: randomUUID(),
      crop
    },
    await image()
  );
  const own = await getMemberProfile(db, f.ada.token, f.ada.username);
  assert.deepEqual(own.avatar?.crop, crop);
  assert.deepEqual(
    new Set(own.posts.map((p) => p.id)),
    new Set([pub.id, priv.id])
  );
  const outsider = await getMemberProfile(db, f.blake.token, f.ada.username, {
    preview: "member"
  });
  assert.equal(outsider.memberPreview, false);
  assert.deepEqual(
    outsider.posts.map((p) => p.id),
    [pub.id]
  );
  const preview = await getMemberProfile(db, f.ada.token, f.ada.username, {
    preview: "member"
  });
  assert.equal(preview.memberPreview, true);
  assert.deepEqual(
    preview.posts.map((p) => p.id),
    [pub.id]
  );
  assert.equal(preview.posts[0].canEdit, false);
  assert.deepEqual(
    await getVisitorProfilePreview(db, f.ada.token, f.ada.username),
    { name: fields.name, username: f.ada.username }
  );
  await assert.rejects(
    getVisitorProfilePreview(db, f.blake.token, f.ada.username)
  );
  const text = JSON.stringify(outsider);
  for (const forbidden of [
    f.ada.email,
    f.ada.token,
    "passwordHash",
    "contactEmail",
    "phone",
    "storagePrefix",
    "fingerprint"
  ])
    assert.ok(!text.includes(forbidden));
  for (const token of ["", null]) {
    await assert.rejects(getMemberProfile(db, token, f.ada.username));
    await assert.rejects(getProfileEditor(db, token));
    await assert.rejects(getVisitorProfilePreview(db, token, f.ada.username));
  }
  await db.platformUser.update({
    where: { id: f.ada.id },
    data: { deactivatedAt: new Date() }
  });
  await assert.rejects(getMemberProfile(db, f.blake.token, f.ada.username));
  await assert.rejects(
    getVisitorProfilePreview(db, f.ada.token, f.ada.username)
  );
  await assert.rejects(readImage(db, f.blake.token, avatar.id, "original"));
});
test("crop changes bind retries, preserve the last saved photo on failure and reject crop on post attachments", async () => {
  const f = await seedParticipation(db),
    bytes = await image();
  const input = {
    purpose: "PROFILE_COVER",
    targetId: f.ada.id,
    requestKey: randomUUID(),
    crop: { x: 0, y: 1, zoom: 1.5 }
  };
  const original = await uploadImage(db, f.ada.token, input, bytes);
  assert.equal(
    (await uploadImage(db, f.ada.token, input, bytes)).id,
    original.id
  );
  await assert.rejects(
    uploadImage(
      db,
      f.ada.token,
      { ...input, crop: { x: 1, y: 1, zoom: 1.5 } },
      bytes
    )
  );
  for (const crop of [
    null,
    { x: -1, y: 0, zoom: 1 },
    { x: 0, y: 0, zoom: 99 },
    { x: 0, y: 0, zoom: 1, css: "hidden" }
  ])
    await assert.rejects(
      uploadImage(
        db,
        f.ada.token,
        { ...input, requestKey: randomUUID(), crop },
        bytes
      )
    );
  await assert.rejects(
    uploadImage(
      db,
      f.ada.token,
      {
        purpose: "POST_PHOTO",
        targetId: f.post.id,
        requestKey: randomUUID(),
        crop: input.crop
      },
      bytes
    )
  );
  const store = imageStorage();
  let writes = 0;
  const interrupted = {
    ...store,
    async put(path: string, data: Buffer, signal: AbortSignal) {
      if (++writes === 2) throw new Error("Fictional interrupted upload");
      await store.put(path, data, signal);
    }
  };
  const replacement = {
    ...input,
    requestKey: randomUUID(),
    replacesId: original.id,
    crop: { x: 1, y: 0, zoom: 2 }
  };
  await assert.rejects(
    uploadImage(db, f.ada.token, replacement, bytes, interrupted)
  );
  assert.equal(
    (await getProfileEditor(db, f.ada.token)).cover?.id,
    original.id
  );
  const retried = await uploadImage(db, f.ada.token, replacement, bytes);
  assert.equal(
    (await uploadImage(db, f.ada.token, replacement, bytes)).id,
    retried.id
  );
  assert.equal(
    await db.mediaAsset.count({
      where: {
        profileUserId: f.ada.id,
        purpose: "PROFILE_COVER",
        status: "READY"
      }
    }),
    1
  );
  await assert.rejects(readImage(db, f.lee.token, original.id, "thumb"));
});
test("own export includes appearance and image metadata without provider paths, other profiles or binary payloads", async () => {
  const a = await createPortalActor(db, "exportpic"),
    b = await createPortalActor(db, "stranger");
  await updateAccountProfile(
    db,
    a.token,
    save(0, { palette: "warm", introduction: "Own export introduction" })
  );
  const uploaded = await uploadImage(
    db,
    a.token,
    {
      purpose: "PROFILE_AVATAR",
      targetId: a.id,
      requestKey: randomUUID(),
      crop: { x: 0.1, y: 0.8, zoom: 2 },
      alt: "Own portrait description"
    },
    await image()
  );
  await uploadImage(
    db,
    b.token,
    {
      purpose: "PROFILE_COVER",
      targetId: b.id,
      requestKey: randomUUID(),
      alt: "Other private description"
    },
    await image()
  );
  const secret = process.env.AUTH_RATE_LIMIT_SECRET!;
  const proof = await prepareAccountExport(db, a.token, a.password, secret);
  const text = await downloadAccountExport(
      db,
      a.token,
      proof.authorization,
      secret
    ),
    data = JSON.parse(text);
  assert.equal(data.account.presentation.palette, "warm");
  assert.equal(data.images.length, 1);
  assert.equal(data.images[0].id, uploaded.id);
  assert.deepEqual(data.images[0].crop, { x: 0.1, y: 0.8, zoom: 2 });
  assert.match(data.images[0].variants.thumb.url, /^\/api\/platform\/images\//);
  for (const forbidden of [
    b.email,
    "Other private description",
    "storagePrefix",
    "fingerprint",
    "requestKey",
    "blob.vercel-storage.com",
    "data:image",
    a.token
  ])
    assert.ok(!text.includes(forbidden));
});
