import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { assertPortalTestDatabase, createPortalActor } from "./seed-portal";
import { readChurchTools } from "../lib/platform/church-tools";
import { readChurchImages } from "../lib/platform/church-images";
import { PortalError } from "../lib/platform/portal";
import { seedManagedChurch } from "./seed-church-management";
import { relationshipCommand } from "../lib/platform/relationships";
const db = new PrismaClient();
before(() => assertPortalTestDatabase(db));
after(() => db.$disconnect());
test("welcome steps project only the current account and distinguish following, pending membership and optional profile details", async () => {
  const actor = await createPortalActor(db, "welcomesteps");
  const church = await db.church.create({
    data: {
      slug: randomUUID(),
      name: "Fictional welcome church",
      communityListed: true,
      summary: ""
    }
  });
  const other = await db.church.create({
    data: {
      slug: randomUUID(),
      name: "Fictional other connection",
      communityListed: true,
      summary: ""
    }
  });
  await db.platformUser.update({
    where: { id: actor.id },
    data: { bio: null }
  });
  let view = await readChurchTools(db, actor.token, church.id);
  assert.equal(view.welcome?.needsIntroduction, true);
  assert.equal(view.welcome?.following, false);
  assert.equal(view.welcome?.eligible, true);
  assert.equal(view.welcome?.connectionState, null);
  assert.equal((await readChurchTools(db, null, church.id)).welcome, null);
  await relationshipCommand(db, actor.token, {
    operation: "follow",
    kind: "church",
    targetId: church.id,
    desired: true,
    expectedVersion: 0,
    mutationId: randomUUID()
  });
  await db.platformUser.update({
    where: { id: actor.id },
    data: { bio: "Private fixture introduction, never returned here." }
  });
  await db.churchConnection.create({
    data: { userId: actor.id, churchId: church.id, state: "PENDING" }
  });
  view = await readChurchTools(db, actor.token, church.id);
  assert.equal(view.welcome?.needsIntroduction, false);
  assert.equal(view.welcome?.following, true);
  assert.equal(view.welcome?.connectionState, "PENDING");
  assert.equal(view.member, false);
  assert.deepEqual(view.capabilities, []);
  assert.doesNotMatch(JSON.stringify(view), /Private fixture introduction/);
  const elsewhere = await readChurchTools(db, actor.token, other.id);
  assert.equal(elsewhere.welcome?.connectedElsewhere, true);
  assert.ok(!JSON.stringify(elsewhere.welcome).includes(church.id));
  await db.platformUser.update({
    where: { id: actor.id },
    data: { adultPolicyVersion: null }
  });
  assert.equal(
    (await readChurchTools(db, actor.token, church.id)).welcome?.eligible,
    false
  );
});
test("church contributors and pending claimants get only their own status, never appointment or private authority fields", async () => {
  const actor = await createPortalActor(db, "churchtools"),
    other = await createPortalActor(db, "foreignclaim");
  const church = await db.church.create({
    data: {
      slug: randomUUID(),
      name: "Fictional contributed church",
      summary: "",
      communityListed: true
    }
  });
  await db.churchListingSubmission.create({
    data: {
      ownerId: actor.id,
      churchId: church.id,
      requestKey: randomUUID(),
      kind: "COMMUNITY",
      status: "PUBLISHED",
      data: {}
    }
  });
  const claim = await db.churchClaim.create({
    data: {
      ownerId: actor.id,
      churchId: church.id,
      requestKey: randomUUID(),
      kind: "INITIAL",
      authority: { contact: "private-authority-marker" },
      preparation: "private-preparation-marker",
      profile: {},
      status: "SUBMITTED"
    }
  });
  await db.churchClaim.create({
    data: {
      ownerId: other.id,
      churchId: church.id,
      requestKey: randomUUID(),
      kind: "ACCESS",
      authority: { contact: "foreign-authority-marker" },
      profile: {},
      status: "SUBMITTED"
    }
  });
  const own = await readChurchTools(db, actor.token, church.id);
  assert.equal(own.contributor, true);
  assert.equal(own.claim?.id, claim.id);
  assert.equal(own.claim?.status, "SUBMITTED");
  assert.equal(own.member, false);
  assert.deepEqual(own.capabilities, []);
  assert.equal(own.profileClaimId, null);
  assert.doesNotMatch(
    JSON.stringify(own),
    /private-authority-marker|private-preparation-marker|foreign-authority-marker/
  );
  const guest = await readChurchTools(db, null, church.id);
  assert.equal(guest.ownerId, null);
  assert.equal(guest.claim, null);
  assert.equal(guest.contributor, false);
  assert.deepEqual(guest.capabilities, []);
  const otherView = await readChurchTools(db, other.token, church.id);
  assert.notEqual(otherView.claim?.id, claim.id);
  assert.equal(otherView.contributor, false);
  assert.equal(
    (await readChurchImages(db, actor.token, church.id)).canManage,
    false
  );
});
test("only current eligible approved capability holders receive church management links, with profile edits bound to an owned activated claim", async () => {
  const manager = await createPortalActor(db, "scopedtools"),
    member = await createPortalActor(db, "ordinarytools");
  const { church, claim, connection } = await seedManagedChurch(db, manager);
  await db.churchConnection.create({
    data: { churchId: church.id, userId: member.id, state: "APPROVED" }
  });
  let view = await readChurchTools(db, manager.token, church.id);
  assert.equal(view.member, true);
  assert.equal(view.profileClaimId, claim.id);
  assert.deepEqual(
    new Set(view.capabilities),
    new Set([
      "MANAGE_CHURCH_PROFILE",
      "MANAGE_STRUCTURE",
      "MANAGE_CHURCH_ACCESS"
    ])
  );
  assert.equal(
    (await readChurchImages(db, manager.token, church.id)).canManage,
    true
  );
  const ordinary = await readChurchTools(db, member.token, church.id);
  assert.equal(ordinary.member, true);
  assert.deepEqual(ordinary.capabilities, []);
  assert.equal(ordinary.claim, null);
  assert.equal(
    (await readChurchImages(db, member.token, church.id)).canManage,
    false
  );
  await db.churchCapabilityGrant.updateMany({
    where: {
      userId: manager.id,
      churchId: church.id,
      capability: "MANAGE_STRUCTURE"
    },
    data: { revokedAt: new Date() }
  });
  view = await readChurchTools(db, manager.token, church.id);
  assert.ok(!view.capabilities.includes("MANAGE_STRUCTURE"));
  assert.ok(view.capabilities.includes("MANAGE_CHURCH_PROFILE"));
  await db.churchConnection.update({
    where: { id: connection.id },
    data: { state: "REMOVED" }
  });
  view = await readChurchTools(db, manager.token, church.id);
  assert.equal(view.member, false);
  assert.deepEqual(view.capabilities, []);
  assert.equal(view.profileClaimId, null);
  assert.equal(
    (await readChurchImages(db, manager.token, church.id)).canManage,
    false
  );
  await db.church.update({
    where: { id: church.id },
    data: { communityListed: false }
  });
  for (const token of [manager.token, null])
    await assert.rejects(
      readChurchTools(db, token, church.id),
      (error: unknown) => error instanceof PortalError && error.status === 404
    );
  assert.equal(
    (await readChurchTools(db, member.token, church.id)).member,
    true
  );
});
