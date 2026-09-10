import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { PrismaClient } from "@prisma/client";
import { assertPortalTestDatabase, createPortalActor } from "./seed-portal";
const db = new PrismaClient(),
  origin = process.env.ACCOUNT_ORIGIN!;
before(() => assertPortalTestDatabase(db));
after(() => db.$disconnect());
const get = (path: string, token = "", extra = {}) =>
  fetch(origin + path, {
    headers: { Cookie: "church_platform_session=" + token, ...extra },
    redirect: "manual"
  });
const save = (token: string, body: Record<string, unknown>, source = origin) =>
  fetch(origin + "/api/platform/account", {
    method: "POST",
    headers: {
      Origin: source,
      Cookie: "church_platform_session=" + token,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ operation: "update-profile", ...body })
  });
test("actual profile HTML/RSC/API gate guest details, media and previews while members get their current profile", async () => {
  const a = await createPortalActor(db, "profileht"),
    b = await createPortalActor(db, "visitor");
  const fields = {
    name: a.name,
    bio: "SECRET PROFILE BIO",
    location: "PRIVATE PROFILE LOCATION",
    website: "https://profile.example.test",
    interests: "Private profile interest",
    palette: "blue",
    background: "lines",
    sectionOrder: "posts-first",
    introduction: "SECRET PINNED INTRODUCTION",
    expectedVersion: 0
  };
  assert.equal(
    (await save(a.token, fields, "https://forged.example.test")).status,
    403
  );
  const response = await save(a.token, fields);
  assert.equal(response.status, 200, await response.clone().text());
  const bytes = await sharp({
    create: { width: 300, height: 150, channels: 3, background: "blue" }
  })
    .png()
    .toBuffer();
  const uploaded = await fetch(origin + "/api/platform/images", {
    method: "POST",
    headers: {
      Origin: origin,
      Cookie: "church_platform_session=" + a.token,
      "Content-Type": "application/octet-stream",
      "X-Image-Details": encodeURIComponent(
        JSON.stringify({
          purpose: "PROFILE_AVATAR",
          targetId: a.id,
          requestKey: randomUUID(),
          crop: { x: 1, y: 0.5, zoom: 2 },
          alt: "PRIVATE PROFILE PHOTO ALT"
        })
      )
    },
    body: new Uint8Array(bytes)
  });
  assert.equal(uploaded.status, 200, await uploaded.clone().text());
  const picture = await uploaded.json();
  const forbidden = [
    fields.bio,
    fields.location,
    fields.website,
    fields.introduction,
    "PRIVATE PROFILE PHOTO ALT",
    picture.id,
    a.email,
    a.token
  ];
  for (const path of [
    `/platform/profile/${a.username}`,
    `/platform/profile/${a.username}?preview=member`,
    `/platform/profile/${a.username}?preview=visitor`,
    "/platform/profile/me"
  ])
    for (const headers of [{}, { RSC: "1" }]) {
      const response = await get(path, "", headers),
        body = await response.text();
      assert.equal(response.status, 200);
      for (const marker of forbidden)
        assert.ok(!body.includes(marker), `Guest ${path} leaked ${marker}`);
    }
  assert.equal((await get("/api/platform/profile")).status, 401);
  const own = await get("/api/platform/profile", a.token),
    data = await own.json();
  assert.equal(own.status, 200);
  assert.match(own.headers.get("cache-control")!, /no-store/);
  assert.ok(
    own.headers
      .get("vary")!
      .split(",")
      .some((value) => value.trim().toLowerCase() === "cookie")
  );
  assert.equal(data.avatar.id, picture.id);
  assert.deepEqual(data.avatar.crop, { x: 1, y: 0.5, zoom: 2 });
  assert.equal(data.presentation.version, 1);
  const page = await get(`/platform/profile/${a.username}`, b.token),
    html = await page.text();
  assert.equal(page.status, 200);
  assert.ok(html.includes(fields.bio));
  assert.ok(html.includes(fields.introduction));
  assert.ok(html.includes('id="about"') && html.includes('id="posts"'));
  assert.ok(html.indexOf('id="posts"') < html.indexOf('id="about"'));
  assert.ok(html.includes(picture.variants.thumb.url));
  assert.ok(!html.includes(a.email) && !html.includes(a.token));
  for (const headers of [{}, { RSC: "1" }]) {
    const preview = await (
      await get(
        `/platform/profile/${a.username}?preview=visitor`,
        a.token,
        headers
      )
    ).text();
    for (const marker of forbidden)
      assert.ok(
        !preview.includes(marker),
        `Visitor preview included ${marker}`
      );
    assert.match(preview, /Visitor preview/);
  }
  const editor = await (await get("/platform/profile/me", a.token)).text();
  assert.match(editor.replace(/<!--[\s\S]*?-->/g, ""), /Choose avatar/);
  assert.match(editor, /Cover background/);
  assert.match(editor, /Pinned introduction/);
  for (const marker of [a.email, a.token, "storagePrefix", "fingerprint"])
    assert.ok(!editor.includes(marker));
  await db.platformSession.deleteMany({ where: { userId: a.id } });
  assert.equal((await get("/api/platform/profile", a.token)).status, 401);
  assert.equal((await get(picture.variants.thumb.url, a.token)).status, 404);
});
test("actual profile conflict keeps the saved version intact and empty sections are omitted", async () => {
  const a = await createPortalActor(db, "profileht");
  const fields = {
    name: a.name,
    bio: "",
    location: "",
    website: "",
    interests: "",
    palette: "sage",
    background: "plain",
    sectionOrder: "about-first",
    introduction: "",
    expectedVersion: 0
  };
  const outcomes = await Promise.all([
    save(a.token, { ...fields, palette: "blue" }),
    save(a.token, { ...fields, palette: "warm" })
  ]);
  assert.deepEqual(outcomes.map((r) => r.status).sort(), [200, 409]);
  const saved = await (await get("/api/platform/profile", a.token)).json();
  assert.equal(saved.presentation.version, 1);
  const conflict = await save(a.token, {
    ...fields,
    bio: "Stale must not win"
  });
  assert.equal(conflict.status, 409);
  assert.match((await conflict.json()).message, /another tab/);
  const current = await (await get("/api/platform/profile", a.token)).json();
  assert.equal(current.bio, null);
  assert.equal(current.presentation.palette, saved.presentation.palette);
  const page = await (
    await get(`/platform/profile/${a.username}`, a.token)
  ).text();
  assert.ok(!page.includes('id="about"'));
  assert.ok(!page.includes('id="profile-intro-heading"'));
  assert.match(page, /No posts to show here yet/);
});
