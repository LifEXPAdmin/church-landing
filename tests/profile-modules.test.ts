import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { assertPortalTestDatabase, createPortalActor } from "./seed-portal";
import { updateAccountProfile } from "../lib/platform/accounts";
import {
  getProfileEditor,
  getMemberProfile,
  getVisitorProfilePreview
} from "../lib/platform/profiles";
import {
  emptyProfileModules,
  validateProfileModules,
  readProfileModules,
  profileModuleSections
} from "../lib/platform/profile-modules";
import {
  prepareAccountExport,
  downloadAccountExport
} from "../lib/platform/account-export";
import { requestPermanentAccountDeletion } from "../lib/platform/account-deletion";
import { eraseRequestedAccountData } from "../lib/platform/account-erasure";
import {
  replayRetentionControls,
  type RetentionControlEntry
} from "../lib/platform/retention-controls";
import { createSessionToken } from "../lib/platform/auth";
import { handleAccountRequest } from "../lib/platform/account-boundary";

const db = new PrismaClient();
before(() => assertPortalTestDatabase(db));
after(() => db.$disconnect());
const modules = {
  testimony: "My fictional testimony <script>window.injected = true</script>",
  skills: ["Listening", "Gardening"],
  links: [{ label: "My work", url: "https://example.test/work" }]
};
const save = async (
  actor: Awaited<ReturnType<typeof createPortalActor>>,
  value: unknown,
  overrides = {}
) => {
  const profile = await getProfileEditor(db, actor.token);
  return updateAccountProfile(
    db,
    actor.token,
    {
      name: profile.name,
      bio: profile.bio ?? "",
      location: profile.location ?? "",
      website: profile.website ?? "",
      interests: profile.interests.join(","),
      expectedVersion: profile.presentation.version,
      profileModules: value,
      ...overrides
    },
    actor.id
  );
};

test("typed modules bound text and links, reject unsupported slots and discard malformed persisted data", () => {
  assert.deepEqual(validateProfileModules(modules), modules);
  assert.deepEqual(profileModuleSections(emptyProfileModules()), []);
  for (const value of [
    null,
    [],
    {},
    { ...modules, email: "private@example.test" },
    { ...modules, calendar: "other-owner" },
    { ...modules, testimony: "x".repeat(2001) },
    { ...modules, skills: ["Same", "same"] },
    { ...modules, skills: Array(11).fill("Skill") },
    { ...modules, skills: ["x".repeat(61)] },
    ...[
      "javascript:alert(1)",
      "data:text/html,bad",
      "mailto:private@example.test",
      "https://user:password@example.test",
      "https://example.test/\nmarker"
    ].map((url) => ({ ...modules, links: [{ label: "Unsafe", url }] })),
    { ...modules, links: [{ label: "No address", url: "" }] },
    {
      ...modules,
      links: [{ label: "Extra", url: "https://example.test", html: "<iframe>" }]
    },
    { ...modules, links: Array(4).fill(modules.links[0]) }
  ]) {
    assert.throws(() => validateProfileModules(value));
    assert.deepEqual(readProfileModules(value), emptyProfileModules());
  }
  assert.deepEqual(
    profileModuleSections(modules).map((section) => section.kind),
    ["testimony", "skills", "links"]
  );
});

test("HTTP accepts bounded multilingual profile sections and rejects oversized profile and ordinary account bodies", async () => {
  const actor = await createPortalActor(db, "moduleunicode");
  const origin = process.env.ACCOUNT_ORIGIN!;
  const value = { ...emptyProfileModules(), testimony: "文".repeat(2000) };
  const body = JSON.stringify({
    operation: "update-profile",
    name: actor.name,
    bio: "文".repeat(500),
    expectedVersion: 0,
    palette: "sage",
    background: "plain",
    sectionOrder: "about-first",
    introduction: "文".repeat(1000),
    profileModules: value
  });
  assert.ok(Buffer.byteLength(body) > 8192);
  const request = (content: string) =>
    new Request(origin + "/api/platform/account", {
      method: "POST",
      headers: {
        origin,
        "content-type": "application/json",
        cookie: "church_platform_session=" + actor.token,
        "x-expected-account": actor.id
      },
      body: content
    });
  const response = await handleAccountRequest(db, request(body));
  assert.equal(response.status, 200, await response.text());
  const before = await getProfileEditor(db, actor.token);
  assert.deepEqual(before.presentation.modules, value);
  assert.equal(
    (await handleAccountRequest(db, request(body + " ".repeat(32769)))).status,
    400
  );
  assert.equal(
    (
      await handleAccountRequest(
        db,
        request(
          JSON.stringify({
            operation: "login",
            email: actor.email,
            password: actor.password
          }) + " ".repeat(8193)
        )
      )
    ).status,
    400
  );
  assert.deepEqual(await getProfileEditor(db, actor.token), before);
});

test("module text rejects unsupported controls and lone surrogates while preserving ordinary Unicode and whitespace", () => {
  const characters = [
    ...Array.from({ length: 32 }, (_, index) => String.fromCharCode(index))
      .filter((character) => !["\t", "\n", "\r"].includes(character)),
    "\u007f", "\ud800", "\udfff"
  ];
  for (const character of characters) {
    for (const value of [
      { ...modules, testimony: "Before" + character + "after" },
      { ...modules, skills: ["Skill" + character] },
      { ...modules, links: [{ label: "Label" + character, url: "https://example.test" }] },
      { ...modules, links: [{ label: "Link", url: "https://example.test/" + character }] }
    ]) {
      assert.throws(() => validateProfileModules(value));
      assert.deepEqual(readProfileModules(value), emptyProfileModules());
    }
  }
  const allowed = {
    testimony: "中文 🙂\nSecond line\r\n\tالعربية",
    skills: ["日本語 🙂", "Музыка"],
    links: [{ label: "作品 🙂", url: "https://example.test/作品" }]
  };
  const decoded = validateProfileModules(allowed);
  assert.equal(decoded.testimony, allowed.testimony);
  assert.deepEqual(decoded.skills, allowed.skills);
  assert.equal(decoded.links[0].label, allowed.links[0].label);
  assert.equal(decoded.links[0].url, new URL(allowed.links[0].url).href);
});

test("HTTP rejects PostgreSQL-incompatible module text without profile or recovery writes and accepts bounded multilingual modules", async () => {
  const actor = await createPortalActor(db, "modulecontrol");
  await save(actor, modules);
  const origin = process.env.ACCOUNT_ORIGIN!;
  const state = async () => ({
    account: await db.platformUser.findUniqueOrThrow({ where: { id: actor.id } }),
    presentation: await db.profilePresentation.findUniqueOrThrow({ where: { userId: actor.id } }),
    recovery: await db.retentionControl.findMany({
      where: { sourceId: actor.id }, orderBy: { id: "asc" }
    })
  });
  const before = await state();
  const request = (value: unknown) => {
    const body = JSON.stringify({
      operation: "update-profile", name: actor.name,
      expectedVersion: before.presentation.version, profileModules: value
    });
    assert.ok(Buffer.byteLength(body) < 32768);
    return new Request(origin + "/api/platform/account", {
      method: "POST", headers: {
        origin, "content-type": "application/json",
        cookie: "church_platform_session=" + actor.token,
        "x-expected-account": actor.id
      }, body
    });
  };
  const oversizedEscapes = {
    testimony: "\u0001".repeat(2000),
    skills: Array.from({ length: 10 }, (_, index) => index + "\u0001".repeat(59)),
    links: Array.from({ length: 3 }, () => ({
      label: "\u0001".repeat(80), url: "https://example.test/" + "x".repeat(470)
    }))
  };
  assert.equal(Buffer.byteLength(JSON.stringify(oversizedEscapes)), 18596);
  for (const value of [
    oversizedEscapes,
    { ...modules, testimony: "Embedded\u0000NUL" },
    { ...modules, testimony: "Lone\ud800surrogate" },
    { ...modules, testimony: "Lone\udfffsurrogate" },
    { ...modules, skills: ["Unsupported\u000bcontrol"] },
    { ...modules, links: [{ label: "Unsupported\u007fcontrol", url: "https://example.test" }] },
    { ...modules, links: [{ label: "Link", url: "https://example.test/\ud800" }] }
  ]) {
    const response = await handleAccountRequest(db, request(value));
    assert.equal(response.status, 400, await response.text());
    assert.deepEqual(await state(), before);
  }
  const allowed = {
    testimony: "文\t\n\r\"\\🙂".repeat(250),
    skills: Array.from({ length: 10 }, (_, index) => index + "能".repeat(59)),
    links: Array.from({ length: 3 }, () => ({
      label: "标签🙂".repeat(20), url: "https://example.test/" + "x".repeat(470)
    }))
  };
  assert.equal(allowed.testimony.length, 2000);
  const response = await handleAccountRequest(db, request(allowed));
  assert.equal(response.status, 200, await response.text());
  const after = await state();
  assert.deepEqual(after.presentation.modules, allowed);
  assert.equal(after.presentation.version, before.presentation.version + 1);
  assert.equal(after.recovery.length, before.recovery.length + 1);
  const [stored] = await db.$queryRaw<Array<{ bytes: number }>>`
    SELECT octet_length("modules"::text) AS bytes FROM "ProfilePresentation"
    WHERE "userId" = ${actor.id}`;
  assert.ok(stored.bytes <= 16000);
});

test("owner-only versioned modules preserve older fields and legacy edits, reject stale writes and remove empty sections", async () => {
  const a = await createPortalActor(db, "moduleowner"),
    b = await createPortalActor(db, "moduleother");
  await updateAccountProfile(db, a.token, {
    name: a.name,
    bio: "Existing biography",
    interests: "Reading",
    expectedVersion: 0,
    palette: "warm",
    background: "lines",
    sectionOrder: "posts-first",
    introduction: "Existing introduction"
  });
  await save(a, modules);
  const current = await getProfileEditor(db, a.token);
  assert.deepEqual(current.presentation.modules, modules);
  assert.equal(current.bio, "Existing biography");
  assert.equal(current.presentation.palette, "warm");
  assert.equal(current.presentation.introduction, "Existing introduction");
  assert.equal(current.presentation.sectionOrder, "posts-first");
  assert.deepEqual(current.interests, ["Reading"]);
  await assert.rejects(
    updateAccountProfile(
      db,
      b.token,
      {
        name: a.name,
        expectedVersion: current.presentation.version,
        profileModules: modules
      },
      a.id
    ),
    /session/
  );
  await assert.rejects(
    save(a, modules, { expectedVersion: current.presentation.version - 1 }),
    /profile-conflict/
  );
  await assert.rejects(
    updateAccountProfile(db, a.token, {
      name: a.name,
      profileModules: modules
    }),
    /profile/
  );
  await updateAccountProfile(db, a.token, {
    name: a.name,
    bio: "Legacy editor"
  });
  assert.deepEqual(
    (await getProfileEditor(db, a.token)).presentation.modules,
    modules
  );
  await save(a, emptyProfileModules());
  assert.deepEqual(
    profileModuleSections(
      (await getMemberProfile(db, b.token, a.username)).presentation.modules
    ),
    []
  );
  assert.equal((await getProfileEditor(db, b.token)).presentation.version, 0);
  await db.platformSession.deleteMany({ where: { userId: a.id } });
  await assert.rejects(save(a, modules));
});

test("member and preview projections exclude hidden contact values and fail closed on unknown persisted module fields", async () => {
  const a = await createPortalActor(db, "moduleprivacy"),
    b = await createPortalActor(db, "modulereader");
  await save(a, modules, {
    location: "Secret location marker",
    locationAudience: "ONLY_ME",
    expectedLocationVersion: 0
  });
  for (const view of [
    await getMemberProfile(db, b.token, a.username),
    await getMemberProfile(db, a.token, a.username, { preview: "member" })
  ]) {
    assert.deepEqual(view.presentation.modules, modules);
    for (const secret of [
      a.email,
      a.token,
      "Secret location marker",
      "locationAudience",
      "modulesVersion"
    ])
      assert.equal(JSON.stringify(view).includes(secret), false);
  }
  assert.deepEqual(await getVisitorProfilePreview(db, a.token, a.username), {
    name: a.name,
    username: a.username
  });
  await assert.rejects(getMemberProfile(db, "", a.username));
  await db.profilePresentation.update({
    where: { userId: a.id },
    data: {
      modules: { ...modules, contact: "Malformed private contact marker" }
    }
  });
  assert.deepEqual(
    (await getMemberProfile(db, b.token, a.username)).presentation.modules,
    emptyProfileModules()
  );
  await db.platformUser.update({
    where: { id: a.id },
    data: { deactivatedAt: new Date() }
  });
  await assert.rejects(getMemberProfile(db, b.token, a.username));
});

test("own export includes only own modules and permanent erasure prevents journal resurrection", async () => {
  const a = await createPortalActor(db, "moduleexport"),
    b = await createPortalActor(db, "modulekeep");
  await save(a, modules);
  await save(b, { ...modules, testimony: "Other owner testimony marker" });
  const secret = process.env.AUTH_RATE_LIMIT_SECRET!;
  const proof = await prepareAccountExport(db, a.token, a.password, secret);
  const content = await downloadAccountExport(
    db,
    a.token,
    proof.authorization,
    secret
  );
  assert.deepEqual(JSON.parse(content).account.presentation.modules, modules);
  assert.equal(content.includes("Other owner testimony marker"), false);
  const entries = (
    await db.retentionControl.findMany({
      where: { kind: "PROFILE_MODULES", sourceId: a.id }
    })
  ).map((row) => row.payload as unknown as RetentionControlEntry);
  const journal = { async recordAccount() {}, async completeAccount() {} };
  await requestPermanentAccountDeletion(
    db,
    a.token,
    a.password,
    true,
    createSessionToken(),
    journal
  );
  const deletion = await db.accountDeletion.findUniqueOrThrow({
    where: { userId: a.id }
  });
  await eraseRequestedAccountData(db, deletion.id, journal);
  await replayRetentionControls(db, entries);
  assert.equal(
    await db.profilePresentation.count({ where: { userId: a.id } }),
    0
  );
  assert.equal(
    (await getProfileEditor(db, b.token)).presentation.modules.testimony,
    "Other owner testimony marker"
  );
});
