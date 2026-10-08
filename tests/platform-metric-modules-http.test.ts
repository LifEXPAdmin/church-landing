import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { PrismaClient, type OperatorCapability } from "@prisma/client";
import {
  assertPortalTestDatabase,
  createPortalActor,
  seedOperatorGrants,
  type PortalActor
} from "./seed-portal";
import { sessionCookieFixtureName } from "../scripts/session-cookie-fixture.mjs";
import {
  privilegedAuthenticatorCommand,
  readPrivilegedAuthentication
} from "../lib/platform/privileged-auth";
import {
  authenticatorTotp,
  openAuthenticator
} from "../lib/platform/admin-authenticator-crypto";
import { readPlatformMetrics } from "../lib/platform/metric-report";
import { metricCsv } from "../lib/platform/metric-export";

const db = new PrismaClient(),
  origin = process.env.ACCOUNT_ORIGIN!;
assert.match(origin, /^https:\/\/127\.0\.0\.1:\d+$/);
assert.equal(process.env.PRIVILEGED_MFA_MODE, "enforce");
before(() => assertPortalTestDatabase(db));
after(() => db.$disconnect());
const capabilities: OperatorCapability[] = [
  "VIEW_PLATFORM_METRICS",
  "EXPORT_PLATFORM_METRICS"
];
async function actor(grants = capabilities) {
  const a = await createPortalActor(db, "modhttp");
  await seedOperatorGrants(db, a, grants);
  return a;
}
async function code(a: PortalActor) {
  for (;;) {
    const row = await db.adminAuthenticator.findUniqueOrThrow({
      where: { userId: a.id }
    });
    const current = BigInt(Math.floor(Date.now() / 30000));
    const counter =
      row.lastCounter < current - BigInt(1)
        ? current - BigInt(1)
        : row.lastCounter + BigInt(1);
    if (counter <= current + BigInt(1))
      return {
        version: row.version,
        code: authenticatorTotp(
          openAuthenticator(a.id, row.secretCiphertext),
          counter
        )
      };
    await new Promise((done) =>
      setTimeout(done, 30000 - (Date.now() % 30000) + 50)
    );
  }
}
async function confirm(a: PortalActor, purpose = "privileged-work") {
  if (!(await readPrivilegedAuthentication(db, a.token)).factor) {
    await privilegedAuthenticatorCommand(
      db,
      a.token,
      {
        operation: "mfa-start",
        requestKey: randomUUID(),
        expectedVersion: 0
      },
      a.password
    );
    const next = await code(a);
    await privilegedAuthenticatorCommand(
      db,
      a.token,
      {
        operation: "mfa-confirm",
        requestKey: randomUUID(),
        expectedVersion: next.version,
        code: next.code
      },
      undefined
    );
  }
  const next = await code(a);
  await privilegedAuthenticatorCommand(
    db,
    a.token,
    {
      operation: "mfa-challenge",
      requestKey: randomUUID(),
      expectedVersion: next.version,
      code: next.code,
      purpose
    },
    undefined
  );
  assert.equal(
    (await readPrivilegedAuthentication(db, a.token)).confirmedForWork,
    true
  );
}
const request = (
  path: string,
  a?: PortalActor,
  body?: Record<string, unknown>,
  headers: Record<string, string> = {}
) =>
  fetch(origin + path, {
    redirect: "manual",
    method: body ? "POST" : "GET",
    headers: {
      ...(a
        ? {
            Cookie: sessionCookieFixtureName(origin) + "=" + a.token,
            "X-Expected-Account": a.id
          }
        : {}),
      ...(body ? { Origin: origin, "Content-Type": "application/json" } : {}),
      ...headers
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
async function api(
  a: PortalActor | undefined,
  status = 200,
  query = "view=metrics&preset=7"
) {
  const response = await request("/api/platform/admin?" + query, a);
  assert.equal(response.status, status);
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  const value = await response.json();
  if (status !== 200) assert.equal(value.report, undefined);
  return value;
}
const exportInput = () => ({
  operation: "metrics-export",
  requestKey: randomUUID(),
  preset: "7"
});
const audits = (a: PortalActor) =>
  db.adminOperation.count({
    where: { actorId: a.id, sourceType: "METRICS_EXPORT" }
  });

test("built metrics boundary requires current session, independent entitlement and enforced authenticator proof", async () => {
  await api(undefined, 401);
  const member = await createPortalActor(db, "modguest");
  await api(member, 404);
  const a = await actor();
  const denied = await api(a, 403);
  assert.equal(denied.authenticatorPurpose, "privileged-work");
  await confirm(a);
  const result = await api(a);
  assert.equal(result.navigation.viewer.id, a.id);
  assert.equal(result.report.modules.scope, "platform");
  assert.equal(
    result.report.modules.groups.flatMap(
      (g: { actions: unknown[] }) => g.actions
    ).length,
    6
  );
  assert.equal(result.report.modules.unavailable.length, 7);
});

test("actual Growth HTML and RSC omit report data while owner-bound no-store API supplies current modules", async () => {
  const a = await actor(),
    b = await createPortalActor(db, "modswap");
  await confirm(a);
  const snapshot = await api(a);
  for (const rsc of [false, true]) {
    const response = await request(
      "/platform/admin/growth?preset=7",
      a,
      undefined,
      rsc ? { RSC: "1" } : {}
    );
    assert.equal(response.status, 200);
    if (rsc)
      assert.match(
        response.headers.get("content-type") ?? "",
        /text\/x-component/
      );
    const text = await response.text();
    // HTML Flight JSON escapes its embedded string; RSC is already plain.
    const normalized = text.replaceAll(String.fromCharCode(92), "");
    for (const marker of [
      snapshot.report.checkedAt,
      '"measuredAccounts":',
      'name="from"',
      'name="through"',
      '"unavailableScopes":',
      '"modules":',
      '"report":'
    ])
      assert.ok(
        !text.includes(marker) && !normalized.includes(marker),
        "Initial transport must omit the private report"
      );
  }
  const replaced = await request(
    "/api/platform/admin?view=metrics&preset=7",
    b,
    undefined,
    { "X-Expected-Account": a.id }
  );
  assert.equal(replaced.status, 401);
  assert.equal((await replaced.json()).report, undefined);
});

test("current one-use export proof yields exact aggregate CSV and one audit, while replay cannot recover CSV", async () => {
  const a = await actor();
  await confirm(a);
  let response = await request("/api/platform/admin", a, exportInput());
  assert.equal(response.status, 403);
  assert.equal((await response.json()).authenticatorPurpose, "export-metrics");
  assert.equal(await audits(a), 0);
  await confirm(a, "export-metrics");
  const input = exportInput();
  response = await request("/api/platform/admin", a, input);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  const result = await response.json();
  const projected = (
    await readPlatformMetrics(
      db,
      a.token,
      { preset: "7" },
      new Date(result.checkedAt)
    )
  ).report;
  assert.equal(result.csv, metricCsv(projected));
  assert.ok(!result.csv.includes(a.id) && !result.csv.includes(a.email));
  const audit = await db.adminOperation.findUniqueOrThrow({
    where: {
      actorId_requestKey: { actorId: a.id, requestKey: input.requestKey }
    }
  });
  assert.equal(
    (audit.result as { sha256: string }).sha256,
    createHash("sha256").update(result.csv).digest("hex")
  );
  assert.equal("csv" in (audit.result as object), false);
  response = await request("/api/platform/admin", a, input);
  assert.equal(response.status, 409);
  assert.equal((await response.json()).csv, undefined);
  response = await request("/api/platform/admin", a, exportInput());
  assert.equal(response.status, 403);
  assert.equal((await response.json()).csv, undefined);
  assert.equal(await audits(a), 1);
});

test("authority generations, expired proofs and revoked sessions deny current metrics and export", async () => {
  const a = await actor();
  await confirm(a, "export-metrics");
  await db.platformOperatorGrant.updateMany({
    where: { userId: a.id, capability: "EXPORT_PLATFORM_METRICS" },
    data: { revokedAt: new Date(), version: { increment: 1 } }
  });
  assert.equal(
    (await readPrivilegedAuthentication(db, a.token)).confirmedForWork,
    false
  );
  await api(a, 403);
  await confirm(a);
  await api(a);
  let response = await request("/api/platform/admin", a, exportInput());
  assert.equal(response.status, 404);
  assert.equal((await response.json()).csv, undefined);
  // Expiry is a negative fictional-state fixture, never an invented valid proof.
  await db.privilegedSessionProof.updateMany({
    where: { session: { userId: a.id } },
    data: { expiresAt: new Date(Date.now() - 1000) }
  });
  await api(a, 403);
  await confirm(a);
  await db.platformOperatorGrant.updateMany({
    where: { userId: a.id, capability: "VIEW_PLATFORM_METRICS" },
    data: { revokedAt: new Date(), version: { increment: 1 } }
  });
  await api(a, 404);
  await db.platformSession.deleteMany({ where: { userId: a.id } });
  await api(a, 401);
  response = await request("/api/platform/admin", a, exportInput());
  assert.equal(response.status, 401);
  assert.equal((await response.json()).csv, undefined);
  assert.equal(await audits(a), 0);
});

test("unsupported scopes, duplicate filters and cross-origin export inputs create no aggregate or audit", async () => {
  const a = await actor();
  await confirm(a, "export-metrics");
  for (const extra of [
    "ownerId=fictional",
    "churchId=fictional",
    "scope=owner",
    "scope=church",
    "preset=30"
  ])
    await api(a, 400, "view=metrics&preset=7&" + extra);
  for (const extra of [
    { ownerId: a.id },
    { churchId: "fictional" },
    { scope: "owner" }
  ]) {
    const response = await request("/api/platform/admin", a, {
      ...exportInput(),
      ...extra
    });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).csv, undefined);
  }
  const response = await request("/api/platform/admin", a, exportInput(), {
    Origin: "https://untrusted.example.test"
  });
  assert.equal(response.status, 403);
  assert.equal((await response.json()).csv, undefined);
  assert.equal(await audits(a), 0);
});
