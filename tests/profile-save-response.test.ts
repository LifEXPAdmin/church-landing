import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { PrismaClient, type Prisma } from "@prisma/client";
import { sessionCookieFixtureName } from "../scripts/session-cookie-fixture.mjs";
import { assertPortalTestDatabase } from "./seed-portal";
import { accountConfig } from "../lib/platform/account-config";
import { handleAccountRequest } from "../lib/platform/account-boundary";
import { loginAccount, registerAccount } from "../lib/platform/accounts";
import { hashSessionToken } from "../lib/platform/auth";
import { getProfileEditor } from "../lib/platform/profiles";
import { ADULT_POLICY } from "../lib/platform/portal";

const db = new PrismaClient();
before(() => assertPortalTestDatabase(db));
after(() => db.$disconnect());

async function actor(eligible = false) {
  const suffix = randomBytes(7).toString("hex");
  const username = `ps_${suffix}`;
  const email = `${username}@example.test`;
  const password = `Fictional-only-${randomBytes(16).toString("hex")}`;
  const created = await registerAccount(db, {
    name: "Fictional profile response",
    username,
    email,
    password,
    confirmPassword: password,
    role: "BELIEVER"
  });
  assert.ok(created);
  if (eligible) {
    // Fictional prerequisite facts on this test's newly created actor only.
    // No global limiter reset, grants, other actors or delivery are touched.
    await db.platformUser.update({
      where: { id: created.id },
      data: {
        emailVerifiedAt: new Date(),
        adultAcknowledgedAt: new Date(),
        adultPolicyVersion: ADULT_POLICY
      }
    });
  }
  const token = await loginAccount(
    db,
    email,
    password,
    "profile-response-test"
  );
  return { id: created.id, username, token };
}
type Actor = Awaited<ReturnType<typeof actor>>;

async function fields(owner: Actor) {
  const profile = await getProfileEditor(db, owner.token);
  return {
    operation: "update-profile",
    name: profile.name,
    role: profile.role,
    bio: "Fictional response biography",
    location: "Fictional private response location",
    locationAudience: "ONLY_ME",
    website: "",
    interests: "",
    expectedVersion: profile.presentation.version,
    expectedLocationVersion: profile.locationVersion,
    profileModules: {
      testimony: "Fictional response testimony",
      skills: [],
      links: []
    }
  };
}

function post(
  client: PrismaClient,
  owner: Actor,
  body: Record<string, unknown>
) {
  const origin = accountConfig().origin;
  return handleAccountRequest(
    client,
    new Request(`${origin}/api/platform/account`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: origin,
        Cookie: `${sessionCookieFixtureName(origin)}=${owner.token}`,
        "X-Expected-Account": owner.id
      },
      body: JSON.stringify(body)
    })
  );
}

async function snapshot(owner: Actor) {
  return {
    user: await db.platformUser.findUniqueOrThrow({
      where: { id: owner.id },
      select: {
        name: true,
        role: true,
        bio: true,
        location: true,
        locationAudience: true,
        locationVersion: true,
        locationRecoveryRequired: true,
        website: true,
        interests: true
      }
    }),
    presentation: await db.profilePresentation.findUnique({
      where: { userId: owner.id }
    }),
    recovery: await db.retentionControl.findMany({
      where: { sourceId: owner.id },
      orderBy: { id: "asc" }
    })
  };
}

test("profile field validation is explicitly marked and leaves profile and recovery rows unchanged", async () => {
  const owner = await actor();
  const body = await fields(owner);
  for (const invalid of [
    { ...body, name: "x" },
    {
      ...body,
      profileModules: {
        ...body.profileModules,
        testimony: "Unsupported\u0001control"
      }
    }
  ]) {
    const before = await snapshot(owner);
    const response = await post(db, owner, invalid);
    assert.equal(response.status, 400);
    assert.equal(
      response.headers.get("X-Account-Code"),
      "ACCOUNT_PROFILE_VALIDATION"
    );
    const result = await response.json();
    assert.equal(result.code, "ACCOUNT_PROFILE_VALIDATION");
    assert.match(result.message, /Check your profile/);
    assert.deepEqual(await snapshot(owner), before);
    assert.equal(response.headers.get("set-cookie"), null);
  }
});

test("an unavailable selected event is marked validation without committing the proposed edit", async () => {
  const owner = await actor(true);
  const body = await fields(owner);
  const before = await snapshot(owner);
  const response = await post(db, owner, {
    ...body,
    profileModules: {
      ...body.profileModules,
      calendarOccurrenceId: `missing_${randomBytes(12).toString("hex")}`
    }
  });
  assert.equal(response.status, 400);
  assert.equal(
    response.headers.get("X-Account-Code"),
    "ACCOUNT_PROFILE_VALIDATION"
  );
  assert.match(
    (await response.json()).message,
    /selected event is no longer available/
  );
  assert.deepEqual(await snapshot(owner), before);
});

test("ineligible location disclosure is marked validation without changing profile versions or recovery rows", async () => {
  const owner = await actor();
  const body = await fields(owner);
  const before = await snapshot(owner);
  const response = await post(db, owner, {
    ...body,
    locationAudience: "MEMBERS"
  });
  assert.equal(response.status, 400);
  assert.equal(
    response.headers.get("X-Account-Code"),
    "ACCOUNT_PROFILE_VALIDATION"
  );
  assert.match((await response.json()).message, /Choose Only me/);
  assert.deepEqual(await snapshot(owner), before);
});

test("a committed profile followed by session loss returns unmarked 400 and retains the committed versions and recovery rows", async () => {
  const owner = await actor();
  const body = await fields(owner);
  const before = await snapshot(owner);
  const tokenHash = hashSessionToken(owner.token);
  let topLevelSessionReads = 0;
  let interruptedAfterCommit = false;
  const committedSnapshots: Awaited<ReturnType<typeof snapshot>>[] = [];
  const sessions = new Proxy(db.platformSession, {
    get(target, key) {
      if (key === "findUnique")
        return async (args: Prisma.PlatformSessionFindUniqueArgs) => {
          topLevelSessionReads++;
          const stored = await snapshot(owner);
          if (
            !interruptedAfterCommit &&
            stored.presentation?.version === body.expectedVersion + 1
          ) {
            // The transaction is already committed: observe its real data,
            // revoke only this test session, and execute the real follow-up read.
            assert.equal(stored.user.bio, body.bio);
            assert.equal(stored.user.location, body.location);
            assert.equal(
              stored.user.locationVersion,
              body.expectedLocationVersion + 1
            );
            committedSnapshots.push(stored);
            assert.equal(
              (await db.platformSession.deleteMany({ where: { tokenHash } }))
                .count,
              1
            );
            interruptedAfterCommit = true;
          }
          return target.findUnique(args);
        };
      const value = Reflect.get(target, key);
      return typeof value === "function" ? value.bind(target) : value;
    }
  });
  const interrupted = new Proxy(db, {
    get(target, key) {
      if (key === "platformSession") return sessions;
      const value = Reflect.get(target, key);
      // Transactions run unmodified on the actual Prisma client. The hook
      // affects only the top-level session read after their commit.
      return typeof value === "function" ? value.bind(target) : value;
    }
  });
  const response = await post(interrupted, owner, body);
  assert.equal(interruptedAfterCommit, true);
  assert.ok(topLevelSessionReads >= 2);
  assert.equal(response.status, 400);
  assert.equal(response.headers.get("X-Account-Code"), null);
  const result = await response.json();
  assert.equal(result.code, "ACCOUNT_VALIDATION");
  assert.match(result.message, /sign in again/);
  assert.equal(response.headers.get("set-cookie"), null);
  const after = await snapshot(owner);
  assert.equal(committedSnapshots.length, 1);
  assert.deepEqual(after, committedSnapshots[0]);
  assert.equal(after.presentation?.version, body.expectedVersion + 1);
  assert.equal(after.user.locationVersion, before.user.locationVersion + 1);
  assert.equal(after.user.bio, body.bio);
  assert.equal(after.user.location, body.location);
  assert.equal(
    after.recovery.filter((row) => row.kind === "PROFILE_MODULES").length,
    1
  );
  assert.equal(
    after.recovery.filter((row) => row.kind === "PROFILE_LOCATION").length,
    1
  );
  assert.equal(await db.platformSession.count({ where: { tokenHash } }), 0);
});

test("unrelated account validation does not receive the profile rejection assurance", async () => {
  const owner = await actor();
  const before = await snapshot(owner);
  const response = await post(db, owner, {
    operation: "not-a-profile-operation"
  });
  assert.equal(response.status, 400);
  assert.equal(response.headers.get("X-Account-Code"), null);
  assert.notEqual((await response.json()).code, "ACCOUNT_PROFILE_VALIDATION");
  assert.deepEqual(await snapshot(owner), before);
});
