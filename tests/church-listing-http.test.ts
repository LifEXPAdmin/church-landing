import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { registerAccount, loginAccount } from "../lib/platform/accounts";
import { projectListingData } from "../lib/platform/church-listing-data";
import { ADULT_POLICY } from "../lib/platform/portal-types";
import { safeAccountReturn } from "../lib/platform/account-entry";

const db = new PrismaClient();
const origin = process.env.ACCOUNT_ORIGIN!;
const production = process.env.LISTING_RENDER_PHASE === "production";
const password = "Fictional-listing-http-password-1";
assert.equal(process.env.ACCOUNT_TEST_ISOLATED, "1");
assert.equal(new URL(process.env.DATABASE_URL!).hostname, "127.0.0.1");
assert.equal(
  new URL(process.env.DATABASE_URL!).pathname,
  "/godschurches_security_test"
);
assert.match(origin, /^https?:\/\/127\.0\.0\.1:\d+$/);
after(() => db.$disconnect());
let a: Awaited<ReturnType<typeof owner>>, b: Awaited<ReturnType<typeof owner>>;
async function owner() {
  const username = "listing_" + randomUUID().slice(0, 8);
  await registerAccount(db, {
    username,
    name: username,
    email: username + "@example.test",
    password,
    confirmPassword: password,
    role: "BELIEVER"
  });
  // Isolated HTTP renderer fixture only. The service suite covers actual sink
  // verification; this does not assert delivery from the disabled renderer.
  const user = await db.platformUser.update({
    where: { username },
    data: {
      emailVerifiedAt: new Date(),
      adultAcknowledgedAt: new Date(),
      adultPolicyVersion: ADULT_POLICY,
      bio: username + "-private-member-bio"
    }
  });
  return { user, token: await loginAccount(db, user.email, password, null) };
}
before(async () => {
  await db.platformAuthLimit.deleteMany();
  a = await owner();
  await db.platformAuthLimit.deleteMany();
  b = await owner();
});
const get = (path: string, token = "", rsc = false) =>
  fetch(origin + path, {
    headers: {
      ...(token ? { Cookie: "church_platform_session=" + token } : {}),
      ...(rsc ? { RSC: "1" } : {})
    }
  });
const post = (body: unknown, token = a.token, extra = {}) =>
  fetch(origin + "/api/platform/church-listings", {
    method: "POST",
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      Cookie: "church_platform_session=" + token,
      ...extra
    },
    body: JSON.stringify(body)
  });
const read = async (id: string) => {
  const response = await get("/api/platform/church-listings?id=" + id, a.token);
  assert.equal(response.status, 200);
  return (await response.json()).submissions[0];
};

test("actual listing routes preserve private drafts and scoped access in HTML, RSC and JSON", async () => {
  let response = await post({
    operation: "create",
    kind: "COMMUNITY",
    requestKey: randomUUID()
  });
  assert.equal(response.status, 200);
  const { id } = await response.json();
  const name = "Private listing fixture " + randomUUID();
  const data = projectListingData({
    name,
    country: "Fictional Country",
    serviceArea: "Fictional region",
    summary: "Distinct private draft summary " + randomUUID(),
    locationModel: "ROTATING",
    publicEmail: "public-office@example.test"
  });
  response = await post({ operation: "save", id, expectedVersion: 1, data });
  assert.equal(response.status, 200);
  assert.equal(
    (await get("/api/platform/church-listings?id=" + id, b.token)).status,
    404
  );
  assert.equal(
    (await get("/api/platform/church-listings?id=" + id)).status,
    401
  );
  assert.equal(
    (await get("/api/platform/church-listings?review=1", b.token)).status,
    403
  );
  assert.equal(
    (
      await post(
        {
          operation: "publish",
          id,
          expectedVersion: 2,
          publicConfirmed: true,
          searchedConfirmed: true
        },
        b.token
      )
    ).status,
    404
  );
  assert.equal(
    (
      await post({ operation: "save", id, expectedVersion: 2, data }, a.token, {
        Origin: "https://evil.test"
      })
    ).status,
    403
  );
  for (const rsc of [false, true]) {
    for (const path of [
      "/platform/church-listings",
      "/platform/church-listings/" + id,
      "/platform/church-listings/" + id + "?preview=1"
    ]) {
      const ownerPage = await get(path, a.token, rsc);
      assert.equal(ownerPage.status, 200);
      const ownText = await ownerPage.text();
      if (production) assert.ok(ownText.includes(name), path);
      else {
        assert.ok(!ownText.includes(name));
        assert.match(ownText, /Open the private listing preview/);
      }
      for (const value of [
        a.token,
        a.user.email,
        a.user.passwordHash!,
        a.user.bio!,
        b.user.email
      ])
        assert.ok(
          !ownText.includes(value),
          path + ": credentials/private account fields absent"
        );
      for (const token of ["", b.token]) {
        const page = await get(path, token, rsc);
        const content = await page.text();
        assert.ok(!content.includes(name));
        assert.ok(!content.includes(data.summary));
      }
    }
  }
  const publicSearch = await get(
    "/api/platform/portal?view=public&q=" + encodeURIComponent(name)
  );
  assert.equal((await publicSearch.json()).churches.length, 0);
  const payload = {
    operation: "publish",
    id,
    expectedVersion: 2,
    publicConfirmed: true,
    searchedConfirmed: true
  };
  response = await post(payload);
  assert.equal(response.status, 200);
  const published = await response.json();
  assert.ok(published.churchId);
  const replay = await post(payload);
  assert.equal(replay.status, 200);
  assert.equal((await replay.json()).churchId, published.churchId);
  assert.equal((await read(id)).status, "PUBLISHED");
  for (const rsc of [false, true]) {
    for (const token of ["", a.token]) {
      const page = await get(
        "/platform/churches/" + published.churchId,
        token,
        rsc
      );
      assert.equal(page.status, 200);
      const content = await page.text();
      assert.ok(content.includes(name));
      assert.match(content, /Community listing/);
      assert.ok(content.includes("public-office@example.test"));
      assert.ok(!content.includes(a.token));
      assert.ok(!content.includes(a.user.email));
      assert.ok(!content.includes("requestKey"));
      assert.match(content, /Suggest a correction/);
      assert.match(content, /Member connections will open/);
    }
  }
  assert.equal(
    (
      await get(
        "/api/platform/portal?view=directory&churchId=" + published.churchId,
        a.token
      )
    ).status,
    403
  );
  assert.equal(
    await db.churchCapabilityGrant.count({
      where: { churchId: published.churchId }
    }),
    0
  );
});

test("actual guest listing gate and return path preserve correction target without granting actions", async () => {
  const target = "/platform/church-listings/new?churchId=fixture-church";
  assert.equal(
    safeAccountReturn(target + "&token=secret&ownerId=other"),
    target
  );
  assert.equal(
    safeAccountReturn("/platform/church-listings/new?churchId=//evil.test"),
    "/platform/church-listings/new"
  );
  const response = await get(target);
  const content = await response.text();
  if (production) {
    assert.match(content, /Join or sign in to add a church listing/);
    assert.ok(content.includes("fixture-church"));
  } else assert.match(content, /Open the private listing preview/);
  assert.equal((await get("/api/platform/church-listings")).status, 401);
});
