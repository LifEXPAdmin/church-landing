import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { assertPortalTestDatabase, createPortalActor } from "./seed-portal";
import { EXCHANGE_ITEM_POLICY } from "../lib/platform/exchange-options";
const db = new PrismaClient();
before(() => assertPortalTestDatabase(db));
after(() => db.$disconnect());
const origin = process.env.ACCOUNT_ORIGIN!;
const call = (
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
      origin,
      ...(body ? { "content-type": "application/json" } : {}),
      ...headers
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
const input = (operation: string, v: Record<string, unknown>) => ({
  operation: "help-" + operation,
  mutationId: randomUUID(),
  ...v
});
test("built HTTPS ministry flow pins accounts, rejects cross-site writes, conceals private HTML/RSC and denies guessed pairs", async () => {
  const manager = await createPortalActor(db, "helphttpmgr"),
    responder = await createPortalActor(db, "helphttpr"),
    outsider = await createPortalActor(db, "helphttpno");
  const church = await db.church.create({
    data: {
      slug: "httphelp-" + randomUUID(),
      summary: "Fictional isolated HTTP acceptance",
      name: "Fictional HTTP church",
      communityListed: true
    }
  });
  await db.churchConnection.create({
    data: { userId: manager.id, churchId: church.id, state: "APPROVED" }
  });
  await db.churchCapabilityGrant.createMany({
    data: ["MANAGE_EXCHANGE_LISTINGS", "MODERATE_EXCHANGE_LISTINGS"].map(
      (capability) => ({
        userId: manager.id,
        churchId: church.id,
        capability: capability as
          | "MANAGE_EXCHANGE_LISTINGS"
          | "MODERATE_EXCHANGE_LISTINGS"
      })
    )
  });
  await db.socialPreferences.create({
    data: { ownerId: manager.id, contactRequests: "EVERYONE" }
  });
  const terms = {
    duties: "Adult-only public microphone setup",
    dutyClass: "ADULT_LOGISTICS",
    equipmentMode: "NONE",
    startLocal: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 16),
    endLocal: new Date(Date.now() + 4 * 86400000).toISOString().slice(0, 16),
    timeZone: "UTC",
    compensation: "VOLUNTARY",
    price: "",
    currency: "",
    rateUnit: "",
    reimbursement: "None"
  };
  const create = input("create", {
    expectedVersion: 0,
    ownerChurchId: church.id,
    schema: 1,
    fields: {
      title: "Fictional HTTP help request",
      category: "AV",
      terms,
      country: "US",
      placeId: 4887398,
      audience: "PUBLIC",
      acceptCoordinator: true,
      coordinatorDisplay: "Consenting fictional coordinator"
    }
  });
  assert.equal(
    (await call("/api/platform/exchange", manager.token, create)).status,
    401
  );
  assert.equal(
    (
      await call("/api/platform/exchange", manager.token, create, {
        "x-expected-account": outsider.id
      })
    ).status,
    401
  );
  assert.equal(
    (
      await call("/api/platform/exchange", manager.token, create, {
        "x-expected-account": manager.id,
        origin: "https://other.invalid"
      })
    ).status,
    403
  );
  const made = await call("/api/platform/exchange", manager.token, create, {
    "x-expected-account": manager.id
  });
  assert.ok([200, 202].includes(made.status));
  const request = await made.json();
  const published = await call(
    "/api/platform/exchange",
    manager.token,
    input("publish", {
      requestId: request.id,
      expectedVersion: request.version,
      itemPolicy: EXCHANGE_ITEM_POLICY,
      itemConfirmed: true
    }),
    { "x-expected-account": manager.id }
  );
  assert.ok([200, 202].includes(published.status));
  const secret = "private-help-" + randomUUID();
  const offer = input("offer", {
    requestId: request.id,
    expectedVersion: 1,
    kind: "PERSONAL",
    respondingChurchId: null,
    schema: 1,
    terms: { ...terms, duties: secret },
    acceptResponsibility: true,
    externalNotices: false
  });
  const saved = await call("/api/platform/exchange", responder.token, offer, {
    "x-expected-account": responder.id
  });
  assert.ok([200, 202].includes(saved.status));
  const receipt = await saved.json();
  const api = await call(
    `/api/platform/exchange?view=help-offer&id=${receipt.id}`,
    responder.token,
    undefined,
    { "x-expected-account": responder.id }
  );
  assert.equal(api.status, 200);
  assert.match(api.headers.get("cache-control") ?? "", /no-store/);
  assert.ok((await api.text()).includes(secret));
  assert.equal(
    (
      await call(
        `/api/platform/exchange?view=help-offer&id=${receipt.id}`,
        outsider.token,
        undefined,
        { "x-expected-account": outsider.id }
      )
    ).status,
    404
  );
  for (const headers of [{}, { RSC: "1" }] as Record<string, string>[]) {
    const response = await call(
      `/platform/exchange/help/offers?id=${receipt.id}`,
      responder.token,
      undefined,
      headers
    );
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.ok(!html.includes(secret));
    assert.ok(!html.includes(responder.email));
  }
  const publicPage = await call(
    `/api/platform/exchange?view=help-request&id=${request.id}`
  );
  assert.equal(publicPage.status, 200);
  assert.ok(!(await publicPage.text()).includes(secret));
  const select = await call(
    "/api/platform/exchange",
    manager.token,
    input("select", {
      offerId: receipt.id,
      expectedVersion: receipt.version,
      requestTermsVersion: 1,
      acceptTerms: true,
      externalNotices: false
    }),
    { "x-expected-account": manager.id }
  );
  assert.ok(select.ok);
  const agreement = await db.interchurchHelpAgreement.findUniqueOrThrow({
    where: { offerId: receipt.id }
  });
  const acknowledge = await call(
    "/api/platform/exchange",
    responder.token,
    input("acknowledge", {
      offerId: receipt.id,
      expectedVersion: agreement.version,
      requestTermsVersion: 1,
      termsVersion: agreement.termsVersion,
      acceptTerms: true,
      externalNotices: false
    }),
    { "x-expected-account": responder.id }
  );
  assert.ok(acknowledge.ok);
  let row = await db.interchurchHelpRequest.findUniqueOrThrow({
    where: { id: request.id }
  });
  const canceled = await call(
    "/api/platform/exchange",
    manager.token,
    input("close", {
      requestId: request.id,
      expectedVersion: row.version,
      outcome: "CANCELED",
      reason: "Fictional requesting church canceled this work"
    }),
    { "x-expected-account": manager.id }
  );
  assert.ok(canceled.ok);
  assert.equal(
    (
      await db.interchurchHelpAgreement.findUniqueOrThrow({
        where: { offerId: receipt.id }
      })
    ).state,
    "CANCELED"
  );
  row = await db.interchurchHelpRequest.findUniqueOrThrow({
    where: { id: request.id }
  });
  const relabel = await call(
    "/api/platform/exchange",
    manager.token,
    input("close", {
      requestId: request.id,
      expectedVersion: row.version,
      outcome: "CLOSED",
      reason: "Cancellation cannot be relabeled into new acceptance"
    }),
    { "x-expected-account": manager.id }
  );
  assert.equal(relabel.status, 409);
});
