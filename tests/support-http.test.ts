import test, { before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { seedSupport, requestInput, type SupportFixture } from "./seed-support";
import type { PortalActor } from "./seed-portal";
const db = new PrismaClient();
const origin = process.env.ACCOUNT_ORIGIN!;
let f: SupportFixture;
assert.match(origin, /^https:\/\/127\.0\.0\.1:\d+$/);
before(async () => {
  f = await seedSupport(db);
});
beforeEach(async () => {
  await db.platformAuthLimit.deleteMany();
});
after(async () => {
  await db.$disconnect();
});
const cookie = (a: PortalActor) => `church_platform_session=${a.token}`;
const get = (a: PortalActor | null, view: string, id?: string) =>
  fetch(
    `${origin}/api/platform/support?view=${view}${id ? `&caseId=${id}` : ""}`,
    { headers: a ? { Cookie: cookie(a) } : {} }
  );
const post = (
  a: PortalActor | null,
  input: Record<string, unknown>,
  headers = {}
) =>
  fetch(`${origin}/api/platform/support`, {
    method: "POST",
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      ...(a ? { Cookie: cookie(a) } : {}),
      ...headers
    },
    body: JSON.stringify(input)
  });
async function newCase() {
  const input = await requestInput(db, f.memberA.token);
  const response = await post(f.memberA, input);
  assert.equal(response.status, 200);
  return response.json() as Promise<{ caseId: string; version: number }>;
}
function privateHeaders(r: Response) {
  assert.match(r.headers.get("cache-control") ?? "", /no-store/);
  assert.equal(r.headers.get("referrer-policy"), "no-referrer");
  assert.match(r.headers.get("x-robots-tag") ?? "", /noindex/);
}

test("HTTP create and retry save once, return minimal receipt and expose scoped list/detail", async () => {
  const input = await requestInput(db, f.memberA.token);
  const response = await post(f.memberA, input);
  privateHeaders(response);
  assert.equal(response.status, 200);
  const c = await response.json();
  const retry = await post(f.memberA, input);
  assert.equal(retry.status, 200);
  assert.equal((await retry.json()).caseId, c.caseId);
  assert.deepEqual(Object.keys(c).sort(), ["caseId", "message", "version"]);
  assert.match(c.message, /Request received/);
  const detail = await get(f.memberA, "detail", c.caseId);
  assert.equal(detail.status, 200);
  privateHeaders(detail);
  const s = await detail.json();
  assert.equal(s.detail.id, c.caseId);
  assert.equal(s.detail.subject, input.subject);
  assert.equal(s.detail.description, input.description);
  assert.equal(s.detail.requester.id, f.memberA.id);
  assert.equal(s.detail.owner.id, f.owner.id);
  assert.ok(!JSON.stringify(s).includes(f.memberA.email));
  assert.ok(!JSON.stringify(s).includes(f.memberA.token));
  const list = await get(f.memberA, "requests");
  assert.ok(
    (await list.json()).rows.some((r: { id: string }) => r.id === c.caseId)
  );
});
test("HTTP denies missing sessions, forged origin/fields, other actors and body overflow generically", async () => {
  const c = await newCase();
  assert.equal((await get(null, "requests")).status, 401);
  for (const a of [f.memberB, f.contact, f.reviewerA, f.manager, f.backup]) {
    const r = await get(a, "detail", c.caseId);
    assert.equal(r.status, 404);
    privateHeaders(r);
    assert.ok(!(await r.text()).includes("Fictional private"));
    const bad = await post(a, {
      operation: "reply",
      caseId: c.caseId,
      expectedVersion: c.version,
      requestKey: randomUUID(),
      body: "Forbidden attempt"
    });
    assert.equal(bad.status, 404);
  }
  const input = await requestInput(db, f.pending.token);
  assert.equal(
    (await post(f.pending, input, { Origin: "https://attacker.example" }))
      .status,
    403
  );
  assert.equal(
    (await post(f.pending, { ...input, capability: "RESPOND" })).status,
    400
  );
  assert.equal(
    (await post(f.pending, { ...input, description: "x".repeat(9000) })).status,
    400
  );
  const guessed = await get(f.memberB, "detail", "unrelated-opaque-case");
  assert.equal(guessed.status, 404);
});
test("private case HTML and raw production RSC omit detail even for an authorized account; its API retains the conversation", async () => {
  const c = await newCase();
  const privateReply = `Fictional private case reply ${randomUUID()}`;
  const reply = await post(f.owner, {
    operation: "reply",
    caseId: c.caseId,
    expectedVersion: c.version,
    requestKey: randomUUID(),
    body: privateReply
  });
  assert.equal(reply.status, 200);
  const detail = await get(f.memberA, "detail", c.caseId);
  assert.equal(detail.status, 200);
  privateHeaders(detail);
  const snapshot = await detail.json();
  assert.equal(snapshot.detail.subject, "Fictional private help subject");
  assert.equal(
    snapshot.detail.description,
    "Fictional private description for isolated support tests."
  );
  assert.ok(
    snapshot.detail.messages.some(
      (message: { body: string }) => message.body === privateReply
    )
  );
  const path = `/platform/help/cases/${c.caseId}`;
  for (const rsc of [false, true])
    for (const a of [f.memberA, f.memberB, f.manager]) {
      const r = await fetch(origin + path, {
        headers: { Cookie: cookie(a), ...(rsc ? { RSC: "1" } : {}) },
        redirect: "manual"
      });
      assert.equal(r.status, 200);
      privateHeaders(r);
      assert.match(
        r.headers.get("content-type") ?? "",
        rsc ? /text\/x-component/ : /text\/html/
      );
      const body = await r.text();
      for (const privateValue of [
        "Fictional private description",
        "Fictional private help subject",
        privateReply,
        f.owner.name
      ])
        assert.ok(
          !body.includes(privateValue),
          "Initial HTML and RSC contain no private case presentation or snapshot"
        );
      if (a.id !== f.memberA.id) {
        // The shell may identify its signed-in viewer, never another requester.
        assert.ok(!body.includes(f.memberA.name));
      }
      for (const privateValue of [
        a.token,
        a.email,
        f.memberA.email,
        f.owner.email,
        f.sharing.phone
      ])
        assert.ok(
          !body.includes(privateValue),
          "No token or private contact serialized"
        );
      if (!rsc) {
        const title = body.match(/<title>(.*?)<\/title>/)?.[1] ?? "";
        assert.ok(!title.includes("Fictional private"));
        assert.match(title, /Private request/);
      }
    }
});
test("unassigned manager receives bounded routing metadata only through the authorized API, never initial HTML or RSC", async () => {
  const c = await newCase();
  await db.supportCapabilityGrant.update({
    where: { id: f.ownerGrant.id },
    data: { revokedAt: new Date(), version: { increment: 1 } }
  });
  let routingPage = 0;
  let text = "";
  let ownerOptions: { id: string; name: string; version: number }[] = [];
  for (; routingPage < 10; routingPage++) {
    const r = await get(f.manager, "routing&page=" + routingPage);
    assert.equal(r.status, 200);
    privateHeaders(r);
    text = await r.text();
    const value = JSON.parse(text);
    assert.ok(value.routing.length <= 20);
    assert.ok(value.ownerOptions.length <= 20);
    ownerOptions = value.ownerOptions;
    for (const option of ownerOptions) {
      assert.equal(typeof option.id, "string");
      assert.equal(typeof option.name, "string");
      assert.ok(Number.isSafeInteger(option.version) && option.version > 0);
    }
    assert.ok(!text.includes("Fictional private"));
    assert.ok(!text.includes(f.memberA.name));
    if (text.includes(c.caseId) || !value.more) break;
  }
  assert.ok(text.includes(c.caseId));
  assert.ok(ownerOptions.length > 0, "An eligible routing owner remains available");
  assert.ok(!text.includes("Fictional private"));
  assert.ok(!text.includes(f.memberA.name));
  for (const rsc of [false, true]) {
    const page = await fetch(
      origin + "/platform/help/routing?page=" + routingPage,
      {
        headers: { Cookie: cookie(f.manager), ...(rsc ? { RSC: "1" } : {}) }
      }
    );
    assert.equal(page.status, 200);
    privateHeaders(page);
    assert.match(
      page.headers.get("content-type") ?? "",
      rsc ? /text\/x-component/ : /text\/html/
    );
    const body = await page.text();
    assert.ok(
      !body.includes(c.caseId),
      "Routing references stay out of HTML and RSC"
    );
    for (const option of ownerOptions) {
      assert.ok(
        !body.includes(option.id),
        "Owner grant IDs stay out of HTML and RSC"
      );
      assert.ok(
        !body.includes(option.name),
        "Owner choices stay out of HTML and RSC"
      );
    }
    assert.ok(!body.includes("Fictional private"));
    assert.ok(!body.includes(f.memberA.email));
  }
  assert.equal((await get(f.manager, "detail", c.caseId)).status, 404);
  await db.supportCapabilityGrant.update({
    where: { id: f.ownerGrant.id },
    data: { revokedAt: null, version: { increment: 1 } }
  });
});
test("HTTP durable rate budget and unconfigured intake cannot fake a saved request", async () => {
  await db.supportIntakeSetting.update({
    where: { id: "default" },
    data: { enabled: false }
  });
  const input = await requestInput(db, f.pending.token);
  const count = await db.supportCase.count({
    where: { requesterId: f.pending.id }
  });
  assert.equal((await post(f.pending, input)).status, 503);
  assert.equal(
    await db.supportCase.count({ where: { requesterId: f.pending.id } }),
    count
  );
  const snap = await get(f.pending, "new");
  assert.equal((await snap.json()).intake.available, false);
  // Durable rejected attempts consume the operation budget as well.
  for (let i = 0; i < 9; i++)
    await post(f.pending, { ...input, requestKey: randomUUID() });
  const limited = await post(f.pending, { ...input, requestKey: randomUUID() });
  assert.equal(limited.status, 429);
  assert.ok((await db.platformAuthLimit.count()) > 0);
  await db.supportIntakeSetting.update({
    where: { id: "default" },
    data: { enabled: true }
  });
});
test("support demo is fixture-only and analytics rejects support paths without storing them", async () => {
  const count = async () => [
    await db.supportCase.count(),
    await db.supportMessage.count(),
    await db.supportOperation.count(),
    await db.supportAuditEvent.count()
  ];
  const before = await count();
  for (const path of ["support-requests", "support-case", "support-inbox"])
    for (const rsc of [false, true]) {
      const r = await fetch(`${origin}/platform/demo/${path}`, {
        headers: rsc ? { RSC: "1" } : {}
      });
      assert.equal(r.status, 200);
      const body = await r.text();
      assert.ok(body.includes("Fictional"));
      assert.ok(!body.includes("/api/platform/support"));
      assert.ok(!body.includes("<form"));
      assert.ok(!body.includes(f.owner.name));
      assert.ok(!body.includes(f.memberA.name));
      assert.equal(r.headers.get("set-cookie"), null);
      assert.match(r.headers.get("x-robots-tag") ?? "", /noindex/);
    }
  assert.deepEqual(await count(), before);
  const analyticsBefore = await db.waitlistEvent.count();
  const tracked = await fetch(origin + "/api/track", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      eventType: "PAGE_VIEW",
      path: "/platform/help/cases/private-reference",
      label: "Private case subject"
    })
  });
  assert.equal(tracked.status, 410);
  assert.equal(await db.waitlistEvent.count(), analyticsBefore);
});
