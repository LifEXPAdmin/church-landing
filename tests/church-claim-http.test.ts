import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { registerAccount, loginAccount } from "../lib/platform/accounts";
import { ADULT_POLICY } from "../lib/platform/portal-types";
import { projectListingData } from "../lib/platform/church-listing-data";
import { projectClaimAuthority } from "../lib/platform/church-claim-data";
import { safeAccountReturn } from "../lib/platform/account-entry";

const db = new PrismaClient();
const origin = process.env.ACCOUNT_ORIGIN!;
const production = process.env.CLAIM_RENDER_PHASE === "production";
assert.equal(process.env.ACCOUNT_TEST_ISOLATED, "1");
assert.equal(new URL(process.env.DATABASE_URL!).hostname, "127.0.0.1");
assert.equal(
  new URL(process.env.DATABASE_URL!).pathname,
  "/godschurches_security_test"
);
assert.match(origin, /^https?:\/\/127\.0\.0\.1:\d+$/);
async function actor() {
  await db.platformAuthLimit.deleteMany();
  const username = "claim_" + randomUUID().slice(0, 8);
  const password = "Fictional-claim-http-password-1";
  await registerAccount(db, {
    username,
    name: username,
    email: username + "@example.test",
    password,
    confirmPassword: password,
    role: "BELIEVER"
  });
  // Only the isolated renderer fixture bypasses mail delivery. Service tests use the actual test sink.
  const user = await db.platformUser.update({
    where: { username },
    data: {
      emailVerifiedAt: new Date(),
      adultAcknowledgedAt: new Date(),
      adultPolicyVersion: ADULT_POLICY,
      bio: username + "-private-bio"
    }
  });
  return { user, token: await loginAccount(db, user.email, password, null) };
}
let owner: Awaited<ReturnType<typeof actor>>,
  reviewer: Awaited<ReturnType<typeof actor>>,
  outsider: Awaited<ReturnType<typeof actor>>;
before(async () => {
  owner = await actor();
  reviewer = await actor();
  outsider = await actor();
  await db.platformOperatorGrant.create({
    data: { userId: reviewer.user.id, capability: "REVIEW_CHURCH_CLAIMS" }
  });
});
after(() => db.$disconnect());
const get = (path: string, token = "", rsc = false) =>
  fetch(origin + path, {
    headers: {
      ...(token ? { Cookie: "church_platform_session=" + token } : {}),
      ...(rsc ? { RSC: "1" } : {})
    }
  });
const post = (input: unknown, token = owner.token, extra = {}) =>
  fetch(origin + "/api/platform/church-claims", {
    method: "POST",
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      Cookie: "church_platform_session=" + token,
      ...extra
    },
    body: JSON.stringify(input)
  });
const read = async (id: string) => {
  const response = await get(
    "/api/platform/church-claims?id=" + id,
    owner.token
  );
  assert.equal(response.status, 200);
  return (await response.json()).claims[0];
};
test("actual claim HTTP routes protect owner drafts and staff evidence through approval, activation and revocation", async () => {
  let response = await post({ operation: "create", requestKey: randomUUID() });
  assert.equal(response.status, 200);
  const { id } = await response.json();
  const profile = projectListingData({
    name: "HTTP Claim " + randomUUID(),
    serviceArea: "Fictional HTTP region",
    summary: "Fictional public church description"
  });
  const authority = projectClaimAuthority({
    method: "EMAIL",
    position: "Private authority position",
    leader: "Private authority leader",
    contact: "private-claim-contact@example.test",
    availability: "Email is accessible",
    reference: "Private claim authority reference"
  });
  response = await post({
    operation: "save",
    id,
    expectedVersion: 1,
    profile,
    authority,
    scopes: ["MANAGE_CHURCH_PROFILE", "REVIEW_CONNECTIONS"]
  });
  assert.equal(response.status, 200);
  for (const [token, expected] of [
    ["", 401],
    [outsider.token, 404]
  ] as const)
    assert.equal(
      (await get("/api/platform/church-claims?id=" + id, token)).status,
      expected
    );
  assert.equal(
    (await get("/api/platform/church-claims?review=1", outsider.token)).status,
    403
  );
  assert.equal(
    (
      await post({ operation: "submit", id, expectedVersion: 2 }, owner.token, {
        Origin: "https://evil.test"
      })
    ).status,
    403
  );
  assert.equal(
    (
      await post(
        { operation: "prepare", id, expectedVersion: 2, preparation: "forged" },
        outsider.token
      )
    ).status,
    404
  );
  for (const rsc of [false, true]) {
    for (const path of [
      "/platform/church-claims",
      "/platform/church-claims/" + id,
      "/platform/church-claims/" + id + "?preview=1"
    ]) {
      const ownResponse = await get(path, owner.token, rsc);
      const content = await ownResponse.text();
      assert.equal(ownResponse.status, 200);
      if (production) assert.ok(content.includes(profile.name), path);
      else {
        assert.ok(!content.includes(profile.name));
        assert.match(content, /Open the private church setup preview/);
      }
      for (const secret of [
        owner.token,
        owner.user.passwordHash!,
        owner.user.email,
        owner.user.bio!,
        reviewer.user.email
      ])
        assert.ok(!content.includes(secret));
      if (production && path.endsWith("?preview=1"))
        for (const value of Object.values(authority).filter(
          (value) => value.startsWith("Private") || value.startsWith("private-")
        ))
          assert.ok(!content.includes(value), "preview excludes authority");
      for (const token of ["", outsider.token]) {
        const unavailable = await (await get(path, token, rsc)).text();
        for (const secret of [
          profile.name,
          authority.reference,
          authority.contact,
          owner.token
        ])
          assert.ok(!unavailable.includes(secret));
      }
    }
  }
  response = await post({
    operation: "submit",
    id,
    expectedVersion: 2,
    contactConsent: true,
    searchedConfirmed: true
  });
  assert.equal(response.status, 200);
  const decision = {
    operation: "review",
    id,
    expectedVersion: 3,
    action: "APPROVE",
    reason: "Scope independently checked",
    trustedSource: "STAFF ONLY INDEPENDENT SOURCE " + randomUUID(),
    confirmingPerson: "STAFF ONLY CONFIRMING PERSON",
    checkedAt: new Date().toISOString().slice(0, 10),
    independentConfirmed: true,
    scopeConfirmed: true,
    distinctConfirmed: true
  };
  assert.equal((await post(decision, owner.token)).status, 403);
  response = await post(decision, reviewer.token);
  assert.equal(response.status, 200);
  for (const rsc of [false, true]) {
    const staff = await (
      await get("/platform/church-claims/review/" + id, reviewer.token, rsc)
    ).text();
    if (production) {
      assert.ok(staff.includes(decision.trustedSource));
      assert.ok(staff.includes(owner.user.email));
    } else assert.ok(!staff.includes(decision.trustedSource));
    for (const token of ["", owner.token, outsider.token]) {
      const forbidden = await (
        await get("/platform/church-claims/review/" + id, token, rsc)
      ).text();
      assert.ok(!forbidden.includes(decision.trustedSource));
      assert.ok(!forbidden.includes(owner.user.email));
    }
    const own = await (
      await get("/platform/church-claims/" + id, owner.token, rsc)
    ).text();
    assert.ok(!own.includes(decision.trustedSource));
  }
  response = await post({
    operation: "activate",
    id,
    expectedVersion: 4,
    accessConfirmed: true,
    publicConfirmed: true
  });
  assert.equal(response.status, 200);
  const { churchId } = await response.json();
  assert.ok(churchId);
  for (const rsc of [false, true]) {
    const content = await (
      await get("/platform/churches/" + churchId, "", rsc)
    ).text();
    assert.ok(content.includes(profile.name));
    assert.match(content, /Church-managed/);
    assert.match(content, /Request management access/);
    for (const secret of [
      authority.reference,
      authority.contact,
      decision.trustedSource,
      owner.user.email,
      owner.token
    ])
      assert.ok(!content.includes(secret));
  }
  const row = await read(id);
  response = await post({
    operation: "revoke",
    id,
    expectedVersion: row.version,
    reason: "Fictional role ended"
  });
  assert.equal(response.status, 200);
  const ended = await (await get("/platform/churches/" + churchId)).text();
  // Development Flight includes static component source text. Check the rendered
  // HTML plus the real public JSON; continue scanning full responses for secrets.
  const rendered = ended.replace(/<script[\s\S]*?<\/script>/g, "");
  assert.ok(!rendered.includes("Church-managed"));
  const publicResult = await (
    await get("/api/platform/portal?view=public&churchId=" + churchId)
  ).json();
  assert.equal(publicResult.churches[0].representativeVerified, false);
  assert.match(ended, /Verify your role/);
  assert.equal(
    await db.churchCapabilityGrant.count({
      where: { sourceClaimId: id, revokedAt: null }
    }),
    0
  );
});
test("actual guest claim gate preserves a safe church target and performs no account action", async () => {
  const target = "/platform/church-claims/new?churchId=fixture-church";
  assert.equal(
    safeAccountReturn(target + "&token=secret&ownerId=other"),
    target
  );
  const content = await (await get(target)).text();
  if (production) {
    assert.match(
      content,
      /Join or sign in to prepare a church representative request/
    );
    assert.ok(content.includes("fixture-church"));
  } else assert.match(content, /Open the private church setup preview/);
  assert.equal((await get("/api/platform/church-claims")).status, 401);
});
