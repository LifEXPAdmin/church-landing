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
  actor = await createPortalActor(db, "plisthttp");
  other = await createPortalActor(db, "plisthttp2");
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
  fetch(origin + "/api/platform/media-playlists", {
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
  title: "HTTPS private playlist " + randomUUID(),
  description: "Private playlist detail",
  audience: "PRIVATE"
};
const operation = (operation: string, extra: Record<string, unknown> = {}) => ({
  operation,
  mutationId: randomUUID(),
  ...extra
});
test("HTTPS playlist boundaries enforce origin, account, strict payload, no-store and exact retry", async () => {
  const body = operation("create", { ownerChurchId: null, fields });
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
  const response = await send(body);
  assert.equal(response.status, 200);
  const draft = await response.json();
  assert.deepEqual(await (await send(body)).json(), draft);
  assert.equal(await db.mediaPlaylist.count({ where: { id: draft.id } }), 1);
  const path = `/api/platform/media-playlists?view=editor&id=${draft.id}`;
  assert.equal((await get(path, other, other.id)).status, 404);
  assert.equal((await get(path, actor)).status, 401);
  const managed = await get(path, actor, actor.id);
  assert.equal(managed.status, 200);
  for (const h of [
    "cache-control",
    "cdn-cache-control",
    "vercel-cdn-cache-control"
  ])
    assert.match(managed.headers.get(h)!, /no-store/);
  assert.match(managed.headers.get("x-robots-tag")!, /noindex/);
  for (const rsc of [false, true])
    for (const suffix of ["", "?edit=1"]) {
      const html = await (
        await get(
          `/platform/media/playlists/${draft.id}${suffix}`,
          actor,
          undefined,
          rsc
        )
      ).text();
      assert.ok(!html.includes(fields.title));
      assert.ok(!html.includes(fields.description));
    }
  assert.equal(
    (
      await send(
        operation("publish", {
          playlistId: draft.id,
          expectedVersion: draft.version,
          fields
        })
      )
    ).status,
    200
  );
  assert.equal(
    (await get(`/api/platform/media-playlists?view=detail&id=${draft.id}`))
      .status,
    404
  );
  assert.equal(
    (
      await get(
        `/api/platform/media-playlists?view=detail&id=${draft.id}`,
        other
      )
    ).status,
    404
  );
  assert.equal(
    (
      await get(
        `/api/platform/media-playlists?view=detail&id=${draft.id}`,
        actor
      )
    ).status,
    200
  );
  assert.equal(
    (await get("/api/platform/media-playlists?view=saved", other, actor.id))
      .status,
    401
  );
  assert.equal(
    (
      await get(
        "/api/platform/media-playlists?view=saved&view=public",
        actor,
        actor.id
      )
    ).status,
    400
  );
  assert.equal(
    (
      await get(
        "/api/platform/media-playlists?view=public&anchor=" + randomUUID()
      )
    ).status,
    400
  );
});
test("HTTPS saves conceal revoked sources and remain independently removable", async () => {
  const { mediaCatalogCommand } =
    await import("../lib/platform/media-catalog-commands");
  const mediaFields = {
    title: "HTTPS source sentinel " + randomUUID(),
    description: "source-private-description",
    format: "SERMON",
    presentation: "VIDEO",
    audience: "PUBLIC",
    details: { preachedOn: null },
    sourceUrl: "https://www.youtube.com/watch?v=abcdefghijk"
  };
  const reviewed = {
    fields: mediaFields,
    acknowledgment: {
      policy: MEDIA_POLICY,
      sourceUrl: mediaFields.sourceUrl,
      audience: "PUBLIC",
      accepted: true
    },
    rights: {
      basis: "OWN",
      reviewed: true,
      publicRecording: true,
      textRights: true
    }
  };
  const media = await mediaCatalogCommand(
    db,
    actor.token,
    operation("create", { ownerChurchId: null, ...reviewed })
  );
  await mediaCatalogCommand(
    db,
    actor.token,
    operation("publish", {
      itemId: media.id,
      expectedVersion: media.version,
      ...reviewed
    })
  );
  const savedResponse = await send(
    operation("save-media", { mediaId: media.id })
  );
  assert.equal(savedResponse.status, 200);
  const saved = await savedResponse.json();
  const otherSaved = await (
    await get("/api/platform/media-playlists?view=saved", other, other.id)
  ).text();
  assert.ok(!otherSaved.includes(media.id));
  await db.mediaCatalogRights.update({
    where: { itemId: media.id },
    data: { revokedAt: new Date() }
  });
  const ownSaved = await (
    await get("/api/platform/media-playlists?view=saved", actor, actor.id)
  ).text();
  assert.ok(ownSaved.includes(saved.id));
  assert.ok(!ownSaved.includes(media.id));
  assert.ok(!ownSaved.includes(mediaFields.title));
  assert.equal(
    (
      await send(
        operation("unsave-media", {
          savedId: saved.id,
          expectedVersion: saved.version
        })
      )
    ).status,
    200
  );
  assert.equal(
    (await send(operation("save-media", { mediaId: media.id }))).status,
    404
  );
});
test(
  "enforced MFA binds church reads, writes and receipts to current session, grant and proof",
  { skip: process.env.B1_PLAYLIST_MFA_HTTP !== "1" },
  async () => {
    const { mediaPlaylistCommand } =
      await import("../lib/platform/media-playlist-commands");
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
    const draft = await mediaPlaylistCommand(db, actor.token, {
      operation: "create",
      mutationId: randomUUID(),
      ownerChurchId: church.id,
      fields: { ...fields, audience: "CHURCH" }
    });
    process.env.PRIVILEGED_MFA_MODE = "enforce";
    const path = `/api/platform/media-playlists?view=editor&id=${draft.id}`;
    assert.equal((await get(path, actor, actor.id)).status, 404);
    const publish = {
      operation: "publish",
      mutationId: randomUUID(),
      playlistId: draft.id,
      expectedVersion: 1,
      fields: { ...fields, audience: "CHURCH" }
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
      fields: {
        title: "Personal MFA-independent draft",
        description: "",
        audience: "PRIVATE"
      }
    });
    assert.equal(personal.status, 200);
  }
);
