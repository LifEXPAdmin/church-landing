import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import {
  profilePhotoFixture,
  saveProfileSectionPhotos,
  changeSectionPhoto,
  uploadProfileSectionPhoto
} from "./profile-photo-sections-fixture";
import { getProfileEditor } from "../lib/platform/profiles";
import { sessionCookieFixtureName } from "../scripts/session-cookie-fixture.mjs";

const db = new PrismaClient(),
  origin = process.env.ACCOUNT_ORIGIN!;
assert.match(origin, /^https:\/\/127\.0\.0\.1:\d+$/);
let f: Awaited<ReturnType<typeof profilePhotoFixture>>;
before(async () => {
  f = await profilePhotoFixture(db);
  await saveProfileSectionPhotos(
    db,
    f.owner,
    Object.values(f.photos).map((photo) => photo.id),
    { order: ["photos", "testimony", "skills", "links"] }
  );
});
after(() => db.$disconnect());
const read = (
  query: Record<string, string>,
  token = f.member.token,
  account = f.member.id
) =>
  fetch(origin + "/api/platform/profile?" + new URLSearchParams(query), {
    headers: {
      cookie: `${sessionCookieFixtureName(origin)}=${token}`,
      ...(account ? { "x-expected-account": account } : {})
    }
  });
const section = () => ({ view: "photo-section", username: f.owner.username });
const noStore = (response: Response) => {
  for (const name of [
    "cache-control",
    "cdn-cache-control",
    "vercel-cdn-cache-control"
  ])
    assert.match(response.headers.get(name) ?? "", /no-store/);
};

test("built photo section and picker require current expected identity and reject ambiguous or unbounded query fields", async () => {
  for (const [token, expected] of [
    ["", f.member.id],
    [f.member.token, ""],
    [f.member.token, f.outsider.id]
  ]) {
    const response = await read(section(), token, expected);
    assert.equal(response.status, 401);
    noStore(response);
  }
  const response = await read(section());
  assert.equal(response.status, 200);
  noStore(response);
  const current = await response.json();
  assert.deepEqual(
    current.images.map((image: { id: string }) => image.id),
    [f.photos.public.id, f.photos.members.id, f.photos.church.id]
  );
  assert.equal(current.viewerId, f.member.id);
  assert.equal(current.profileId, f.owner.id);
  assert.doesNotMatch(
    JSON.stringify(current),
    /storagePrefix|leaseUntil|fingerprint|Private owner/
  );
  const query = new URLSearchParams(section()).toString();
  for (const suffix of [
    "&unknown=1",
    "&username=other",
    "&preview=visitor",
    "&view=photo-choices"
  ]) {
    const bad = await fetch(
      `${origin}/api/platform/profile?${query}${suffix}`,
      {
        headers: {
          cookie: `${sessionCookieFixtureName(origin)}=${f.member.token}`,
          "x-expected-account": f.member.id
        }
      }
    );
    assert.equal(bad.status, 400);
    noStore(bad);
  }
  for (const input of [
    "not-json",
    JSON.stringify(Array(7).fill("photo")),
    JSON.stringify([f.photos.public.id, f.photos.public.id])
  ])
    assert.equal(
      (
        await read(
          { view: "photo-choices", ids: input },
          f.owner.token,
          f.owner.id
        )
      ).status,
      400
    );
  assert.equal(
    (
      await read(
        {
          view: "photo-choices",
          ids: JSON.stringify([f.photos.public.id]),
          after: f.photos.members.id
        },
        f.owner.token,
        f.owner.id
      )
    ).status,
    400
  );
  const own = await read(
    {
      view: "photo-choices",
      ids: JSON.stringify([f.photos.private.id, f.photos.public.id])
    },
    f.owner.token,
    f.owner.id
  );
  assert.equal(own.status, 200);
  assert.deepEqual(
    (await own.json()).images.map((image: { id: string }) => image.id),
    [f.photos.private.id, f.photos.public.id]
  );
});

test("actual profile save rejects foreign photo additions atomically without changing sibling profile fields", async () => {
  const foreign = await uploadProfileSectionPhoto(db, f.outsider);
  const before = await getProfileEditor(db, f.owner.token),
    controls = await db.retentionControl.count({
      where: { kind: "PROFILE_MODULES", sourceId: f.owner.id }
    });
  const input = {
    operation: "update-profile",
    name: f.owner.name,
    bio: "Must not partially save",
    expectedVersion: before.presentation.version,
    profileModules: { ...before.presentation.modules, photoIds: [foreign.id] }
  };
  const send = (account: string, source = origin) =>
    fetch(origin + "/api/platform/account", {
      method: "POST",
      headers: {
        origin: source,
        cookie: `${sessionCookieFixtureName(origin)}=${f.owner.token}`,
        "x-expected-account": account,
        "content-type": "application/json"
      },
      body: JSON.stringify(input)
    });
  const mismatched = await send(f.outsider.id);
  assert.equal(mismatched.status, 400);
  const mismatchBody = await mismatched.json();
  assert.equal(
    mismatchBody.message,
    "Please sign in again before changing your account."
  );
  assert.notEqual(mismatchBody.code, "ACCOUNT_PROFILE_VALIDATION");
  assert.notEqual(
    mismatched.headers.get("x-account-code"),
    "ACCOUNT_PROFILE_VALIDATION"
  );
  assert.deepEqual(await getProfileEditor(db, f.owner.token), before);
  assert.equal(
    await db.retentionControl.count({
      where: { kind: "PROFILE_MODULES", sourceId: f.owner.id }
    }),
    controls
  );
  assert.equal(
    (await send(f.owner.id, "https://unrelated.example")).status,
    403
  );
  const invalid = await send(f.owner.id);
  assert.equal(invalid.status, 400);
  assert.equal((await invalid.json()).code, "ACCOUNT_PROFILE_VALIDATION");
  assert.deepEqual(await getProfileEditor(db, f.owner.token), before);
  assert.equal(
    await db.retentionControl.count({
      where: { kind: "PROFILE_MODULES", sourceId: f.owner.id }
    }),
    controls
  );
});

test("HTML and RSC carry no selected-photo identifiers, and derivative responses enforce the current audience after revocation", async () => {
  for (const token of ["", f.outsider.token, f.owner.token])
    for (const rsc of [false, true]) {
      const response = await fetch(
        origin +
          "/platform/profile/" +
          f.owner.username +
          (token === f.owner.token ? "?preview=member" : ""),
        {
          headers: {
            cookie: `${sessionCookieFixtureName(origin)}=${token}`,
            ...(rsc ? { RSC: "1" } : {})
          },
          redirect: "manual"
        }
      );
      const body = await response.text();
      for (const photo of Object.values(f.photos)) {
        assert.ok(!body.includes(photo.id));
        assert.ok(!body.includes(photo.caption));
      }
      assert.ok(!body.includes('"photoIds"'));
    }
  const preview = await read(
    { ...section(), preview: "member" },
    f.owner.token,
    f.owner.id
  );
  assert.equal(preview.status, 200);
  assert.deepEqual(
    (await preview.json()).images.map((image: { id: string }) => image.id),
    [f.photos.public.id, f.photos.members.id]
  );
  const path = `/api/platform/images/${f.photos.members.id}/`;
  const image = (variant: string) =>
    fetch(origin + path + variant, {
      headers: {
        cookie: `${sessionCookieFixtureName(origin)}=${f.member.token}`
      }
    });
  const allowed = await image("thumb");
  assert.equal(allowed.status, 200);
  assert.ok((await allowed.arrayBuffer()).byteLength > 0);
  noStore(allowed);
  await changeSectionPhoto(db, f.owner, f.photos.members.id, "audience", {
    audience: "ONLY_ME"
  });
  for (const variant of ["thumb", "medium", "large", "original"]) {
    const denied = await image(variant);
    assert.equal(denied.status, 404);
    noStore(denied);
  }
  const after = await read(section());
  assert.equal(after.status, 200);
  assert.ok(!(await after.text()).includes(f.photos.members.id));
});
