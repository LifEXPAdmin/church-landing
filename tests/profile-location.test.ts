import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { assertPortalTestDatabase, createPortalActor } from "./seed-portal";
import { updateAccountProfile, loginAccount } from "../lib/platform/accounts";
import {
  getProfileEditor,
  getMemberProfile,
  getVisitorProfilePreview
} from "../lib/platform/profiles";
import {
  replayRetentionControls,
  type RetentionControlEntry
} from "../lib/platform/retention-controls";
import { saveRegionalPreferences } from "../lib/platform/regional-preferences";
import {
  prepareAccountExport,
  downloadAccountExport
} from "../lib/platform/account-export";
import { requestPermanentAccountDeletion } from "../lib/platform/account-deletion";
import { eraseRequestedAccountData } from "../lib/platform/account-erasure";
import { createSessionToken } from "../lib/platform/auth";
const db = new PrismaClient();
before(() => assertPortalTestDatabase(db));
after(() => db.$disconnect());
type Actor = Awaited<ReturnType<typeof createPortalActor>>;
async function save(
  a: Actor,
  audience: string,
  location = "Private location marker",
  overrides: Record<string, unknown> = {}
) {
  const view = await getProfileEditor(db, a.token);
  const fields = {
    name: view.name,
    location,
    bio: view.bio ?? "",
    website: view.website ?? "",
    interests: view.interests.join(","),
    locationAudience: audience,
    expectedVersion: view.presentation.version,
    expectedLocationVersion: view.locationVersion,
    ...overrides
  };
  await updateAccountProfile(db, a.token, fields, a.id);
  return fields;
}
test("Only me omits location from members and member previews while preserving owner edits and independent discovery", async () => {
  const a = await createPortalActor(db, "locowner"),
    b = await createPortalActor(db, "locmember");
  const before = await db.socialPreferences.findUnique({
    where: { ownerId: a.id }
  });
  const follows = await db.platformFollow.count({
    where: { followerId: a.id }
  });
  await save(a, "MEMBERS");
  assert.equal(
    (await getMemberProfile(db, b.token, a.username)).location,
    "Private location marker"
  );
  const command = await save(a, "ONLY_ME");
  for (const view of [
    await getMemberProfile(db, b.token, a.username),
    await getMemberProfile(db, a.token, a.username, { preview: "member" }),
    await getVisitorProfilePreview(db, a.token, a.username)
  ]) {
    assert.doesNotMatch(
      JSON.stringify(view),
      /Private location marker|locationAudience|locationRecoveryRequired/
    );
  }
  assert.equal(
    (await getProfileEditor(db, a.token)).location,
    "Private location marker"
  );
  assert.equal(
    (await getMemberProfile(db, a.token, a.username)).location,
    "Private location marker"
  );
  await assert.rejects(getMemberProfile(db, "", a.username));
  await assert.rejects(
    updateAccountProfile(db, a.token, command, a.id),
    /profile-conflict/
  );
  await assert.rejects(
    updateAccountProfile(db, b.token, command, a.id),
    /session/
  );
  assert.deepEqual(
    await db.socialPreferences.findUnique({ where: { ownerId: a.id } }),
    before
  );
  assert.equal(
    await db.platformFollow.count({ where: { followerId: a.id } }),
    follows
  );
  await updateAccountProfile(db, a.token, {
    name: a.name,
    location: "Legacy editor text"
  });
  assert.equal(
    (await getProfileEditor(db, a.token)).locationAudience,
    "ONLY_ME"
  );
  assert.equal(
    (await getMemberProfile(db, b.token, a.username)).location,
    null
  );
});
test("restricted, stale and inactive accounts cannot broaden location through the current or legacy profile endpoint", async () => {
  for (const options of [{ verified: false }, { adult: false }]) {
    const a = await createPortalActor(db, "locrestrict", options);
    assert.equal((await getProfileEditor(db, a.token)).canShareLocation, false);
    await assert.rejects(save(a, "MEMBERS"), /profile-disclosure/);
    await updateAccountProfile(db, a.token, {
      name: a.name,
      location: "Legacy private location"
    });
    assert.equal(
      (await getProfileEditor(db, a.token)).locationAudience,
      "ONLY_ME"
    );
    assert.equal(
      (await getProfileEditor(db, a.token)).location,
      "Legacy private location"
    );
    await assert.rejects(save(a, "MEMBERS"), /profile-disclosure/);
    await save(a, "ONLY_ME");
    await assert.rejects(save(a, "PUBLIC"), /profile/);
    await db.platformUser.update({
      where: { id: a.id },
      data: { suspendedAt: new Date() }
    });
    await assert.rejects(
      updateAccountProfile(db, a.token, {
        name: a.name,
        location: "Suspended location"
      })
    );
  }
});
test("opaque restore versions clear stale location, preserve newer decisions, and invalidate a stale editor", async () => {
  const a = await createPortalActor(db, "locrestore"),
    b = await createPortalActor(db, "locreader");
  await save(a, "MEMBERS", "Old exposed location");
  const old = await getProfileEditor(db, a.token);
  await save(a, "ONLY_ME", "Removed location marker");
  const records = await db.retentionControl.findMany({
    where: { kind: "PROFILE_LOCATION", sourceId: a.id },
    orderBy: { version: "asc" }
  });
  assert.equal(records.length, 2);
  const entries = records.map(
    (r) => r.payload as unknown as RetentionControlEntry
  );
  assert.doesNotMatch(
    JSON.stringify(entries),
    /Old exposed location|Removed location marker|ONLY_ME|MEMBERS/
  );
  await db.platformUser.update({
    where: { id: a.id },
    data: {
      location: "Old exposed location",
      locationAudience: "MEMBERS",
      locationVersion: old.locationVersion
    }
  });
  await db.profilePresentation.update({
    where: { userId: a.id },
    data: { version: old.presentation.version }
  });
  await replayRetentionControls(db, entries);
  const restored = await getProfileEditor(db, a.token);
  assert.equal(restored.location, null);
  assert.equal(restored.locationAudience, "ONLY_ME");
  assert.equal(restored.locationRecoveryRequired, true);
  assert.equal(
    (await getMemberProfile(db, b.token, a.username)).location,
    null
  );
  await assert.rejects(
    save(a, "MEMBERS", "Stale editor text", {
      expectedLocationVersion: old.locationVersion
    }),
    /profile-conflict/
  );
  await replayRetentionControls(db, entries);
  assert.deepEqual(await getProfileEditor(db, a.token), restored);
  await assert.rejects(
    replayRetentionControls(db, [{ ...entries[1], targetId: b.id }])
  );
  await save(a, "MEMBERS", "Reviewed location");
  await replayRetentionControls(db, entries);
  assert.equal(
    (await getMemberProfile(db, b.token, a.username)).location,
    "Reviewed location"
  );
});
test("owned export includes private regional and location choices, and permanent erasure removes them without resurrection", async () => {
  const a = await createPortalActor(db, "locexport");
  await save(a, "ONLY_ME", "Export-only location");
  await saveRegionalPreferences(db, a.token, {
    mutationId: randomUUID(),
    expectedVersion: 0,
    dateFormat: "DMY",
    timeFormat: "H24"
  });
  const token = await loginAccount(
    db,
    a.email,
    a.password,
    "Fresh private export session"
  );
  const secret = process.env.AUTH_RATE_LIMIT_SECRET!;
  const proof = await prepareAccountExport(db, token, a.password, secret);
  const content = JSON.parse(
    await downloadAccountExport(db, token, proof.authorization, secret)
  );
  assert.equal(content.account.location, "Export-only location");
  assert.equal(content.account.locationAudience, "ONLY_ME");
  assert.equal(content.account.dateFormat, "DMY");
  assert.equal(content.account.timeFormat, "H24");
  const entries = (
    await db.retentionControl.findMany({
      where: { kind: "PROFILE_LOCATION", sourceId: a.id }
    })
  ).map((r) => r.payload as unknown as RetentionControlEntry);
  const journal = { async recordAccount() {}, async completeAccount() {} };
  await requestPermanentAccountDeletion(
    db,
    a.token,
    a.password,
    true,
    createSessionToken(),
    journal
  );
  const request = await db.accountDeletion.findUniqueOrThrow({
    where: { userId: a.id }
  });
  await eraseRequestedAccountData(db, request.id, journal);
  await replayRetentionControls(db, entries);
  const erased = await db.platformUser.findUniqueOrThrow({
    where: { id: a.id }
  });
  assert.equal(erased.location, null);
  assert.equal(erased.locationAudience, "ONLY_ME");
  assert.equal(erased.locationRecoveryRequired, false);
  assert.equal(erased.dateFormat, "DEFAULT");
  assert.equal(erased.timeFormat, "DEFAULT");
});
