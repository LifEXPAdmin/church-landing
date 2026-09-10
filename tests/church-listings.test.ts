import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  assertPortalTestDatabase,
  createPortalActor,
  seedOperatorGrants,
  type PortalActor
} from "./seed-portal";
import {
  churchListingCommand,
  getChurchListings
} from "../lib/platform/church-listings";
import { projectListingData } from "../lib/platform/church-listing-data";
import {
  getPortalSnapshot,
  portalCommand,
  PortalError,
  publicChurches
} from "../lib/platform/portal";
import {
  prepareAccountExport,
  downloadAccountExport
} from "../lib/platform/account-export";
import { deactivateAccount } from "../lib/platform/account-lifecycle";
import { handleChurchListingRequest } from "../lib/platform/church-listing-boundary";
import type { ChurchSummary } from "../lib/platform/portal-types";

const db = new PrismaClient();
let reviewer: PortalActor;
before(async () => {
  await assertPortalTestDatabase(db);
  reviewer = await createPortalActor(db, "listreview");
  await seedOperatorGrants(db, reviewer, ["REVIEW_CHURCH_LISTINGS"]);
});
after(() => db.$disconnect());
const cmd = (actor: PortalActor, input: Record<string, unknown>) =>
  churchListingCommand(db, actor.token, input);
const denied = (work: Promise<unknown>, status = 403) =>
  assert.rejects(
    work,
    (error: unknown) => error instanceof PortalError && error.status === status
  );
const draft = async (actor: PortalActor, churchId?: string) =>
  cmd(actor, {
    operation: "create",
    requestKey: randomUUID(),
    kind: churchId ? "CORRECTION" : "COMMUNITY",
    churchId
  });
const read = async (actor: PortalActor, id: string) =>
  (await getChurchListings(db, actor.token, id)).submissions[0];
const details = (name = "Fictional Listing " + randomUUID()) =>
  projectListingData({
    name,
    city: "Lakeshore",
    country: "Fictional Country",
    locationModel: "NO_BUILDING",
    summary: "Public fictional description",
    publicEmail: "office@example.test",
    website: "https://example.test/" + randomUUID()
  });
async function save(
  actor: PortalActor,
  id: string,
  data: ReturnType<typeof details>,
  expectedChurchVersion?: number
) {
  const row = await read(actor, id);
  await cmd(actor, {
    operation: "save",
    id,
    expectedVersion: row.version,
    expectedChurchVersion,
    data
  });
  return read(actor, id);
}
async function publish(actor: PortalActor, id: string) {
  const row = await read(actor, id);
  return cmd(actor, {
    operation: "publish",
    id,
    expectedVersion: row.version,
    publicConfirmed: true,
    searchedConfirmed: true
  });
}
async function decision(
  actor: PortalActor,
  id: string,
  action = "APPROVE",
  extra = {}
) {
  const row = await db.churchListingSubmission.findUniqueOrThrow({
    where: { id }
  });
  return cmd(actor, {
    operation: "review",
    id,
    expectedVersion: row.version,
    action,
    reason: "Fictional independent public facts check",
    publicConfirmed: true,
    distinctConfirmed: true,
    ...extra
  });
}

test("listing creation requires current eligible ownership and cannot forge publication, church grants or another owner", async () => {
  const unverified = await createPortalActor(db, "listunver", {
    verified: false
  });
  const minor = await createPortalActor(db, "listadult", { adult: false });
  await denied(draft(unverified));
  await denied(draft(minor));
  await denied(churchListingCommand(db, "", { operation: "create" }), 401);
  const owner = await createPortalActor(db, "listowner");
  const other = await createPortalActor(db, "listother");
  const created = await cmd(owner, {
    operation: "create",
    kind: "COMMUNITY",
    requestKey: randomUUID(),
    ownerId: other.id,
    status: "PUBLISHED",
    capability: "REVIEW_CONNECTIONS",
    churchId: "forged"
  });
  const row = await read(owner, created.id);
  assert.equal(row.status, "DRAFT");
  assert.equal(row.churchId, null);
  await denied(getChurchListings(db, other.token, row.id), 404);
  await denied(
    cmd(other, {
      operation: "save",
      id: row.id,
      expectedVersion: 1,
      data: details()
    }),
    404
  );
  await denied(getChurchListings(db, other.token, undefined, true));
  assert.equal(
    await db.churchCapabilityGrant.count({ where: { userId: owner.id } }),
    0
  );
  await db.platformSession.deleteMany({ where: { userId: owner.id } });
  await denied(getChurchListings(db, owner.token), 401);
});

test("public confirmation publishes once, preserves church identity, and grants no member or operator access", async () => {
  const owner = await createPortalActor(db, "listpub");
  const created = await draft(owner);
  const data = {
    ...details(),
    country: "",
    city: "",
    serviceArea: "Fictional global ministry " + randomUUID()
  };
  await save(owner, created.id, {
    ...data,
    summary: "Private draft marker before publication"
  });
  assert.equal(
    (await publicChurches(db, undefined, undefined, data.name)).length,
    0
  );
  await denied(
    cmd(owner, { operation: "publish", id: created.id, expectedVersion: 2 }),
    400
  );
  await save(owner, created.id, data);
  const result = await publish(owner, created.id);
  assert.ok(result.churchId);
  const replay = await publish(owner, created.id);
  assert.equal(replay.churchId, result.churchId);
  assert.equal(await db.church.count({ where: { name: data.name } }), 1);
  const publicRow = (await publicChurches(db, result.churchId!))[0];
  assert.equal(publicRow.communityListed, true);
  assert.equal(publicRow.publicEmail, data.publicEmail);
  assert.equal(
    await db.churchConnection.count({ where: { churchId: publicRow.id } }),
    0
  );
  assert.equal(
    await db.churchCapabilityGrant.count({ where: { churchId: publicRow.id } }),
    0
  );
  assert.equal(
    await db.platformOperatorGrant.count({ where: { userId: owner.id } }),
    0
  );
  for (const secret of [
    owner.email,
    owner.token,
    owner.id,
    "requestKey",
    "reviewReason",
    "Private draft marker"
  ])
    assert.ok(!JSON.stringify(publicRow).includes(secret));
  await denied(getPortalSnapshot(db, owner.token, "directory", publicRow.id));
  await denied(
    portalCommand(db, owner.token, {
      operation: "grant",
      churchId: publicRow.id,
      userId: owner.id,
      capability: "REVIEW_CONNECTIONS",
      expectedVersion: 0
    })
  );
  await denied(
    cmd(owner, {
      operation: "save",
      id: created.id,
      expectedVersion: (await read(owner, created.id)).version,
      data: details()
    }),
    409
  );
  for (const q of [
    data.city,
    data.country,
    data.website,
    data.serviceArea
  ].filter(Boolean))
    assert.ok(
      (await publicChurches(db, undefined, undefined, q)).some(
        (c) => c.id === publicRow.id
      )
    );
});

test("concurrent duplicate publication creates one listing and a review submission without automatic merging", async () => {
  const a = await createPortalActor(db, "listdupa");
  const b = await createPortalActor(db, "listdupb");
  const da = await draft(a);
  const dbb = await draft(b);
  const data = details();
  await save(a, da.id, data);
  await save(b, dbb.id, data);
  await Promise.all([publish(a, da.id), publish(b, dbb.id)]);
  const rows = await db.churchListingSubmission.findMany({
    where: { id: { in: [da.id, dbb.id] } }
  });
  assert.deepEqual(rows.map((r) => r.status).sort(), [
    "PUBLISHED",
    "SUBMITTED"
  ]);
  assert.equal(await db.church.count({ where: { name: data.name } }), 1);
  const pending = rows.find((r) => r.status === "SUBMITTED")!;
  assert.equal(pending.churchId, null);
  const owner = pending.ownerId === a.id ? a : b;
  await seedOperatorGrants(db, owner, ["REVIEW_CHURCH_LISTINGS"]);
  await denied(decision(owner, pending.id));
  await denied(
    decision(reviewer, pending.id, "APPROVE", { distinctConfirmed: false }),
    400
  );
  await decision(reviewer, pending.id, "NEEDS_INFORMATION");
  assert.equal((await read(owner, pending.id)).status, "NEEDS_INFORMATION");
  await save(owner, pending.id, {
    ...data,
    city: "Second campus",
    website: ""
  });
  await publish(owner, pending.id);
  await decision(reviewer, pending.id);
  assert.equal(await db.church.count({ where: { name: data.name } }), 2);
  assert.equal(
    await db.churchCapabilityGrant.count({ where: { userId: owner.id } }),
    0
  );
});

test("corrections are private until independent review; stale canonical versions and revoked review grants deny writes", async () => {
  const owner = await createPortalActor(db, "listcor");
  const other = await createPortalActor(db, "listmod");
  const church = await db.church.create({
    data: {
      name: "Correction fixture",
      slug: randomUUID(),
      summary: "Original public facts"
    }
  });
  const d = await draft(owner, church.id);
  await denied(save(owner, d.id, details()), 409);
  await save(
    owner,
    d.id,
    details("Updated public church name"),
    church.version
  );
  await publish(owner, d.id);
  assert.equal(
    (await db.church.findUniqueOrThrow({ where: { id: church.id } })).summary,
    "Original public facts"
  );
  await seedOperatorGrants(db, other, ["MANAGE_CHURCH_ACCESS"]);
  await denied(decision(other, d.id));
  await db.church.update({
    where: { id: church.id },
    data: {
      summary: "Concurrent canonical correction",
      version: { increment: 1 }
    }
  });
  await denied(decision(reviewer, d.id), 409);
  await decision(reviewer, d.id, "NEEDS_INFORMATION");
  await denied(save(owner, d.id, details(), 1), 409);
  await save(owner, d.id, details("Updated public church name"), 2);
  await publish(owner, d.id);
  const row = await read(owner, d.id);
  const results = await Promise.allSettled(
    [0, 1].map(() =>
      cmd(reviewer, {
        operation: "review",
        id: row.id,
        expectedVersion: row.version,
        action: "APPROVE",
        publicConfirmed: true,
        reason: "Checked public facts"
      })
    )
  );
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  const updated = await db.church.findUniqueOrThrow({
    where: { id: church.id }
  });
  assert.equal(updated.version, 3);
  assert.equal(updated.slug, church.slug);
  assert.equal(updated.name, "Updated public church name");
  const grant = await db.platformOperatorGrant.findFirstOrThrow({
    where: { userId: reviewer.id, capability: "REVIEW_CHURCH_LISTINGS" }
  });
  await db.platformOperatorGrant.update({
    where: { id: grant.id },
    data: { revokedAt: new Date() }
  });
  await denied(getChurchListings(db, reviewer.token, undefined, true));
  await denied(decision(reviewer, d.id), 403);
  await db.platformOperatorGrant.update({
    where: { id: grant.id },
    data: { revokedAt: null }
  });
});

test("draft validation, optimistic saves, withdrawal, idempotency and daily limits preserve unfinished work", async () => {
  const owner = await createPortalActor(db, "listvalid");
  const key = randomUUID();
  const body = { operation: "create", kind: "COMMUNITY", requestKey: key };
  const [a, b] = await Promise.all([cmd(owner, body), cmd(owner, body)]);
  assert.equal(a.id, b.id);
  await denied(
    cmd(owner, { ...body, kind: "CORRECTION", churchId: "different" }),
    409
  );
  await save(owner, a.id, projectListingData({ name: "Incomplete draft" }));
  await denied(publish(owner, a.id), 400);
  for (const data of [
    { ...details(), website: "javascript:alert(1)" },
    { ...details(), website: "https://user:password@example.test" },
    { ...details(), publicEmail: "invalid" },
    { ...details(), summary: "x".repeat(1001) },
    { ...details(), publicPhone: "private-phone" }
  ])
    await denied(save(owner, a.id, data), 400);
  const row = await read(owner, a.id);
  const results = await Promise.allSettled(
    [0, 1].map((i) =>
      cmd(owner, {
        operation: "save",
        id: a.id,
        expectedVersion: row.version,
        data: details("Concurrent " + i)
      })
    )
  );
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  await cmd(owner, {
    operation: "withdraw",
    id: a.id,
    expectedVersion: (await read(owner, a.id)).version
  });
  await denied(publish(owner, a.id), 409);
  for (let i = 0; i < 9; i++) await draft(owner);
  await denied(draft(owner), 429);
});

test("draft export contains only owned public field choices; deactivation blocks pending publication", async () => {
  const owner = await createPortalActor(db, "listexport");
  const other = await createPortalActor(db, "listpriv");
  const a = await draft(owner);
  const b = await draft(other);
  await save(owner, a.id, details("Own private export draft"));
  await save(other, b.id, details("Excluded unrelated draft"));
  await db.churchListingSubmission.update({
    where: { id: a.id },
    data: {
      data: {
        ...details("Own private export draft"),
        privateInjected: "Must not serialize unexpected JSON"
      }
    }
  });
  const secret = process.env.AUTH_RATE_LIMIT_SECRET!;
  const proof = await prepareAccountExport(
    db,
    owner.token,
    owner.password,
    secret
  );
  const content = await downloadAccountExport(
    db,
    owner.token,
    proof.authorization,
    secret
  );
  assert.ok(content.includes("Own private export draft"));
  for (const value of [
    "Excluded unrelated draft",
    "Must not serialize unexpected JSON",
    owner.token,
    "requestKey"
  ])
    assert.ok(!content.includes(value));
  const church = await db.church.create({
    data: {
      slug: randomUUID(),
      name: "Deactivation fixture",
      summary: "Public survives"
    }
  });
  const correction = await draft(owner, church.id);
  await save(owner, correction.id, details(), 1);
  await publish(owner, correction.id);
  await deactivateAccount(db, owner.token, owner.password, true);
  await denied(decision(reviewer, correction.id));
  assert.equal(
    (await db.church.findUniqueOrThrow({ where: { id: church.id } })).summary,
    "Public survives"
  );
  await denied(getChurchListings(db, owner.token), 401);
});

test("listing boundary enforces origin, session, body size, methods and private no-store responses", async () => {
  const owner = await createPortalActor(db, "listbound");
  const origin = process.env.ACCOUNT_ORIGIN!;
  const request = (
    method: string,
    body?: unknown,
    headers = {},
    token = owner.token
  ) =>
    handleChurchListingRequest(
      db,
      new Request(origin + "/api/platform/church-listings", {
        method,
        headers: {
          Origin: origin,
          "Content-Type": "application/json",
          Cookie: "church_platform_session=" + token,
          ...headers
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {})
      })
    );
  const body = {
    operation: "create",
    kind: "COMMUNITY",
    requestKey: randomUUID()
  };
  assert.equal(
    (await request("POST", body, { Origin: "https://evil.test" })).status,
    403
  );
  assert.equal(
    (await request("POST", body, { "sec-fetch-site": "cross-site" })).status,
    403
  );
  assert.equal((await request("POST", body, {}, "")).status, 401);
  assert.equal(
    (await request("POST", { ...body, data: "x".repeat(100000) })).status,
    400
  );
  assert.equal((await request("DELETE")).status, 405);
  const response = await request("POST", body);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control")!, /no-store/);
  assert.equal(response.headers.get("vary"), "Cookie");
  assert.equal(response.headers.get("set-cookie"), null);
  assert.equal((await request("GET", undefined, {}, "")).status, 401);
});

test("public connection readiness uses current scoped review grants without exposing reviewer identities", async () => {
  const owner = await createPortalActor(db, "listready");
  const reviewer = await createPortalActor(db, "listreader");
  const church = await db.church.create({
    data: {
      name: "Readiness fixture",
      slug: randomUUID(),
      summary: "Public facts",
      communityListed: true
    }
  });
  const ready = async () =>
    (await publicChurches(db, church.id))[0] as ChurchSummary;
  assert.equal((await ready()).connectionsAvailable, false);
  const dependency = await db.churchConnection.create({
    data: { userId: reviewer.id, churchId: church.id, state: "APPROVED" }
  });
  const grant = await db.churchCapabilityGrant.create({
    data: {
      userId: reviewer.id,
      churchId: church.id,
      capability: "REVIEW_CONNECTIONS",
      dependencyConnectionId: dependency.id
    }
  });
  assert.equal((await ready()).connectionsAvailable, true);
  assert.equal(
    (await getPortalSnapshot(db, reviewer.token, "discover", church.id)).church!
      .connectionsAvailable,
    false,
    "cannot review own request"
  );
  assert.equal(
    (await getPortalSnapshot(db, owner.token, "discover", church.id)).church!
      .connectionsAvailable,
    true
  );
  for (const secret of [
    reviewer.id,
    reviewer.email,
    reviewer.token,
    grant.id,
    dependency.id
  ])
    assert.ok(!JSON.stringify(await ready()).includes(secret));
  await db.churchConnection.update({
    where: { id: dependency.id },
    data: { state: "LEFT" }
  });
  assert.equal((await ready()).connectionsAvailable, false);
  await db.churchConnection.update({
    where: { id: dependency.id },
    data: { state: "APPROVED" }
  });
  await db.churchCapabilityGrant.update({
    where: { id: grant.id },
    data: { revokedAt: new Date() }
  });
  assert.equal((await ready()).connectionsAvailable, false);
});
