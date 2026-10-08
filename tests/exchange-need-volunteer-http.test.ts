import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { sessionCookieFixtureName } from "../scripts/session-cookie-fixture.mjs";
import { assertPortalTestDatabase, seedOperatorGrants } from "./seed-portal";
import { seedParticipation } from "./seed-post-participation";
import { exchangeNeedCommand } from "../lib/platform/exchange-need-commands";
import { readExchangeNeeds } from "../lib/platform/exchange-need-reads";
import { exchangeListingCommand } from "../lib/platform/exchange-listings";
import { EXCHANGE_ITEM_POLICY } from "../lib/platform/exchange-options";
import { NEED_SCHEMA } from "../lib/platform/exchange-need-options";
import { privilegedAuthenticatorCommand } from "../lib/platform/privileged-auth";
import {
  openAuthenticator,
  authenticatorTotp
} from "../lib/platform/admin-authenticator-crypto";
import { loginAccount } from "../lib/platform/accounts";

const db = new PrismaClient();
const origin = process.env.ACCOUNT_ORIGIN!;
assert.match(origin, /^https:\/\/127\.0\.0\.1:\d+$/);
before(async () => {
  await assertPortalTestDatabase(db);
  assert.equal(process.env.PRIVILEGED_MFA_MODE, "enforce");
  assert.equal(process.env.COMMUNITY_REPORTS_ENABLED, "true");
});
after(async () => {
  await db.$disconnect();
});
const input = (operation: string, fields: Record<string, unknown>) => ({
  operation,
  mutationId: randomUUID(),
  ...fields
});
const request = (
  path: string,
  token = "",
  headers: Record<string, string> = {},
  body?: string
) =>
  fetch(origin + path, {
    redirect: "manual",
    method: body === undefined ? "GET" : "POST",
    headers: {
      cookie: `${sessionCookieFixtureName()}=${token}`,
      origin,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...headers
    },
    ...(body === undefined ? {} : { body })
  });
function privateResponse(response: Response) {
  for (const header of [
    "cache-control",
    "cdn-cache-control",
    "vercel-cdn-cache-control"
  ])
    assert.match(response.headers.get(header)!, /no-store/);
}
const pinned = (path: string, token: string, owner: string) =>
  request(path, token, { "x-expected-account": owner });
const post = (token: string, owner: string, body: string) =>
  request(
    "/api/platform/exchange",
    token,
    { "x-expected-account": owner },
    body
  );

// Only this fictional seed process temporarily disables MFA. The independently
// running production build remains in enforce mode for every HTTPS assertion.
async function fixture() {
  const prior = process.env.PRIVILEGED_MFA_MODE;
  process.env.PRIVILEGED_MFA_MODE = "off";
  try {
    const f = await seedParticipation(db);
    await seedOperatorGrants(db, f.operator, ["REVIEW_COMMUNITY_REPORTS"]);
    await db.churchCapabilityGrant.create({
      data: {
        churchId: f.churchA.id,
        userId: f.ada.id,
        capability: "MANAGE_EXCHANGE_LISTINGS"
      }
    });
    await db.socialPreferences.upsert({
      where: { ownerId: f.ada.id },
      create: { ownerId: f.ada.id, contactRequests: "EVERYONE" },
      update: { contactRequests: "EVERYONE" }
    });
    const listing = await db.exchangeListing.create({
      data: {
        ownerChurchId: f.churchA.id,
        creatorId: f.ada.id,
        intent: "CHURCH_NEED",
        category: "HOUSEHOLD",
        title: "Fictional volunteer HTTP Need " + randomUUID(),
        description: "Isolated volunteer completion privacy acceptance",
        requestedItems: "Two event helpers",
        audience: "CHURCH",
        audienceChurchId: f.churchA.id,
        country: "US",
        placeId: 4887398,
        placeLabel: "Chicago"
      }
    });
    const need = await exchangeNeedCommand(
      db,
      f.ada.token,
      input("configure", {
        listingId: listing.id,
        listingVersion: listing.version,
        expectedVersion: 0,
        deadlineLocal: new Date(Date.now() + 3 * 86400000)
          .toISOString()
          .slice(0, 16),
        timeZone: "UTC",
        acceptCoordinator: true
      })
    );
    const role = await f.slot({
      capacity: 2,
      role: "Fictional volunteer HTTP role " + randomUUID()
    });
    const needSlot = await exchangeNeedCommand(
      db,
      f.ada.token,
      input("slot", {
        needId: need.id,
        slotId: randomUUID(),
        expectedVersion: 0,
        schema: NEED_SCHEMA,
        fields: {
          action: "VOLUNTEER",
          label: "Fictional event helpers",
          unit: "places",
          target: 2,
          loan: false,
          returnLocal: null,
          returnTimeZone: null,
          returnResponsibility: "",
          volunteerSlotId: role.id
        }
      })
    );
    const ready = await db.exchangeListing.findUniqueOrThrow({
      where: { id: listing.id }
    });
    await exchangeListingCommand(
      db,
      f.ada.token,
      input("status", {
        listingId: listing.id,
        expectedVersion: ready.version,
        state: "ACTIVE",
        itemPolicy: EXCHANGE_ITEM_POLICY,
        itemConfirmed: true
      })
    );
    const signups = [];
    for (const actor of [f.val, f.morgan])
      signups.push(
        await f.command(actor, {
          operation: "volunteer",
          slotId: role.id,
          slotVersion: role.version,
          expectedVersion: 0
        })
      );
    return {
      ...f,
      listing,
      need,
      needSlot,
      role,
      signups,
      page: `/platform/exchange/${listing.id}/needs?volunteers=${needSlot.id}`,
      endpoint: `/api/platform/exchange?view=need-volunteers&id=${needSlot.id}`
    };
  } finally {
    if (prior === undefined) delete process.env.PRIVILEGED_MFA_MODE;
    else process.env.PRIVILEGED_MFA_MODE = prior;
  }
}
type Fixture = Awaited<ReturnType<typeof fixture>>;

async function proveCoordinator(f: Fixture) {
  assert.equal(process.env.PRIVILEGED_MFA_MODE, "enforce");
  await privilegedAuthenticatorCommand(
    db,
    f.ada.token,
    { operation: "mfa-start", requestKey: randomUUID(), expectedVersion: 0 },
    f.ada.password
  );
  const factor = await db.adminAuthenticator.findUniqueOrThrow({
    where: { userId: f.ada.id }
  });
  const secret = openAuthenticator(f.ada.id, factor.secretCiphertext);
  const enrolledCounter = BigInt(Math.floor(Date.now() / 30000));
  const enrolled = await privilegedAuthenticatorCommand(
    db,
    f.ada.token,
    {
      operation: "mfa-confirm",
      requestKey: randomUUID(),
      expectedVersion: factor.version,
      code: authenticatorTotp(secret, enrolledCounter)
    },
    undefined
  );
  const currentCounter = BigInt(Math.floor(Date.now() / 30000));
  await privilegedAuthenticatorCommand(
    db,
    f.ada.token,
    {
      operation: "mfa-challenge",
      requestKey: randomUUID(),
      expectedVersion: Number(enrolled.version),
      purpose: "privileged-work",
      code: authenticatorTotp(
        secret,
        currentCounter > enrolledCounter
          ? currentCounter
          : enrolledCounter + BigInt(1)
      )
    },
    undefined
  );
}
async function rosterDenied(
  f: Fixture,
  token: string,
  owner: string,
  status: number
) {
  const response = await pinned(f.endpoint, token, owner);
  assert.equal(response.status, status);
  privateResponse(response);
  const body = await response.text();
  for (const value of [
    ...f.signups.map((row) => row.id),
    f.val.name,
    f.morgan.name
  ])
    assert.ok(
      !body.includes(value),
      "Denied roster must not disclose a private row"
    );
}
async function bootstrapPrivate(
  f: Fixture,
  token: string,
  extraSecrets: string[] = []
) {
  for (const headers of [{}, { RSC: "1" }] as Record<string, string>[]) {
    const response = await request(f.page, token, headers);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("cache-control")!, /no-store/);
    const source = await response.text();
    for (const secret of [
      ...f.signups.map((row) => row.id),
      f.val.name,
      f.morgan.name,
      ...extraSecrets
    ])
      assert.ok(
        !source.includes(secret),
        "Initial HTML/RSC disclosed a private volunteer value"
      );
    assert.doesNotMatch(source.replaceAll("\\", ""), /"volunteerRole"\s*:/);
    // Need/slot routing IDs and public event-role context can legitimately occur
    // elsewhere on the Need page. They are not private signup snapshot values.
  }
}

test("volunteer roster stays out of initial HTML/RSC and requires the current owner, session MFA and duties", async () => {
  const f = await fixture();
  await rosterDenied(f, f.ada.token, f.ada.id, 404);
  await proveCoordinator(f);
  for (const token of [f.ada.token, f.val.token, ""])
    await bootstrapPrivate(f, token);
  const response = await pinned(f.endpoint, f.ada.token, f.ada.id);
  assert.equal(response.status, 200);
  privateResponse(response);
  const data = await response.json();
  const canonical = await readExchangeNeeds(db, f.ada.token, {
    view: "volunteers",
    id: f.needSlot.id
  });
  assert.deepEqual(data, canonical);
  assert.ok("volunteers" in data && data.volunteers);
  assert.equal(data.ownerId, f.ada.id);
  assert.equal(data.volunteerNeedId, f.need.id);
  assert.equal(data.volunteerSlotId, f.needSlot.id);
  assert.deepEqual(
    data.volunteers.map((row: { id: string }) => row.id).sort(),
    f.signups.map((row) => row.id).sort()
  );
  assert.deepEqual(
    data.volunteers.map((row: { name: string }) => row.name).sort(),
    [f.val.name, f.morgan.name].sort()
  );
  const anchor = data.volunteers[0].id;
  const paged = await pinned(
    f.endpoint + "&after=" + encodeURIComponent(anchor),
    f.ada.token,
    f.ada.id
  );
  assert.equal(paged.status, 200);
  privateResponse(paged);
  const next = await paged.json();
  assert.deepEqual(
    next,
    await readExchangeNeeds(db, f.ada.token, {
      view: "volunteers",
      id: f.needSlot.id,
      after: anchor
    })
  );
  assert.ok("volunteers" in next && next.volunteers);
  assert.equal(next.volunteers.length, 1);
  assert.notEqual(next.volunteers[0].id, anchor);
  for (const [token, owner, status] of [
    [f.ada.token, f.val.id, 401],
    [f.val.token, f.ada.id, 401],
    ["", f.ada.id, 401],
    [f.val.token, f.val.id, 404]
  ] as const)
    await rosterDenied(f, token, owner, status);
  const secondSession = await loginAccount(
    db,
    f.ada.email,
    f.ada.password,
    "Fictional unproven volunteer coordinator"
  );
  await rosterDenied(f, secondSession, f.ada.id, 404);
  // A role id is not an interchangeable Need-slot routing identity.
  const wrongSlot = await pinned(
    "/api/platform/exchange?view=need-volunteers&id=" + f.role.id,
    f.ada.token,
    f.ada.id
  );
  assert.equal(wrongSlot.status, 404);
  privateResponse(wrongSlot);
  await db.platformUser.update({
    where: { id: f.morgan.id },
    data: { suspendedAt: new Date() }
  });
  const redacted = await pinned(f.endpoint, f.ada.token, f.ada.id);
  assert.equal(redacted.status, 200);
  privateResponse(redacted);
  const redactedData = await redacted.json();
  const unavailable = redactedData.volunteers.find(
    (row: { id: string }) => row.id === f.signups[1].id
  );
  assert.equal(unavailable.name, "Unavailable account");
  assert.ok(!JSON.stringify(redactedData).includes(f.morgan.name));
  await db.churchCapabilityGrant.update({
    where: {
      userId_churchId_capability: {
        userId: f.ada.id,
        churchId: f.churchA.id,
        capability: "MANAGE_CHURCH_VOLUNTEERS"
      }
    },
    data: { revokedAt: new Date(), version: { increment: 1 } }
  });
  await rosterDenied(f, f.ada.token, f.ada.id, 404);
});

test("volunteer HTTPS commands preserve canonical signup receipts, correction reasons and replay authority", async () => {
  const f = await fixture();
  const signup = await db.postVolunteerSignup.findUniqueOrThrow({
    where: { id: f.signups[0].id }
  });
  const sibling = await db.postVolunteerSignup.findUniqueOrThrow({
    where: { id: f.signups[1].id }
  });
  const body = JSON.stringify(
    input("need-complete-volunteer", {
      needId: f.need.id,
      signupId: signup.id,
      expectedVersion: signup.version,
      completed: true,
      reason: ""
    })
  );
  const denied = async (
    token: string,
    owner: string,
    expectedStatus: number,
    value = body
  ) => {
    const response = await post(token, owner, value);
    assert.equal(response.status, expectedStatus);
    privateResponse(response);
    return response;
  };
  await denied(f.ada.token, f.ada.id, 404);
  await proveCoordinator(f);
  await denied(f.ada.token, f.val.id, 401);
  await denied(f.val.token, f.ada.id, 401);
  await denied("", f.ada.id, 401);
  await denied(f.val.token, f.val.id, 404);
  const unpinned = await request(
    "/api/platform/exchange",
    f.ada.token,
    {},
    body
  );
  assert.equal(unpinned.status, 401);
  privateResponse(unpinned);
  const crossOrigin = await request(
    "/api/platform/exchange",
    f.ada.token,
    {
      "x-expected-account": f.ada.id,
      origin: "https://other.example.test"
    },
    body
  );
  assert.equal(crossOrigin.status, 403);
  privateResponse(crossOrigin);
  assert.equal(
    (
      await db.postVolunteerSignup.findUniqueOrThrow({
        where: { id: signup.id }
      })
    ).version,
    signup.version
  );
  const response = await post(f.ada.token, f.ada.id, body);
  assert.equal(response.status, 200);
  privateResponse(response);
  const saved = await response.json();
  assert.equal(saved.id, signup.id);
  assert.equal(saved.version, signup.version + 1);
  const completed = await db.postVolunteerSignup.findUniqueOrThrow({
    where: { id: signup.id }
  });
  assert.ok(completed.completedAt);
  assert.equal(completed.version, saved.version);
  const replay = await post(f.ada.token, f.ada.id, body);
  assert.equal(replay.status, 200);
  privateResponse(replay);
  assert.deepEqual(await replay.json(), saved);
  assert.deepEqual(
    await db.postVolunteerSignup.findUniqueOrThrow({
      where: { id: signup.id }
    }),
    completed
  );
  assert.equal(
    await db.postAudit.count({
      where: { targetId: signup.id, action: "volunteer-completed" }
    }),
    1
  );
  await denied(
    f.ada.token,
    f.ada.id,
    409,
    JSON.stringify({
      ...JSON.parse(body),
      completed: false,
      reason: "Changed original command"
    })
  );
  await denied(
    f.ada.token,
    f.ada.id,
    409,
    JSON.stringify({
      ...JSON.parse(body),
      mutationId: randomUUID()
    })
  );
  const correction = input("need-complete-volunteer", {
    needId: f.need.id,
    signupId: signup.id,
    expectedVersion: saved.version,
    completed: false,
    reason: ""
  });
  await denied(f.ada.token, f.ada.id, 400, JSON.stringify(correction));
  assert.deepEqual(
    await db.postVolunteerSignup.findUniqueOrThrow({
      where: { id: signup.id }
    }),
    completed
  );
  const reason = "Fictional private completion correction " + randomUUID();
  const correctionBody = JSON.stringify({
    ...correction,
    mutationId: randomUUID(),
    reason
  });
  const correctedResponse = await post(f.ada.token, f.ada.id, correctionBody);
  assert.equal(correctedResponse.status, 200);
  privateResponse(correctedResponse);
  const correctedReceipt = await correctedResponse.json();
  assert.equal(correctedReceipt.id, signup.id);
  assert.equal(correctedReceipt.version, saved.version + 1);
  const corrected = await db.postVolunteerSignup.findUniqueOrThrow({
    where: { id: signup.id }
  });
  assert.equal(corrected.completedAt, null);
  assert.equal(corrected.version, correctedReceipt.version);
  const correctionReplay = await post(f.ada.token, f.ada.id, correctionBody);
  assert.equal(correctionReplay.status, 200);
  privateResponse(correctionReplay);
  assert.deepEqual(await correctionReplay.json(), correctedReceipt);
  assert.equal(
    await db.postAudit.count({
      where: { targetId: signup.id, action: "volunteer-completion-corrected" }
    }),
    1
  );
  assert.equal(
    await db.exchangeNeedEvent.count({
      where: {
        needId: f.need.id,
        targetId: signup.id,
        action: "VOLUNTEER-COMPLETION-CORRECTED",
        text: reason
      }
    }),
    1
  );
  assert.equal(
    await db.exchangeNeedContribution.count({
      where: { needId: f.need.id }
    }),
    0,
    "Completion must use the original canonical signup, not a mirrored contribution"
  );
  assert.deepEqual(
    await db.postVolunteerSignup.findUniqueOrThrow({
      where: { id: f.signups[1].id }
    }),
    sibling
  );
  const roster = await pinned(f.endpoint, f.ada.token, f.ada.id);
  assert.equal(roster.status, 200);
  privateResponse(roster);
  const rosterData = await roster.json();
  assert.equal(
    rosterData.volunteers.find((row: { id: string }) => row.id === signup.id)
      .completedAt,
    null
  );
  assert.ok(!JSON.stringify(rosterData).includes(reason));
  await bootstrapPrivate(f, f.ada.token, [reason]);
  const secondSession = await loginAccount(
    db,
    f.ada.email,
    f.ada.password,
    "Fictional second completion session"
  );
  await denied(secondSession, f.ada.id, 404, correctionBody);
  await db.churchCapabilityGrant.update({
    where: {
      userId_churchId_capability: {
        userId: f.ada.id,
        churchId: f.churchA.id,
        capability: "MANAGE_EXCHANGE_LISTINGS"
      }
    },
    data: { revokedAt: new Date(), version: { increment: 1 } }
  });
  await denied(f.ada.token, f.ada.id, 404, correctionBody);
  assert.deepEqual(
    await db.postVolunteerSignup.findUniqueOrThrow({
      where: { id: signup.id }
    }),
    corrected
  );
});
