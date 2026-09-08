import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  PrismaClient,
  type OperatorCapability,
  type PlatformRole
} from "@prisma/client";
import { accountConfig } from "../lib/platform/account-config";
import { deliverAccountGrant } from "../lib/platform/account-delivery";
import {
  consumeAccountGrant,
  loginAccount,
  registerAccount,
  requestAccountGrant
} from "../lib/platform/accounts";
import {
  ADULT_POLICY,
  getPortalSnapshot,
  portalCommand
} from "../lib/platform/portal";

export async function assertPortalTestDatabase(db: PrismaClient) {
  const config = accountConfig();
  const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
  assert.equal(process.env.ACCOUNT_TEST_ISOLATED, "1");
  assert.notEqual(process.env.NODE_ENV, "production");
  assert.equal(process.env.VERCEL || "", "");
  assert.equal(config.delivery, "test-sink");
  assert.equal(url.hostname, "127.0.0.1");
  assert.match(url.pathname, /^\/godschurches_security_test(?:_restore)?$/);
  const [actual] = await db.$queryRaw<Array<{ name: string; address: string }>>`
    SELECT current_database() AS name, host(inet_server_addr()) AS address`;
  assert.equal(actual.name, url.pathname.slice(1));
  assert.equal(actual.address, "127.0.0.1");
}

export async function createPortalActor(
  db: PrismaClient,
  label: string,
  options: { verified?: boolean; adult?: boolean; role?: PlatformRole } = {}
) {
  await assertPortalTestDatabase(db);
  await db.platformAuthLimit.deleteMany();
  const suffix = randomBytes(5).toString("hex");
  const username = `p_${label.slice(0, 9)}_${suffix}`;
  const email = `${username}.private-login@example.test`;
  const password = `Fictional-only-${randomBytes(12).toString("hex")}`;
  await registerAccount(db, {
    name: `Fictional ${label} ${suffix}`,
    username,
    email,
    password,
    confirmPassword: password,
    role: options.role ?? "BELIEVER"
  });
  const user = await db.platformUser.findUniqueOrThrow({ where: { username } });
  assert.equal(user.emailVerifiedAt, null);
  if (options.verified !== false) {
    await requestAccountGrant(db, email, "VERIFY_EMAIL", deliverAccountGrant);
    const sink = accountConfig().sinkDirectory!;
    let verificationToken: string | null = null;
    for (const file of await readdir(sink)) {
      const message = JSON.parse(await readFile(join(sink, file), "utf8"));
      if (message.email === email && message.purpose === "VERIFY_EMAIL") {
        const url = new URL(message.url);
        assert.equal(url.origin, accountConfig().origin);
        verificationToken = new URLSearchParams(url.hash.slice(1)).get("token");
      }
    }
    assert.ok(
      verificationToken,
      "Verification must arrive through the actual local sink"
    );
    await consumeAccountGrant(db, verificationToken, "VERIFY_EMAIL");
    assert.ok(
      (await db.platformUser.findUniqueOrThrow({ where: { id: user.id } }))
        .emailVerifiedAt
    );
  }
  const token = await loginAccount(
    db,
    email,
    password,
    "fictional-portal-test"
  );
  if (options.adult !== false) {
    const snapshot = await getPortalSnapshot(db, token, "discover");
    await portalCommand(db, token, {
      operation: "ack-adult",
      acknowledged: true,
      policy: ADULT_POLICY,
      expectedVersion: snapshot.viewer.version
    });
  }
  return { id: user.id, name: user.name, username, email, password, token };
}

export type PortalActor = Awaited<ReturnType<typeof createPortalActor>>;

export async function seedOperatorGrants(
  db: PrismaClient,
  actor: PortalActor,
  capabilities: OperatorCapability[]
) {
  await assertPortalTestDatabase(db);
  assert.match(actor.username, /^p_/);
  assert.ok(actor.email.endsWith(".private-login@example.test"));
  const viewer = (await getPortalSnapshot(db, actor.token, "discover")).viewer;
  assert.equal(viewer.id, actor.id);
  assert.equal(viewer.verified, true);
  assert.equal(viewer.adult, true);
  // Test-only bootstrap, guarded by both connection identity and actual sink verification.
  await db.platformOperatorGrant.createMany({
    data: capabilities.map((capability) => ({ userId: actor.id, capability }))
  });
}

export async function requestConnection(
  db: PrismaClient,
  actor: PortalActor,
  churchId: string
) {
  const prior = await db.churchConnection.findUnique({
    where: { userId_churchId: { userId: actor.id, churchId } }
  });
  await portalCommand(db, actor.token, {
    operation: "request",
    churchId,
    expectedVersion: prior?.version ?? 0
  });
  return db.churchConnection.findUniqueOrThrow({
    where: { userId_churchId: { userId: actor.id, churchId } }
  });
}

export async function seedPortal(db: PrismaClient) {
  await assertPortalTestDatabase(db);
  const operator = await createPortalActor(db, "operator", { role: "BUILDER" });
  await seedOperatorGrants(db, operator, [
    "ESTABLISH_CHURCH",
    "MANAGE_CHURCH_ACCESS",
    "MANAGE_ACCOUNTS",
    "ASSIGN_RELATIONSHIP_OWNER"
  ]);
  const suffix = randomBytes(5).toString("hex");
  for (const [key, name] of [
    ["a", "Fictional Lantern Test Church"],
    ["b", "Fictional Paper Harbor Test Church"]
  ]) {
    await portalCommand(db, operator.token, {
      operation: "establish",
      expectedVersion: 0,
      slug: `fictional-${key}-${suffix}`,
      name: `${name} ${suffix}`,
      summary:
        "Entirely fictional isolated test fixture. Not a real congregation."
    });
  }
  const churchA = await db.church.findUniqueOrThrow({
    where: { slug: `fictional-a-${suffix}` }
  });
  const churchB = await db.church.findUniqueOrThrow({
    where: { slug: `fictional-b-${suffix}` }
  });
  const reviewerA = await createPortalActor(db, "review_a");
  const reviewerB = await createPortalActor(db, "review_b");
  const coordinator = await createPortalActor(db, "coordinat");
  const memberA = await createPortalActor(db, "member_a", { role: "CHURCH" });
  const memberB = await createPortalActor(db, "member_b", { role: "CHURCH" });
  const contact = await createPortalActor(db, "contact");
  const relationshipOwner = await createPortalActor(db, "rel_owner");
  const pending = await createPortalActor(db, "pending");
  const unverified = await createPortalActor(db, "unverify", {
    verified: false
  });
  const unacknowledged = await createPortalActor(db, "unack", { adult: false });
  for (const [actor, church] of [
    [reviewerA, churchA],
    [reviewerB, churchB]
  ] as const) {
    await portalCommand(db, operator.token, {
      operation: "grant",
      churchId: church.id,
      userId: actor.id,
      capability: "REVIEW_CONNECTIONS",
      expectedVersion: 0
    });
  }
  for (const [actor, church, reviewer] of [
    [memberA, churchA, reviewerA],
    [coordinator, churchA, reviewerA],
    [contact, churchA, reviewerA],
    [memberB, churchB, reviewerB]
  ] as const) {
    const connection = await requestConnection(db, actor, church.id);
    await portalCommand(db, reviewer.token, {
      operation: "transition",
      action: "APPROVE",
      churchId: church.id,
      connectionId: connection.id,
      expectedVersion: connection.version
    });
  }
  await requestConnection(db, pending, churchA.id);
  await portalCommand(db, operator.token, {
    operation: "grant",
    churchId: churchA.id,
    userId: coordinator.id,
    capability: "APPOINT_COORDINATORS",
    expectedVersion: 0
  });
  await portalCommand(db, coordinator.token, {
    operation: "assign-contact",
    churchId: churchA.id,
    userId: contact.id,
    slot: "PRIMARY",
    audience: "SAME_CHURCH",
    expectedVersion: 0,
    contactEmail: `fictional-help-${suffix}@example.test`,
    phone: "+1 202 555 0101"
  });
  await portalCommand(db, operator.token, {
    operation: "assign-contact",
    churchId: churchA.id,
    userId: relationshipOwner.id,
    slot: "RELATIONSHIP_OWNER",
    audience: "SAME_CHURCH",
    expectedVersion: 0,
    contactEmail: `fictional-owner-${suffix}@example.test`,
    phone: "+1 202 555 0102"
  });
  const sharing = {
    listed: true,
    displayName: `Fictional Shared Name ${suffix}`,
    contactEmail: `fictional-shared-${suffix}@example.test`,
    phone: "+1 202 555 0199",
    emailAudience: "SAME_CHURCH",
    phoneAudience: "ONLY_ME"
  };
  const connection = await db.churchConnection.findUniqueOrThrow({
    where: { userId_churchId: { userId: memberA.id, churchId: churchA.id } }
  });
  await portalCommand(db, memberA.token, {
    operation: "share",
    connectionId: connection.id,
    expectedVersion: connection.version,
    ...sharing
  });
  await db.platformAuthLimit.deleteMany();
  return {
    churchA,
    churchB,
    operator,
    reviewerA,
    reviewerB,
    coordinator,
    memberA,
    memberB,
    contact,
    relationshipOwner,
    pending,
    unverified,
    unacknowledged,
    sharing
  };
}

export type PortalFixture = Awaited<ReturnType<typeof seedPortal>>;

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const db = new PrismaClient();
  try {
    const f = await seedPortal(db);
    const path = join(dirname(accountConfig().sinkDirectory!), "PREVIEW.md");
    const actors = [
      f.operator,
      f.reviewerA,
      f.reviewerB,
      f.coordinator,
      f.memberA,
      f.memberB,
      f.contact,
      f.relationshipOwner,
      f.pending,
      f.unverified,
      f.unacknowledged
    ];
    // Explicit allowlist: never serialize fixture objects containing session or grant tokens.
    await writeFile(
      path,
      [
        "# Fictional Local Portal Preview",
        "",
        `Login: ${accountConfig().origin}/platform/login`,
        "",
        "Disposable local data only. No real people, congregations, or external email.",
        ...(accountConfig().origin.startsWith("https:")
          ? [
              "This preview uses a production Next server with a disposable self-signed certificate for 127.0.0.1 / localhost only.",
              "Your browser may show a certificate warning. For this exact local preview only, you may choose Advanced then Proceed if available, or decline and stop here.",
              "No macOS/system trust settings were changed. Do not disable certificate verification globally or use these credentials outside this preview.",
              "Frontend email verification and recovery delivery are disabled. The preverified fictional accounts were verified by direct test services through the local sink before preview."
            ]
          : []),
        "Unverified and unacknowledged actors intentionally cannot join the private journey.",
        "Reviewers have scoped approval permission, not automatic directory membership.",
        "",
        `Church A: ${f.churchA.name}`,
        `Church B: ${f.churchB.name}`,
        "",
        "| Fictional actor | Login email | Password |",
        "| --- | --- | --- |",
        ...actors.map((a) => `| ${a.name} | ${a.email} | ${a.password} |`),
        ""
      ].join("\n"),
      { mode: 0o600, flag: "wx" }
    );
    console.log(`Fictional preview credentials: ${path}`);
  } finally {
    await db.$disconnect();
  }
}
