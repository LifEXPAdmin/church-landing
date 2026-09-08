import test, { after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { demoViews, demoFixture, DEMO_NOTICE } from "../lib/platform/demo-fixtures";
import {
  assertPortalTestDatabase,
  createPortalActor,
  requestConnection,
  seedPortal,
  type PortalActor,
  type PortalFixture
} from "./seed-portal";

const db = new PrismaClient();
const origin = process.env.ACCOUNT_ORIGIN!;
assert.match(origin, /^https?:\/\/127\.0\.0\.1:\d+$/);
let f: PortalFixture;
before(async () => {
  await assertPortalTestDatabase(db);
  f = await seedPortal(db);
});
beforeEach(async () => {
  await db.platformAuthLimit.deleteMany();
});
after(async () => {
  await db.$disconnect();
});
const cookie = (actor: PortalActor) => `church_platform_session=${actor.token}`;

test("public demo is fixture-only, signed-out and read-only across HTML/RSC", async () => {
  const state = async () => JSON.stringify(await db.$queryRaw`
    SELECT (SELECT count(*) FROM "PlatformUser") AS users,
      (SELECT count(*) FROM "PlatformSession") AS sessions,
      (SELECT count(*) FROM "ChurchConnection") AS connections,
      (SELECT count(*) FROM "ChurchAuditEvent") AS events,
      (SELECT count(*) FROM "ChurchDirectoryPreference") AS preferences
  `, (_key, value) => typeof value === "bigint" ? String(value) : value);
  const beforeState = await state();
  for (const path of ["/platform/demo", ...demoViews.map(v => `/platform/demo/${v.slug}`)]) {
    for (const rsc of [false, true]) {
      const response = await fetch(origin + path, {
        redirect: "manual",
        headers: rsc ? { RSC: "1" } : {}
      });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("set-cookie"), null);
      assert.match(response.headers.get("x-robots-tag") ?? "", /noindex/);
      const body = await response.text();
      assert.ok(body.includes(DEMO_NOTICE));
      assert.ok(body.includes(demoFixture.church.name));
      assert.ok(!body.includes("/api/platform/"));
      assert.ok(!body.includes("$ACTION_"));
      assert.ok(!body.includes("<form"));
      for (const actor of fixtureActors()) {
        for (const privateValue of [actor.name, actor.email, actor.token])
          assert.ok(!body.includes(privateValue), "Demo must not read a real fixture account");
      }
    }
  }
  assert.equal(await state(), beforeState, "Demo has no real-system mutations");
  const sitemap = await (await fetch(origin + "/sitemap.xml")).text();
  assert.ok(!sitemap.includes("/platform/demo"));
});
const post = (
  actor: PortalActor | undefined,
  body: Record<string, unknown>,
  extra: Record<string, string> = {}
) =>
  fetch(`${origin}/api/platform/portal`, {
    method: "POST",
    redirect: "manual",
    headers: {
      "Content-Type": "application/json",
      Origin: origin,
      ...(actor ? { Cookie: cookie(actor) } : {}),
      ...extra
    },
    body: JSON.stringify(body)
  });
const get = (
  actor: PortalActor | undefined,
  view: string,
  churchId?: string,
  q?: string
) => {
  const params = new URLSearchParams({
    view,
    ...(churchId ? { churchId } : {}),
    ...(q ? { q } : {})
  });
  return fetch(`${origin}/api/platform/portal?${params}`, {
    headers: actor ? { Cookie: cookie(actor) } : {},
    redirect: "manual"
  });
};
const connection = (actor: PortalActor, churchId = f.churchA.id) =>
  db.churchConnection.findUniqueOrThrow({
    where: { userId_churchId: { userId: actor.id, churchId } }
  });
async function page(
  actor: PortalActor | undefined,
  path: string,
  rsc: boolean
) {
  const response = await fetch(origin + path, {
    redirect: "manual",
    headers: {
      ...(actor ? { Cookie: cookie(actor) } : {}),
      ...(rsc ? { RSC: "1" } : {})
    }
  });
  assert.equal(response.status, 200, path);
  if (rsc)
    assert.match(
      response.headers.get("content-type")!,
      /text\/x-component/,
      path
    );
  return response.text();
}
function fixtureActors() {
  return [
    f.memberA,
    f.memberB,
    f.operator,
    f.coordinator,
    f.contact,
    f.relationshipOwner,
    f.reviewerA,
    f.reviewerB,
    f.pending,
    f.unverified,
    f.unacknowledged
  ];
}
function redactedContext(body: string, matched: string) {
  const marker = "[REDACTED_MATCH]";
  let safe = body.replaceAll(matched, marker);
  // Redact the entire response before clipping, so truncated secrets cannot escape.
  for (const actor of fixtureActors()) {
    for (const secret of [actor.token, actor.email, actor.password])
      safe = safe.replaceAll(secret, "[REDACTED_FIXTURE]");
  }
  safe = safe
    .replaceAll(f.sharing.phone, "[REDACTED_CONTACT]")
    .replace(/\\+"/g, '"')
    .replace(/&quot;|&#34;|&#x22;/gi, '"')
    .replace(
      /((?:["'](?:set-cookie|cookie)["']\s*(?::|,)\s*["'])|(?:(?:set-cookie|cookie)\s*:\s*))([^"'\\\r\n<>]*)/gi,
      (_whole, prefix: string, value: string) =>
        `${prefix}[REDACTED_COOKIE_HEADER]${value.includes(marker) ? marker : ""}`
    )
    .replace(/[A-Za-z0-9_-]{43,}/g, "[REDACTED_OPAQUE]")
    .replace(/[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9.-]+/gi, "[REDACTED_EMAIL]");
  const position = safe.indexOf(marker);
  return JSON.stringify(
    safe.slice(Math.max(0, position - 220), position + marker.length + 220)
  );
}
function privateFieldsAbsent(body: string, source = "portal response") {
  const absent = (value: string, label: string) => {
    const found = body.includes(value);
    assert.ok(
      !found,
      `${source}: ${label}${found ? `; sanitized context=${redactedContext(body, value)}` : ""}`
    );
  };
  for (const actor of fixtureActors()) {
    absent(actor.email, "Private authentication email absent");
    absent(actor.password, "Password absent");
    absent(actor.token, "Raw session absent");
  }
  absent(f.sharing.phone, "Only-me phone absent");
  for (const field of ["passwordHash", "tokenHash", "credentialVersion"])
    absent(field, "Credential storage fields absent");
}

test("my-church, sharing and review render private HTML/RSC with one main and correctly labelled portal navigation", async () => {
  for (const route of [
    {
      path: "/platform/my-church",
      actor: f.coordinator,
      title: "My church",
      labels: ["Manage sharing", "Member directory"]
    },
    {
      path: "/platform/my-church/sharing",
      actor: f.coordinator,
      title: "My sharing",
      labels: [
        "Directory display name",
        "Directory contact email",
        "Who can see this email?",
        "Save sharing choices"
      ]
    },
    {
      path: `/platform/churches/${f.churchA.id}/review`,
      actor: f.reviewerA,
      title: "Review connections",
      labels: ["Approve connection", "Decline request"]
    }
  ]) {
    for (const rsc of [false, true]) {
      const body = await page(route.actor, route.path, rsc);
      privateFieldsAbsent(body, `${route.path} ${rsc ? "RSC" : "HTML"}`);
      if (rsc) continue;
      // Only structural checks omit inline data scripts; privacy above examines every byte.
      const markup = body.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
      assert.equal(
        (markup.match(/<main\b/gi) ?? []).length,
        1,
        `${route.path}: one main, never nested`
      );
      assert.equal(
        (markup.match(/<\/main\s*>/gi) ?? []).length,
        1,
        `${route.path}: balanced main landmark`
      );
      assert.ok(
        /<main\b[^>]*id="platform-content"/.test(markup),
        "Skip target labels the main content"
      );
      assert.ok(
        /<nav\b[^>]*aria-label="Platform"/.test(markup),
        "Platform navigation labelled"
      );
      assert.ok(
        /<nav\b[^>]*aria-label="Account and website"/.test(markup),
        "Utility navigation labelled"
      );
      assert.ok(
        markup.includes(`href="#platform-content"`),
        "Skip link available"
      );
      assert.ok(
        markup.includes(`<title>${route.title} | Godschurches</title>`),
        `${route.path}: correct document title`
      );
      assert.equal(
        markup.match(/<h1\b[^>]*>([^<]*)<\/h1>/)?.[1],
        route.title,
        `${route.path}: correct main heading`
      );
      for (const label of route.labels)
        assert.ok(markup.includes(label), `${route.path}: ${label}`);
      assert.ok(
        !/Join\s+Waitlist/i.test(markup),
        "Marketing waitlist control absent from rendered portal"
      );
      for (const link of [
        "/manifesto",
        "/for-users",
        "/for-churches",
        "/for-creators",
        "/for-businesses"
      ])
        assert.ok(
          !markup.includes(`href="${link}"`),
          "Marketing navigation absent from rendered portal"
        );
    }
  }
});

test("actual portal POST enforces exact trusted origin, session cookie and valid command shape", async () => {
  const body = {
    operation: "request",
    churchId: f.churchA.id,
    expectedVersion: 0
  };
  const forbiddenOrigins: Record<string, string>[] = [
    { Origin: "https://evil.example" },
    { Origin: "" },
    { Origin: `${origin}.evil.example` },
    { "Sec-Fetch-Site": "cross-site" }
  ];
  for (const headers of forbiddenOrigins)
    assert.equal((await post(f.unacknowledged, body, headers)).status, 403);
  assert.equal((await post(undefined, body)).status, 401);
  assert.equal(
    (await post(undefined, body, { Cookie: "church_platform_session=forged" }))
      .status,
    401
  );
  assert.equal(
    (await post(undefined, body, { Cookie: `session=${f.memberA.token}` }))
      .status,
    401
  );
  assert.equal(
    (await post(f.memberA, { operation: "x".repeat(41) })).status,
    400
  );
  assert.equal(
    (
      await post(f.memberA, {
        operation: "not-an-operation",
        churchId: f.churchA.id
      })
    ).status,
    400
  );
  assert.equal(
    (
      await fetch(`${origin}/api/platform/portal`, {
        method: "POST",
        headers: {
          Origin: origin,
          Cookie: cookie(f.memberA),
          "Content-Type": "application/json"
        },
        body: "{"
      })
    ).status,
    400
  );
  assert.equal((await get(undefined, "directory", f.churchA.id)).status, 401);
  assert.equal((await get(f.memberA, "unknown", f.churchA.id)).status, 400);
  assert.equal(
    await db.churchConnection.count({ where: { userId: f.unacknowledged.id } }),
    0
  );
});

test("actual POST denies unverified/unacknowledged actors, forged IDs, category grants and cross-church actions", async () => {
  const row = await connection(f.pending);
  for (const actor of [f.unverified, f.unacknowledged]) {
    assert.equal(
      (
        await post(actor, {
          operation: "request",
          churchId: f.churchA.id,
          expectedVersion: 0
        })
      ).status,
      403
    );
    assert.equal((await get(actor, "directory", f.churchA.id)).status, 403);
  }
  for (const actor of [
    f.memberA,
    f.coordinator,
    f.contact,
    f.relationshipOwner,
    f.reviewerB
  ]) {
    assert.equal(
      (
        await post(actor, {
          operation: "transition",
          action: "APPROVE",
          churchId: f.churchA.id,
          connectionId: row.id,
          expectedVersion: row.version,
          actorId: f.reviewerA.id,
          userId: f.reviewerA.id,
          role: "CHURCH",
          capabilities: ["REVIEW_CONNECTIONS"]
        })
      ).status,
      403
    );
  }
  assert.equal(
    (
      await post(f.memberA, {
        operation: "grant",
        churchId: f.churchA.id,
        userId: f.memberA.id,
        capability: "REVIEW_CONNECTIONS",
        expectedVersion: 0,
        actorId: f.operator.id
      })
    ).status,
    403
  );
  assert.equal(
    (
      await post(f.reviewerA, {
        operation: "transition",
        action: "APPROVE",
        churchId: f.churchB.id,
        connectionId: row.id,
        expectedVersion: row.version
      })
    ).status,
    403
  );
  assert.equal(
    (
      await post(f.memberB, {
        operation: "share",
        connectionId: (await connection(f.memberA)).id,
        expectedVersion: 3,
        ...f.sharing
      })
    ).status,
    403
  );
  assert.equal(
    (
      await post(f.reviewerA, {
        operation: "transition",
        action: "APPROVE",
        churchId: f.churchA.id,
        connectionId: "fictional-missing-id",
        expectedVersion: 0
      })
    ).status,
    404
  );
  assert.deepEqual(await connection(f.pending), row);
  const sharingRow = await connection(f.memberA);
  const preference = await db.churchDirectoryPreference.findUniqueOrThrow({
    where: { connectionId: sharingRow.id }
  });
  for (const audience of [
    { emailAudience: ["SAME_CHURCH"] },
    { phoneAudience: ["ONLY_ME"] }
  ]) {
    assert.equal(
      (
        await post(f.memberA, {
          operation: "share",
          connectionId: sharingRow.id,
          expectedVersion: sharingRow.version,
          ...f.sharing,
          ...audience
        })
      ).status,
      400
    );
  }
  assert.deepEqual(await connection(f.memberA), sharingRow);
  assert.deepEqual(
    await db.churchDirectoryPreference.findUnique({
      where: { connectionId: sharingRow.id }
    }),
    preference
  );
  assert.equal(
    await db.churchCapabilityGrant.count({ where: { userId: f.memberA.id } }),
    0
  );
});

test("API, HTML and actual RSC project safe sharing; unexpected q cannot filter or count private contacts", async () => {
  const response = await get(f.coordinator, "directory", f.churchA.id);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control")!, /private.*no-store/);
  assert.match(response.headers.get("vary")!, /Cookie/i);
  const baseline = await response.json();
  assert.deepEqual(baseline.directory, [
    { name: f.sharing.displayName, email: f.sharing.contactEmail }
  ]);
  privateFieldsAbsent(JSON.stringify(baseline));
  for (const q of [f.memberA.email, f.sharing.phone, "no-fictional-match"]) {
    const queried = await get(f.coordinator, "directory", f.churchA.id, q);
    assert.equal(queried.status, 200);
    const value = await queried.json();
    assert.deepEqual(
      value,
      baseline,
      "Unsupported q is ignored, not a private-field search or count oracle"
    );
    privateFieldsAbsent(JSON.stringify(value));
  }
  for (const actor of [
    f.memberB,
    f.relationshipOwner,
    f.operator,
    f.reviewerA
  ]) {
    assert.equal((await get(actor, "directory", f.churchA.id)).status, 403);
  }
  for (const view of ["help", "my-church", "operator"]) {
    const r = await get(
      view === "operator" ? f.operator : f.coordinator,
      view,
      f.churchA.id
    );
    assert.equal(r.status, 200);
    privateFieldsAbsent(await r.text());
  }
  for (const rsc of [false, true]) {
    const directory = await page(
      f.coordinator,
      `/platform/churches/${f.churchA.id}/directory`,
      rsc
    );
    assert.ok(directory.includes(f.sharing.displayName));
    assert.ok(directory.includes(f.sharing.contactEmail));
    privateFieldsAbsent(directory, `directory ${rsc ? "RSC" : "HTML"}`);
    for (const [view, actor] of [
      ["directory", f.memberB],
      ["review", f.reviewerB]
    ] as const) {
      const denied = await page(
        actor,
        `/platform/churches/${f.churchA.id}/${view}`,
        rsc
      );
      privateFieldsAbsent(
        denied,
        `cross-church ${view} ${rsc ? "RSC" : "HTML"}`
      );
      assert.ok(
        denied.includes("Access not available"),
        `${view}: explicit permission-denied label`
      );
      if (!rsc)
        assert.ok(
          denied.includes('role="alert"'),
          `${view}: denial announced as an alert`
        );
      for (const privateValue of [
        f.sharing.displayName,
        f.sharing.contactEmail,
        f.memberA.name,
        f.coordinator.name,
        f.contact.name,
        f.pending.name
      ])
        assert.ok(
          !denied.includes(privateValue),
          `${view}: no cross-church directory or review-queue identities`
        );
    }
    for (const path of [
      "/platform/churches",
      `/platform/churches/${f.churchA.id}`,
      `/platform/profile/${f.memberA.username}`
    ]) {
      const content = await page(undefined, path, rsc);
      privateFieldsAbsent(content, `${path} ${rsc ? "RSC" : "HTML"}`);
      assert.ok(!content.includes(f.sharing.contactEmail));
      assert.ok(!content.includes(f.sharing.displayName));
    }
    privateFieldsAbsent(
      await page(f.coordinator, `/platform/help?churchId=${f.churchA.id}`, rsc),
      `help ${rsc ? "RSC" : "HTML"}`
    );
    privateFieldsAbsent(
      await page(f.operator, "/platform/operator/churches", rsc),
      `operator ${rsc ? "RSC" : "HTML"}`
    );
  }
  const row = await connection(f.memberA);
  assert.equal(
    (
      await post(f.memberA, {
        operation: "share",
        connectionId: row.id,
        expectedVersion: row.version,
        ...f.sharing,
        listed: false
      })
    ).status,
    200
  );
  const hidden = await get(
    f.coordinator,
    "directory",
    f.churchA.id,
    f.sharing.contactEmail
  );
  assert.equal(hidden.status, 200);
  assert.deepEqual((await hidden.json()).directory, []);
  for (const rsc of [false, true]) {
    const content = await page(
      f.coordinator,
      `/platform/churches/${f.churchA.id}/directory`,
      rsc
    );
    privateFieldsAbsent(
      content,
      `directory after unlisting ${rsc ? "RSC" : "HTML"}`
    );
    assert.ok(!content.includes(f.sharing.contactEmail));
    assert.ok(!content.includes(f.sharing.displayName));
  }
});

test("actual concurrent review POST has one winner and rejects stale transitions", async () => {
  const row = await connection(f.pending);
  const results = await Promise.all(
    ["APPROVE", "DECLINE"].map((action) =>
      post(f.reviewerA, {
        operation: "transition",
        action,
        churchId: f.churchA.id,
        connectionId: row.id,
        expectedVersion: row.version
      })
    )
  );
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  assert.equal((await connection(f.pending)).version, row.version + 1);
  assert.equal(
    (
      await post(f.reviewerA, {
        operation: "transition",
        action: "REMOVE",
        churchId: f.churchA.id,
        connectionId: row.id,
        expectedVersion: row.version
      })
    ).status,
    409
  );
});

test("actual POST rejects array transition actions without approving a suspended pending target", async () => {
  const actor = await createPortalActor(db, "array");
  await requestConnection(db, actor, f.churchA.id);
  const snapshot = await get(actor, "my-church");
  assert.equal(snapshot.status, 200);
  const version = (await snapshot.json()).viewer.version;
  assert.equal(
    (
      await post(f.operator, {
        operation: "suspend",
        userId: actor.id,
        suspended: true,
        expectedVersion: version
      })
    ).status,
    200
  );
  const row = await connection(actor);
  assert.equal(row.state, "PENDING");
  assert.equal(
    (
      await post(f.reviewerA, {
        operation: "transition",
        action: ["APPROVE"],
        churchId: f.churchA.id,
        connectionId: row.id,
        expectedVersion: row.version
      })
    ).status,
    400
  );
  assert.deepEqual(await connection(actor), row);
});

test("actual sharing/removal POST races cannot resurrect revoked directory access", async () => {
  const row = await connection(f.memberA);
  const [sharing, removal] = await Promise.all([
    post(f.memberA, {
      operation: "share",
      connectionId: row.id,
      expectedVersion: row.version,
      ...f.sharing
    }),
    post(f.reviewerA, {
      operation: "transition",
      action: "REMOVE",
      churchId: f.churchA.id,
      connectionId: row.id,
      expectedVersion: row.version
    })
  ]);
  assert.ok([200, 403, 409].includes(sharing.status));
  assert.ok([200, 409].includes(removal.status));
  assert.ok(sharing.status === 200 || removal.status === 200);
  const latest = await connection(f.memberA);
  if (latest.state === "APPROVED")
    assert.equal(
      (
        await post(f.reviewerA, {
          operation: "transition",
          action: "REMOVE",
          churchId: f.churchA.id,
          connectionId: latest.id,
          expectedVersion: latest.version
        })
      ).status,
      200
    );
  assert.equal((await get(f.memberA, "directory", f.churchA.id)).status, 403);
  assert.equal(
    (
      await post(f.memberA, {
        operation: "share",
        connectionId: row.id,
        expectedVersion: row.version,
        ...f.sharing
      })
    ).status,
    403
  );
  assert.equal(
    await db.churchDirectoryPreference.count({
      where: { connectionId: row.id }
    }),
    0
  );
  const result = await get(f.coordinator, "directory", f.churchA.id);
  assert.equal(result.status, 200);
  assert.ok(!(await result.text()).includes(f.sharing.contactEmail));
});

test("actual revocation/suspension POST takes effect on existing cookies without another login", async () => {
  assert.equal((await get(f.reviewerB, "review", f.churchB.id)).status, 200);
  const grant = await db.churchCapabilityGrant.findFirstOrThrow({
    where: { userId: f.reviewerB.id }
  });
  assert.equal(
    (
      await post(f.operator, {
        operation: "revoke-grant",
        churchId: f.churchB.id,
        id: grant.id,
        expectedVersion: grant.version
      })
    ).status,
    200
  );
  assert.equal((await get(f.reviewerB, "review", f.churchB.id)).status, 403);
  assert.equal((await get(f.reviewerB, "my-church")).status, 200);
  const contact = await db.churchContactAssignment.findFirstOrThrow({
    where: { userId: f.contact.id }
  });
  assert.equal(
    (
      await post(f.coordinator, {
        operation: "revoke-contact",
        churchId: f.churchA.id,
        id: contact.id,
        expectedVersion: contact.version
      })
    ).status,
    200
  );
  const help = await get(f.coordinator, "help", f.churchA.id);
  assert.equal(help.status, 200);
  assert.ok(!(await help.text()).includes(contact.contactEmail!));
  const viewer = (await (await get(f.memberB, "my-church")).json()).viewer;
  assert.equal(
    (
      await post(f.operator, {
        operation: "suspend",
        userId: f.memberB.id,
        suspended: true,
        expectedVersion: viewer.version
      })
    ).status,
    200
  );
  assert.equal((await get(f.memberB, "my-church")).status, 401);
  assert.equal(
    (
      await post(f.memberB, {
        operation: "request",
        churchId: f.churchA.id,
        expectedVersion: 0
      })
    ).status,
    401
  );
  assert.equal(
    await db.platformSession.count({ where: { userId: f.memberB.id } }),
    0
  );
});
