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
  churchClaimCommand,
  getChurchClaims,
  CLAIM_POLICY
} from "../lib/platform/church-claims";
import { projectListingData } from "../lib/platform/church-listing-data";
import {
  projectClaimAuthority,
  claimScopes
} from "../lib/platform/church-claim-data";
import {
  portalCommand,
  publicChurches,
  PortalError
} from "../lib/platform/portal";
import { loginAccount } from "../lib/platform/accounts";
import {
  prepareAccountExport,
  downloadAccountExport
} from "../lib/platform/account-export";
import { handleChurchClaimRequest } from "../lib/platform/church-claim-boundary";

const db = new PrismaClient();
let reviewer: PortalActor;
before(async () => {
  await assertPortalTestDatabase(db);
  process.env.CHURCH_CLAIM_REVIEW_ENABLED = "true";
  process.env.CHURCH_CLAIM_POLICY_VERSION = CLAIM_POLICY;
  reviewer = await createPortalActor(db, "claimrev");
  await seedOperatorGrants(db, reviewer, [
    "REVIEW_CHURCH_CLAIMS",
    "MANAGE_CHURCH_ACCESS",
    "MANAGE_ACCOUNTS"
  ]);
});
after(() => db.$disconnect());
const cmd = (actor: PortalActor, input: Record<string, unknown>) =>
  churchClaimCommand(db, actor.token, input);
const denied = (work: Promise<unknown>, status = 403) =>
  assert.rejects(
    work,
    (error: unknown) => error instanceof PortalError && error.status === status
  );
const read = async (actor: PortalActor, id: string) =>
  (await getChurchClaims(db, actor.token, { id })).claims[0];
const authority = () =>
  projectClaimAuthority({
    position: "Fictional secretary",
    leader: "Fictional Pat, church leader",
    method: "EMAIL",
    contact: "private-review@example.test",
    availability: "Weekdays UTC; email is accessible",
    reference: "Independent fictional directory reference"
  });
async function draft(
  actor: PortalActor,
  churchId?: string,
  scopes = Object.keys(claimScopes)
) {
  const created = await cmd(actor, {
    operation: "create",
    requestKey: randomUUID(),
    churchId
  });
  const church = churchId
    ? await db.church.findUniqueOrThrow({ where: { id: churchId } })
    : null;
  const profile = projectListingData(
    church ?? {
      name: "Fictional Claim " + randomUUID(),
      serviceArea: "Fictional region",
      summary: "Public claim fixture",
      publicEmail: "office@example.test"
    }
  );
  await cmd(actor, {
    operation: "save",
    id: created.id,
    expectedVersion: 1,
    expectedChurchVersion: church?.version ?? 0,
    profile,
    authority: authority(),
    scopes
  });
  return read(actor, created.id);
}
async function submit(actor: PortalActor, id: string) {
  const row = await read(actor, id);
  return cmd(actor, {
    operation: "submit",
    id,
    expectedVersion: row.version,
    contactConsent: true,
    searchedConfirmed: true
  });
}
async function approve(
  id: string,
  actor = reviewer,
  extra: Record<string, unknown> = {}
) {
  const row = await db.churchClaim.findUniqueOrThrow({ where: { id } });
  return cmd(actor, {
    operation: "review",
    id,
    expectedVersion: row.version,
    action: "APPROVE",
    reason: "Authority checked for the requested scopes",
    trustedSource: "Private independently found fixture source",
    confirmingPerson: "Private fixture confirming leader and role",
    checkedAt: new Date().toISOString().slice(0, 10),
    independentConfirmed: true,
    scopeConfirmed: true,
    distinctConfirmed: true,
    ...extra
  });
}
async function activate(actor: PortalActor, id: string, extra = {}) {
  const row = await read(actor, id);
  return cmd(actor, {
    operation: "activate",
    id,
    expectedVersion: row.version,
    accessConfirmed: true,
    publicConfirmed: !row.churchId,
    ...extra
  });
}

test("claims: ownership, eligibility, safe policy default, idempotency and private projections", async () => {
  const owner = await createPortalActor(db, "clowner");
  const outsider = await createPortalActor(db, "clother");
  const minor = await createPortalActor(db, "clminor", { adult: false });
  const unverified = await createPortalActor(db, "clunver", {
    verified: false
  });
  for (const actor of [minor, unverified]) await denied(draft(actor));
  await denied(churchClaimCommand(db, "", { operation: "create" }), 401);
  const key = randomUUID();
  const a = await cmd(owner, {
    operation: "create",
    requestKey: key,
    ownerId: outsider.id,
    status: "APPROVED",
    approvedBy: reviewer.id
  });
  const b = await cmd(owner, { operation: "create", requestKey: key });
  assert.equal(a.id, b.id);
  assert.equal((await read(owner, a.id)).status, "DRAFT");
  await denied(getChurchClaims(db, outsider.token, { id: a.id }), 404);
  await denied(getChurchClaims(db, outsider.token, { review: true }));
  await denied(
    cmd(outsider, {
      operation: "prepare",
      id: a.id,
      expectedVersion: 1,
      preparation: "forged"
    }),
    404
  );
  const row = await draft(owner);
  process.env.CHURCH_CLAIM_REVIEW_ENABLED = "false";
  await denied(submit(owner, row.id), 503);
  assert.equal((await read(owner, row.id)).status, "DRAFT");
  process.env.CHURCH_CLAIM_REVIEW_ENABLED = "true";
  await submit(owner, row.id);
  const ownJson = JSON.stringify(
    await getChurchClaims(db, owner.token, { id: row.id })
  );
  for (const secret of [
    owner.email,
    owner.token,
    reviewer.id,
    "requestKey",
    "credentialVersion",
    "approvedBy"
  ])
    assert.ok(!ownJson.includes(secret), secret);
  assert.equal(
    await db.churchCapabilityGrant.count({ where: { userId: owner.id } }),
    0
  );
});

test("claims: private new setup, independent approval, explicit activation and scoped profile publishing", async () => {
  const owner = await createPortalActor(db, "clnew");
  const row = await draft(owner);
  assert.equal(
    (await publicChurches(db, undefined, undefined, row.profile.name)).length,
    0
  );
  await submit(owner, row.id);
  await denied(approve(row.id, owner));
  await denied(approve(row.id, reviewer, { independentConfirmed: false }), 400);
  await denied(approve(row.id, reviewer, { checkedAt: "2026-02-31" }), 400);
  await approve(row.id);
  assert.equal(
    await db.churchCapabilityGrant.count({ where: { userId: owner.id } }),
    0
  );
  await denied(activate(owner, row.id, { publicConfirmed: false }), 400);
  const activated = await activate(owner, row.id);
  assert.ok(activated.churchId);
  const original = await db.churchClaim.findUniqueOrThrow({
    where: { id: row.id }
  });
  assert.equal(
    (await cmd(owner, { operation: "create", requestKey: original.requestKey }))
      .id,
    row.id
  );
  const church = (await publicChurches(db, activated.churchId))[0];
  assert.equal((await read(owner, row.id)).baseChurchVersion, church.version);
  assert.equal(church.representativeVerified, true);
  const publicJson = JSON.stringify(church);
  for (const secret of [
    "private-review",
    "Private independently",
    owner.email,
    owner.id,
    "authority",
    "sourceClaimId"
  ])
    assert.ok(!publicJson.includes(secret));
  assert.equal(
    await db.churchCapabilityGrant.count({
      where: { sourceClaimId: row.id, revokedAt: null }
    }),
    Object.keys(claimScopes).length
  );
  assert.ok(
    await db.churchCapabilityGrant.findFirst({
      where: {
        sourceClaimId: row.id,
        capability: "MANAGE_STRUCTURE",
        revokedAt: null
      }
    })
  );
  const connection = await db.churchConnection.findFirstOrThrow({
    where: { userId: owner.id }
  });
  assert.equal(connection.state, "APPROVED");
  assert.equal(
    await db.churchDirectoryPreference.count({
      where: { connectionId: connection.id }
    }),
    0
  );
  await denied(activate(owner, row.id), 409);
  let saved = await read(owner, row.id);
  await cmd(owner, {
    operation: "profile-save",
    id: row.id,
    expectedVersion: saved.version,
    expectedChurchVersion: church.version,
    profile: { ...saved.profile, summary: "New public managed description" }
  });
  assert.equal(
    (await publicChurches(db, church.id))[0].summary,
    row.profile.summary
  );
  saved = await read(owner, row.id);
  await cmd(owner, {
    operation: "profile-publish",
    id: row.id,
    expectedVersion: saved.version,
    publicConfirmed: true
  });
  assert.equal(
    (await publicChurches(db, church.id))[0].summary,
    "New public managed description"
  );
  assert.equal((await publicChurches(db, church.id))[0].id, church.id);
});

test("claims: existing church identity preserved, concurrent initial claims cannot take over, no automatic Home Church transfer", async () => {
  const one = await createPortalActor(db, "clone");
  const two = await createPortalActor(db, "cltwo");
  const church = await db.church.create({
    data: {
      name: "Fictional shared " + randomUUID(),
      slug: randomUUID(),
      summary: "Original public facts",
      serviceArea: "Fictional area",
      communityListed: true
    }
  });
  const a = await draft(one, church.id),
    b = await draft(two, church.id);
  await submit(one, a.id);
  await submit(two, b.id);
  await approve(a.id);
  await approve(b.id);
  const results = await Promise.allSettled([
    activate(one, a.id),
    activate(two, b.id)
  ]);
  assert.equal(
    results.filter((result) => result.status === "fulfilled").length,
    1
  );
  assert.equal(await db.church.count({ where: { name: church.name } }), 1);
  assert.equal(
    (await publicChurches(db, church.id))[0].summary,
    church.summary
  );
  const winner = results[0].status === "fulfilled" ? one : two;
  const elsewhere = await draft(winner);
  await submit(winner, elsewhere.id);
  await approve(elsewhere.id);
  await denied(activate(winner, elsewhere.id), 409);
  assert.equal(
    await db.church.count({ where: { name: elsewhere.profile.name } }),
    0
  );
  assert.equal(
    (
      await db.churchConnection.findFirstOrThrow({
        where: { userId: winner.id, state: "APPROVED" }
      })
    ).churchId,
    church.id
  );
});

test("claims: authorized church management can review only its own delegable scopes; disputes remain operator-scoped", async () => {
  const manager = await createPortalActor(db, "clmgr");
  const helper = await createPortalActor(db, "clhelper");
  const claimant = await createPortalActor(db, "clapp");
  const root = await draft(manager);
  await submit(manager, root.id);
  await approve(root.id);
  const { churchId } = await activate(manager, root.id);
  assert.ok(churchId);
  const access = await draft(helper, churchId, ["REVIEW_CONNECTIONS"]);
  assert.equal(access.kind, "ACCESS");
  await submit(helper, access.id);
  await approve(access.id, manager);
  await activate(helper, access.id);
  const next = await draft(claimant, churchId, ["MANAGE_CHURCH_PROFILE"]);
  await submit(claimant, next.id);
  await denied(approve(next.id, helper));
  const otherChurch = await db.church.create({
    data: {
      name: "Other " + randomUUID(),
      slug: randomUUID(),
      summary: "",
      serviceArea: "Fictional"
    }
  });
  const other = await draft(claimant, otherChurch.id);
  await submit(claimant, other.id);
  await denied(approve(other.id, manager));
  let dispute = await draft(claimant, churchId);
  const canonical = await db.church.findUniqueOrThrow({
    where: { id: churchId }
  });
  await cmd(claimant, {
    operation: "save",
    id: dispute.id,
    expectedVersion: dispute.version,
    expectedChurchVersion: canonical.version,
    profile: dispute.profile,
    authority: dispute.authority,
    scopes: dispute.scopes,
    dispute: true
  });
  dispute = await read(claimant, dispute.id);
  await submit(claimant, dispute.id);
  await denied(approve(dispute.id, manager));
  await denied(
    getChurchClaims(db, manager.token, { id: dispute.id, review: true })
  );
  const queue = await getChurchClaims(db, manager.token, {
    review: true,
    churchId
  });
  assert.ok(
    !queue.claims.some(
      (row) =>
        row.id === other.id || row.id === dispute.id || row.id === root.id
    )
  );
});

test("claims: changed authority requires re-review; preparation does not rewrite evidence; private export excludes reviewer evidence", async () => {
  const owner = await createPortalActor(db, "cledit");
  const row = await draft(owner);
  await submit(owner, row.id);
  let saved = await read(owner, row.id);
  await denied(
    cmd(owner, {
      operation: "save",
      id: row.id,
      expectedVersion: saved.version,
      profile: row.profile,
      authority: authority(),
      scopes: row.scopes
    }),
    409
  );
  await cmd(reviewer, {
    operation: "review",
    id: row.id,
    expectedVersion: saved.version,
    action: "NEEDS_INFORMATION",
    reason: "Clarify your role"
  });
  saved = await read(owner, row.id);
  await cmd(owner, {
    operation: "save",
    id: row.id,
    expectedVersion: saved.version,
    profile: row.profile,
    authority: { ...authority(), position: "Corrected secretary" },
    scopes: ["MANAGE_CHURCH_PROFILE"]
  });
  await denied(
    getChurchClaims(db, reviewer.token, { id: row.id, review: true }),
    404
  );
  assert.ok(
    !(await getChurchClaims(db, reviewer.token, { review: true })).claims.some(
      (item) => item.id === row.id
    )
  );
  await submit(owner, row.id);
  await approve(row.id);
  saved = await read(owner, row.id);
  await cmd(owner, {
    operation: "prepare",
    id: row.id,
    expectedVersion: saved.version,
    preparation: "Private ministry and vacant-position notes"
  });
  assert.equal((await read(owner, row.id)).status, "APPROVED");
  const secret = "fictional-claim-export-secret-" + randomUUID();
  const proof = await prepareAccountExport(
    db,
    owner.token,
    owner.password,
    secret
  );
  const exported = await downloadAccountExport(
    db,
    owner.token,
    proof.authorization,
    secret
  );
  assert.ok(exported.includes("Private ministry and vacant-position notes"));
  assert.ok(exported.includes("private-review@example.test"));
  assert.equal(
    JSON.parse(exported).churchClaimSubmissions.filter(
      (item: { claimId: string }) => item.claimId === row.id
    ).length,
    2
  );
  assert.ok(exported.includes("Fictional secretary"));
  for (const forbidden of [
    "Private independently found",
    "Private fixture confirming",
    "trustedSource",
    reviewer.email,
    reviewer.id,
    owner.token
  ])
    assert.ok(!exported.includes(forbidden));
  const ownerView = JSON.stringify(
    await getChurchClaims(db, owner.token, { id: row.id })
  );
  assert.ok(!ownerView.includes("Private independently found"));
  const reviewView = JSON.stringify(
    await getChurchClaims(db, reviewer.token, { id: row.id, review: true })
  );
  assert.ok(reviewView.includes("Private independently found"));
  assert.ok(!reviewView.includes("Private ministry and vacant-position notes"));
});

test("claims: current credentials and reviewer authority checked again before activation", async () => {
  const owner = await createPortalActor(db, "clstale");
  const row = await draft(owner);
  await submit(owner, row.id);
  await approve(row.id);
  await db.platformUser.update({
    where: { id: owner.id },
    data: { credentialVersion: { increment: 1 } }
  });
  await denied(activate(owner, row.id), 401);
  owner.token = await loginAccount(
    db,
    owner.email,
    owner.password,
    "fictional refreshed credential session"
  );
  await denied(activate(owner, row.id), 409);
  const second = await createPortalActor(db, "clreview");
  const secondRow = await draft(second);
  await submit(second, secondRow.id);
  await approve(secondRow.id);
  await db.platformOperatorGrant.update({
    where: {
      userId_capability: {
        userId: reviewer.id,
        capability: "REVIEW_CHURCH_CLAIMS"
      }
    },
    data: { revokedAt: new Date() }
  });
  await denied(activate(second, secondRow.id));
  await db.platformOperatorGrant.update({
    where: {
      userId_capability: {
        userId: reviewer.id,
        capability: "REVIEW_CHURCH_CLAIMS"
      }
    },
    data: { revokedAt: null }
  });
});

test("claims: immediate revocation across sessions, no stale profile writes or revived verified badge, independent regrant preserved", async () => {
  const owner = await createPortalActor(db, "clrevoke");
  const row = await draft(owner);
  await submit(owner, row.id);
  await approve(row.id);
  const { churchId } = await activate(owner, row.id);
  assert.ok(churchId);
  const staleToken = await loginAccount(
    db,
    owner.email,
    owner.password,
    "fictional second session"
  );
  const grant = await db.churchCapabilityGrant.findFirstOrThrow({
    where: { userId: owner.id, capability: "REVIEW_CONNECTIONS", churchId }
  });
  await portalCommand(db, reviewer.token, {
    operation: "grant",
    userId: owner.id,
    churchId,
    capability: grant.capability,
    expectedVersion: grant.version
  });
  const current = await read(owner, row.id);
  await cmd(owner, {
    operation: "revoke",
    id: row.id,
    expectedVersion: current.version,
    reason: "Ending this fictional role"
  });
  assert.equal(
    (await publicChurches(db, churchId))[0].representativeVerified,
    false
  );
  assert.equal(
    await db.churchCapabilityGrant.count({
      where: { userId: owner.id, churchId, revokedAt: null }
    }),
    1
  );
  assert.equal(
    (
      await db.churchCapabilityGrant.findUniqueOrThrow({
        where: { id: grant.id }
      })
    ).sourceClaimId,
    null
  );
  const ended = await read(owner, row.id);
  await denied(
    churchClaimCommand(db, staleToken, {
      operation: "profile-publish",
      id: row.id,
      expectedVersion: ended.version,
      publicConfirmed: true
    })
  );
  await denied(
    churchClaimCommand(db, staleToken, {
      operation: "activate",
      id: row.id,
      expectedVersion: ended.version,
      accessConfirmed: true,
      publicConfirmed: true
    }),
    409
  );
});

test("claims: request boundary rejects cross-origin and unauthenticated access, and creation/submission limits persist", async () => {
  const owner = await createPortalActor(db, "clbound");
  const origin = process.env.ACCOUNT_ORIGIN!;
  const body = JSON.stringify({
    operation: "create",
    requestKey: randomUUID()
  });
  const call = (cookie: string, requestOrigin: string) =>
    handleChurchClaimRequest(
      db,
      new Request(origin + "/api/platform/church-claims", {
        method: "POST",
        headers: {
          Origin: requestOrigin,
          "Content-Type": "application/json",
          Cookie: "church_platform_session=" + cookie
        },
        body
      })
    );
  assert.equal((await call(owner.token, "https://evil.test")).status, 403);
  assert.equal((await call("", origin)).status, 401);
  const response = await call(owner.token, origin);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control")!, /no-store/);
  for (let i = 0; i < 4; i++)
    await cmd(owner, { operation: "create", requestKey: randomUUID() });
  await denied(
    cmd(owner, { operation: "create", requestKey: randomUUID() }),
    429
  );
});
