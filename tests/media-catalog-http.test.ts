import { sessionCookieFixtureName } from "../scripts/session-cookie-fixture.mjs";
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  assertPortalTestDatabase,
  createPortalActor,
  type PortalActor
} from "./seed-portal";
import { MEDIA_POLICY } from "../lib/platform/media-catalog-options";
const db = new PrismaClient(),
  origin = process.env.ACCOUNT_ORIGIN!;
let actor: PortalActor, other: PortalActor;
assert.match(origin, /^https:\/\/127\.0\.0\.1:\d+$/);
before(async () => {
  await assertPortalTestDatabase(db);
  actor = await createPortalActor(db, "mediahttp");
  other = await createPortalActor(db, "mediahttp2");
});
after(() => db.$disconnect());
const get = (
  path: string,
  user: PortalActor | null = null,
  expected?: string,
  rsc = false
) =>
  fetch(origin + path, {
    headers: {
      ...(user
        ? { cookie: `${sessionCookieFixtureName()}=${user.token}` }
        : {}),
      ...(expected ? { "x-expected-account": expected } : {}),
      ...(rsc ? { RSC: "1" } : {})
    }
  });
const send = (body: unknown, source = origin, expected = actor.id) =>
  fetch(origin + "/api/platform/media-catalog", {
    method: "POST",
    headers: {
      origin: source,
      cookie: `${sessionCookieFixtureName()}=${actor.token}`,
      "x-expected-account": expected,
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });
const fields = {
  title: "HTTPS private metadata " + randomUUID(),
  description: "Fictional metadata",
  format: "TESTIMONY",
  presentation: "VIDEO",
  audience: "MEMBERS",
  details: { subject: "CONSENTED_OTHER" },
  sourceUrl: "https://www.youtube.com/watch?v=abcdefghijk"
};
const reviewed = {
  fields,
  acknowledgment: {
    policy: MEDIA_POLICY,
    sourceUrl: fields.sourceUrl,
    audience: fields.audience,
    accepted: true
  },
  rights: {
    basis: "PERMISSION",
    evidenceReference: "private-permission-marker",
    consentReference: "private-consent-marker",
    reviewed: true,
    publicRecording: true,
    textRights: true
  }
};
test("HTTPS media commands require same origin, current expected account, bounded strict payloads and exact retries", async () => {
  const body = {
    operation: "create",
    mutationId: randomUUID(),
    ownerChurchId: null,
    ...reviewed
  };
  assert.equal((await send(body, "https://unrelated.example")).status, 403);
  assert.equal((await send(body, origin, other.id)).status, 401);
  assert.equal((await send(body, origin, "")).status, 401);
  assert.equal((await send({ ...body, ownerId: other.id })).status, 400);
  assert.equal(
    (
      await send({
        ...body,
        fields: { ...fields, description: "x".repeat(40000) }
      })
    ).status,
    400
  );
  const r = await send(body);
  assert.equal(r.status, 200);
  const saved = await r.json();
  assert.deepEqual(await (await send(body)).json(), saved);
  assert.equal(await db.mediaCatalogItem.count({ where: { id: saved.id } }), 1);
  assert.equal(
    (await get(`/api/platform/media-catalog?view=detail&id=${saved.id}`))
      .status,
    404
  );
  const response = await get(
    `/api/platform/media-catalog?view=editor&id=${saved.id}`,
    actor,
    actor.id
  );
  assert.equal(response.status, 200);
  for (const h of [
    "cache-control",
    "cdn-cache-control",
    "vercel-cdn-cache-control"
  ])
    assert.match(response.headers.get(h)!, /no-store/);
  assert.match(response.headers.get("x-robots-tag")!, /noindex/);
  assert.equal(
    (
      await get(
        `/api/platform/media-catalog?view=editor&id=${saved.id}`,
        other,
        other.id
      )
    ).status,
    404
  );
  const publish = await send({
    operation: "publish",
    mutationId: randomUUID(),
    itemId: saved.id,
    expectedVersion: 1,
    ...reviewed
  });
  assert.equal(publish.status, 200);
  assert.equal(
    (await get(`/api/platform/media-catalog?view=detail&id=${saved.id}`))
      .status,
    404
  );
  const visible = await (
    await get(`/api/platform/media-catalog?view=detail&id=${saved.id}`, other)
  ).json();
  assert.equal(visible.item.title, fields.title);
  assert.ok(!JSON.stringify(visible).includes("private-consent-marker"));
  assert.ok(!JSON.stringify(visible).includes(actor.email));
  for (const rsc of [false, true]) {
    const html = await (
      await get(`/platform/media/${saved.id}`, actor, undefined, rsc)
    ).text();
    assert.ok(!html.includes(fields.title));
    assert.ok(!html.includes(fields.sourceUrl));
    assert.ok(!html.includes("private-permission-marker"));
  }
  await db.mediaCatalogRights.update({
    where: { itemId: saved.id },
    data: { revokedAt: new Date() }
  });
  const hidden = await get(
    `/api/platform/media-catalog?view=detail&id=${saved.id}`,
    other
  );
  assert.equal(hidden.status, 404);
  assert.ok(!(await hidden.text()).includes(fields.title));
});
test("HTTPS media search rejects unsupported and duplicate filters and hides private counts", async () => {
  assert.equal(
    (await get("/api/platform/media-catalog?format=UNKNOWN")).status,
    400
  );
  assert.equal((await get("/api/platform/media-catalog?q=a&q=b")).status, 400);
  assert.equal(
    (await get("/api/platform/media-catalog?scripture=John")).status,
    400
  );
  assert.equal((await get("/api/platform/media-catalog?page=-1")).status, 400);
  const response = await get(
    "/api/platform/media-catalog?q=" + encodeURIComponent(fields.title)
  );
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.total, 0);
  assert.deepEqual(data.items, []);
});

test(
  "enforced MFA binds church reads, writes and receipts to current session, grant and proof",
  { skip: process.env.B1_MEDIA_MFA_HTTP !== "1" },
  async () => {
    const { mediaCatalogCommand } =
      await import("../lib/platform/media-catalog-commands");
    const { privilegedAuthenticatorCommand } =
      await import("../lib/platform/privileged-auth");
    const { openAuthenticator, authenticatorTotp } =
      await import("../lib/platform/admin-authenticator-crypto");
    const { loginAccount } = await import("../lib/platform/accounts");
    const church = await db.church.create({
      data: {
        slug: randomUUID(),
        name: "Fictional protected media church",
        summary: "Isolated MFA acceptance",
        communityListed: true
      }
    });
    await db.churchConnection.create({
      data: { userId: actor.id, churchId: church.id, state: "APPROVED" }
    });
    const claim = await db.churchClaim.create({
      data: {
        ownerId: actor.id,
        requestKey: randomUUID(),
        churchId: church.id,
        kind: "INITIAL",
        authority: {},
        profile: {},
        status: "APPROVED",
        approvedAt: new Date(),
        activatedAt: new Date()
      }
    });
    await db.churchCapabilityGrant.createMany({
      data: [
        {
          userId: actor.id,
          churchId: church.id,
          capability: "MANAGE_CHURCH_ACCESS",
          sourceClaimId: claim.id
        },
        {
          userId: actor.id,
          churchId: church.id,
          capability: "MANAGE_CHURCH_MEDIA"
        }
      ]
    });
    process.env.PRIVILEGED_MFA_MODE = "off";
    const draft = await mediaCatalogCommand(db, actor.token, {
      operation: "create",
      mutationId: randomUUID(),
      ownerChurchId: church.id,
      ...reviewed
    });
    process.env.PRIVILEGED_MFA_MODE = "enforce";
    const path = `/api/platform/media-catalog?view=editor&id=${draft.id}`;
    assert.equal((await get(path, actor, actor.id)).status, 404);
    const publish = {
      operation: "publish",
      mutationId: randomUUID(),
      itemId: draft.id,
      expectedVersion: 1,
      ...reviewed
    };
    assert.equal((await send(publish)).status, 404);
    await privilegedAuthenticatorCommand(
      db,
      actor.token,
      { operation: "mfa-start", requestKey: randomUUID(), expectedVersion: 0 },
      actor.password
    );
    const factor = await db.adminAuthenticator.findUniqueOrThrow({
        where: { userId: actor.id }
      }),
      secret = openAuthenticator(actor.id, factor.secretCiphertext),
      counter = BigInt(Math.floor(Date.now() / 30000));
    const enrolled = await privilegedAuthenticatorCommand(
      db,
      actor.token,
      {
        operation: "mfa-confirm",
        requestKey: randomUUID(),
        expectedVersion: factor.version,
        code: authenticatorTotp(secret, counter - BigInt(1))
      },
      undefined
    );
    await privilegedAuthenticatorCommand(
      db,
      actor.token,
      {
        operation: "mfa-challenge",
        requestKey: randomUUID(),
        expectedVersion: Number(enrolled.version),
        purpose: "privileged-work",
        code: authenticatorTotp(secret, counter)
      },
      undefined
    );
    assert.equal((await get(path, actor, actor.id)).status, 200);
    assert.equal((await send(publish)).status, 200);
    const otherSession = await loginAccount(
      db,
      actor.email,
      actor.password,
      "fictional separate media browser"
    );
    assert.equal(
      (await get(path, { ...actor, token: otherSession }, actor.id)).status,
      404
    );
    await db.privilegedSessionProof.updateMany({
      where: { session: { userId: actor.id } },
      data: { expiresAt: new Date(Date.now() - 1000) }
    });
    assert.equal((await get(path, actor, actor.id)).status, 404);
    assert.equal((await send(publish)).status, 404);
    // Personal management remains available without a church proof.
    const personal = await send({
      operation: "create",
      mutationId: randomUUID(),
      ownerChurchId: null,
      fields: { title: "Personal MFA-independent draft" }
    });
    assert.equal(personal.status, 200);
  }
);
