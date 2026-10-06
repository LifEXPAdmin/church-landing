import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { featuredFixture, saveFeatured } from "./profile-featured-fixture";
import { assertPortalTestDatabase } from "./seed-portal";
import { sessionCookieFixtureName } from "../scripts/session-cookie-fixture.mjs";
const db = new PrismaClient(),
  origin = process.env.ACCOUNT_ORIGIN!;
before(() => assertPortalTestDatabase(db));
after(() => db.$disconnect());
const get = (path: string, token = "", account = "", extra = {}) =>
  fetch(origin + path, {
    headers: {
      Cookie: sessionCookieFixtureName() + "=" + token,
      ...(account ? { "x-expected-account": account } : {}),
      ...extra
    },
    redirect: "manual"
  });
test("built featured API requires exact current account, strict bounded fields and no-store responses", async () => {
  const f = await featuredFixture(db);
  await saveFeatured(db, f.owner, f.references);
  const url =
    "/api/platform/profile?" +
    new URLSearchParams({
      view: "featured-resources",
      username: f.owner.username
    });
  for (const [token, id] of [
    ["", f.member.id],
    [f.member.token, ""],
    [f.member.token, f.outsider.id]
  ]) {
    const r = await get(url, token, id);
    assert.equal(r.status, 401, await r.clone().text());
    assert.match(r.headers.get("cache-control")!, /no-store/);
  }
  const r = await get(url, f.member.token, f.member.id);
  assert.equal(r.status, 200);
  assert.equal((await r.json()).resources.length, 3);
  for (const suffix of ["&unknown=1", "&username=other", "&preview=visitor"])
    assert.equal(
      (await get(url + suffix, f.member.token, f.member.id)).status,
      400
    );
  const choice =
    "/api/platform/profile?" +
    new URLSearchParams({
      view: "featured-choice",
      references: JSON.stringify(f.references)
    });
  assert.equal((await get(choice, f.owner.token, f.owner.id)).status, 200);
  assert.equal(
    (await get(choice + "&references=[]", f.owner.token, f.owner.id)).status,
    400
  );
});
test("guest, member and generic preview HTML/RSC never embed featured reference IDs or titles", async () => {
  const f = await featuredFixture(db);
  await saveFeatured(db, f.owner, f.references);
  for (const token of ["", f.outsider.token, f.owner.token])
    for (const extra of [{}, { RSC: "1" }]) {
      const r = await get(
        "/platform/profile/" +
          f.owner.username +
          (token === f.owner.token ? "?preview=member" : ""),
        token,
        "",
        extra
      );
      const text = await r.text();
      for (const marker of [
        ...f.references.map((r) => r.id),
        f.media.title,
        f.listing.title,
        f.opportunity.title,
        "featuredResources"
      ])
        assert.ok(!text.includes(marker), marker);
    }
  const read = await get(
    "/api/platform/profile?" +
      new URLSearchParams({
        view: "featured-resources",
        username: f.owner.username,
        preview: "member"
      }),
    f.owner.token,
    f.owner.id
  );
  const raw = await read.text();
  assert.ok(!raw.includes(f.opportunity.id));
  assert.ok(!raw.includes("PRIVATE"));
});
