import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import sharp from "sharp";
import {
  assertPortalTestDatabase,
  createPortalActor,
  seedOperatorGrants
} from "./seed-portal";
import {
  exchangeListingCommand,
  readExchangeListing
} from "../lib/platform/exchange-listings";
import {
  emptyExchangeFields,
  EXCHANGE_ITEM_POLICY
} from "../lib/platform/exchange-options";
import { searchDiscoveryPlaces } from "../lib/platform/discovery-places";
import { uploadImage } from "../lib/platform/media";
import { imageStorage } from "../lib/platform/media-storage";
const db = new PrismaClient(),
  origin = process.env.ACCOUNT_ORIGIN!,
  requestOrigin = process.env.EXCHANGE_REQUEST_ORIGIN ?? origin;
const priorReports = process.env.COMMUNITY_REPORTS_ENABLED;
assert.match(origin, /^https:\/\/127\.0\.0\.1:\d+$/);
before(async () => {
  await assertPortalTestDatabase(db);
  process.env.COMMUNITY_REPORTS_ENABLED = "true";
});
after(async () => {
  await db.$disconnect();
  if (priorReports === undefined) delete process.env.COMMUNITY_REPORTS_ENABLED;
  else process.env.COMMUNITY_REPORTS_ENABLED = priorReports;
});
const req = (
  path: string,
  token = "",
  body?: Record<string, unknown>,
  headers: Record<string, string> = {}
) =>
  fetch(origin + path, {
    redirect: "manual",
    method: body ? "POST" : "GET",
    headers: {
      cookie: `church_platform_session=${token}`,
      origin: requestOrigin,
      ...(body ? { "content-type": "application/json" } : {}),
      ...headers
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
const input = (operation: string, fields: Record<string, unknown>) => ({
  operation,
  mutationId: randomUUID(),
  ...fields
});

test("production HTTPS listing API, HTML/RSC and all photo variants share current account, audience and archive boundaries", async () => {
  const owner = await createPortalActor(db, "exhttpui"),
    stranger = await createPortalActor(db, "exhttpno"),
    reviewer = await createPortalActor(db, "exhttprvw");
  await seedOperatorGrants(db, reviewer, ["REVIEW_COMMUNITY_REPORTS"]);
  const marker = "Fictional private listing " + randomUUID();
  const fields = {
    ...emptyExchangeFields(),
    title: marker,
    description: "Selected fictional HTTP item only",
    category: "BOOKS",
    condition: "GOOD",
    country: "US",
    placeId: (await searchDiscoveryPlaces("US", "Chicago")).places[0].id
  };
  const body = input("create", {
    schema: 1,
    fields,
    ownerChurchId: null,
    expectedVersion: 0
  });
  assert.equal(
    (await req("/api/platform/exchange", owner.token, body)).status,
    401
  );
  assert.equal(
    (
      await req("/api/platform/exchange", owner.token, body, {
        "x-expected-account": stranger.id
      })
    ).status,
    401
  );
  assert.equal(
    (
      await req("/api/platform/exchange", owner.token, body, {
        "x-expected-account": owner.id,
        origin: "https://other.invalid"
      })
    ).status,
    403
  );
  const created = await req("/api/platform/exchange", owner.token, body, {
    "x-expected-account": owner.id
  });
  assert.ok([200, 202].includes(created.status));
  for (const header of [
    "cache-control",
    "cdn-cache-control",
    "vercel-cdn-cache-control"
  ])
    assert.match(created.headers.get(header)!, /no-store/);
  const row = await created.json();
  assert.equal(
    (
      await (
        await req("/api/platform/exchange", owner.token, body, {
          "x-expected-account": owner.id
        })
      ).json()
    ).id,
    row.id
  );
  const path = `/platform/exchange/${row.id}`,
    editor = path + "/edit";
  for (const headers of [{}, { RSC: "1" }] as Record<string, string>[]) {
    for (const token of ["", stranger.token]) {
      const publicHtml = await (
        await req(path, token, undefined, headers)
      ).text();
      const privateHtml = await (
        await req(editor, token, undefined, headers)
      ).text();
      assert.ok(!publicHtml.includes(marker));
      assert.ok(!privateHtml.includes(marker));
    }
    const owned = await req(editor, owner.token, undefined, headers);
    assert.match(owned.headers.get("cache-control")!, /no-store/);
    assert.ok((await owned.text()).includes(marker));
  }
  assert.equal(
    (
      await req(
        `/api/platform/exchange?view=editor&id=${row.id}`,
        stranger.token
      )
    ).status,
    404
  );
  const bytes = await sharp({
    create: { width: 60, height: 60, channels: 3, background: "green" }
  })
    .png()
    .toBuffer();
  const image = await uploadImage(
    db,
    owner.token,
    {
      purpose: "EXCHANGE_PHOTO",
      targetId: row.id,
      requestKey: randomUUID(),
      caption: "Fictional selected photo",
      alt: "Green test square"
    },
    bytes,
    imageStorage()
  );
  for (const variant of ["original", "large", "medium", "thumb"]) {
    const photoPath = `/api/platform/images/${image.id}/${variant}`;
    assert.equal((await req(photoPath)).status, 404);
    const allowed = await req(photoPath, owner.token);
    assert.equal(allowed.status, 200);
    assert.match(allowed.headers.get("cache-control")!, /no-store/);
    assert.ok((await allowed.arrayBuffer()).byteLength);
  }
  const current = (await readExchangeListing(db, owner.token, row.id, true))
    .listing;
  const published = await exchangeListingCommand(
    db,
    owner.token,
    input("status", {
      listingId: row.id,
      expectedVersion: current.version,
      state: "ACTIVE",
      itemPolicy: EXCHANGE_ITEM_POLICY,
      itemConfirmed: true
    })
  );
  for (const headers of [{}, { RSC: "1" }] as Record<string, string>[]) {
    const visible = await (await req(path, "", undefined, headers)).text();
    assert.ok(visible.includes(marker));
    for (const secret of [
      owner.email,
      owner.password,
      owner.token,
      stranger.email,
      "storagePrefix",
      "creatorId"
    ])
      assert.ok(!visible.includes(secret));
  }
  for (const variant of ["original", "large", "medium", "thumb"])
    assert.equal(
      (await req(`/api/platform/images/${image.id}/${variant}`)).status,
      200
    );
  const archived = await req(
    "/api/platform/exchange",
    owner.token,
    input("status", {
      listingId: row.id,
      expectedVersion: published.version,
      state: "ARCHIVED"
    }),
    { "x-expected-account": owner.id }
  );
  assert.ok([200, 202].includes(archived.status));
  for (const headers of [{}, { RSC: "1" }] as Record<string, string>[])
    assert.ok(
      !(await (await req(path, "", undefined, headers)).text()).includes(marker)
    );
  for (const variant of ["original", "large", "medium", "thumb"])
    assert.equal(
      (await req(`/api/platform/images/${image.id}/${variant}`)).status,
      404
    );
  assert.ok((await (await req(editor, owner.token)).text()).includes(marker));
});
