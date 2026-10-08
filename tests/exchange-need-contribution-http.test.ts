import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { sessionCookieFixtureName } from "../scripts/session-cookie-fixture.mjs";
import { assertPortalTestDatabase, createPortalActor } from "./seed-portal";
import { exchangeNeedCommand as command } from "../lib/platform/exchange-need-commands";
import { readExchangeNeeds as read } from "../lib/platform/exchange-need-reads";
import { exchangeListingCommand } from "../lib/platform/exchange-listings";
import { EXCHANGE_ITEM_POLICY } from "../lib/platform/exchange-options";
import { NEED_SCHEMA } from "../lib/platform/exchange-need-options";
import { privilegedAuthenticatorCommand } from "../lib/platform/privileged-auth";
import {
  openAuthenticator,
  authenticatorTotp
} from "../lib/platform/admin-authenticator-crypto";
import { loginAccount } from "../lib/platform/accounts";

const db = new PrismaClient(),
  origin = process.env.ACCOUNT_ORIGIN!;
assert.match(origin, /^https:\/\/127\.0\.0\.1:\d+$/);
before(async () => {
  await assertPortalTestDatabase(db);
  assert.equal(process.env.PRIVILEGED_MFA_MODE, "enforce");
});
after(async () => {
  await db.$disconnect();
});
const input = (operation: string, fields: Record<string, unknown>) => ({
  operation,
  mutationId: randomUUID(),
  ...fields
});
const req = (
  path: string,
  token = "",
  headers: Record<string, string> = {},
  body?: string
) =>
  fetch(origin + path, {
    redirect: "manual",
    method: body ? "POST" : "GET",
    headers: {
      cookie: `${sessionCookieFixtureName()}=${token}`,
      origin,
      ...(body ? { "content-type": "application/json" } : {}),
      ...headers
    },
    ...(body ? { body } : {})
  });
function privateResponse(response: Response) {
  for (const header of [
    "cache-control",
    "cdn-cache-control",
    "vercel-cdn-cache-control"
  ])
    assert.match(response.headers.get(header)!, /no-store/);
}
const post = (token: string, owner: string, body: string) =>
  req("/api/platform/exchange", token, { "x-expected-account": owner }, body);
const date = (days: number) =>
  new Date(Date.now() + days * 86400000).toISOString().slice(0, 16);

async function fixture() {
  const manager = await createPortalActor(db, "needhttpmanager"),
    owner = await createPortalActor(db, "needhttpowner"),
    other = await createPortalActor(db, "needhttpother"),
    ineligible = await createPortalActor(db, "needhttpminor", { adult: false });
  const note = "Private contribution " + randomUUID(),
    otherNote = "Other actor contribution " + randomUUID();
  const church = await db.church.create({
    data: {
      slug: "fixture-need-http-" + randomUUID(),
      name: "Fictional contribution HTTP church",
      summary: "Isolated contribution privacy acceptance",
      communityListed: true
    }
  });
  await db.socialPreferences.create({
    data: { ownerId: manager.id, contactRequests: "EVERYONE" }
  });
  await db.churchConnection.createMany({
    data: [manager, owner, other].map((actor) => ({
      userId: actor.id,
      churchId: church.id,
      state: "APPROVED"
    }))
  });
  await db.churchCapabilityGrant.createMany({
    data: (
      ["MANAGE_EXCHANGE_LISTINGS", "MODERATE_EXCHANGE_LISTINGS"] as const
    ).map((capability) => ({
      churchId: church.id,
      userId: manager.id,
      capability
    }))
  });
  const listing = await db.exchangeListing.create({
    data: {
      ownerChurchId: church.id,
      creatorId: manager.id,
      intent: "CHURCH_NEED",
      category: "HOUSEHOLD",
      audience: "CHURCH",
      audienceChurchId: church.id,
      title: "Private source " + randomUUID(),
      description: "Fictional contribution HTTP source",
      requestedItems: "Fictional supplies and equipment",
      country: "US",
      placeId: 4887398,
      placeLabel: "Chicago",
      itemPolicy: EXCHANGE_ITEM_POLICY
    }
  });
  // The owned fixture uses canonical commands with local seed-only MFA disabled.
  // The separate production server remains in enforce mode throughout.
  const prior = process.env.PRIVILEGED_MFA_MODE;
  process.env.PRIVILEGED_MFA_MODE = "off";
  try {
    const configured = await command(
      db,
      manager.token,
      input("configure", {
        listingId: listing.id,
        listingVersion: listing.version,
        expectedVersion: 0,
        deadlineLocal: date(3),
        timeZone: "UTC",
        acceptCoordinator: true
      })
    );
    const slots: Awaited<ReturnType<typeof command>>[] = [];
    for (const loan of [false, true])
      slots.push(
        await command(
          db,
          manager.token,
          input("slot", {
            needId: configured.id,
            slotId: randomUUID(),
            expectedVersion: 0,
            schema: NEED_SCHEMA,
            fields: {
              action: loan ? "DONATE" : "SELL",
              label: loan
                ? "Fictional loan equipment"
                : "Fictional private quote",
              unit: "items",
              target: 10,
              loan,
              returnLocal: loan ? date(7) : null,
              returnTimeZone: loan ? "UTC" : null,
              returnResponsibility: loan
                ? "Fictional coordinator returns equipment to its lender."
                : "",
              volunteerSlotId: null
            }
          })
        )
      );
    const ready = await db.exchangeListing.findUniqueOrThrow({
      where: { id: listing.id }
    });
    await exchangeListingCommand(
      db,
      manager.token,
      input("status", {
        listingId: listing.id,
        expectedVersion: ready.version,
        state: "ACTIVE",
        itemPolicy: EXCHANGE_ITEM_POLICY,
        itemConfirmed: true
      })
    );
    const need = await db.exchangeNeed.findUniqueOrThrow({
      where: { id: configured.id }
    });
    const claim = (
      actor: typeof owner,
      slot: (typeof slots)[number],
      loan: boolean,
      privateNote: string
    ) =>
      command(
        db,
        actor.token,
        input("claim", {
          needId: need.id,
          slotId: slot.id,
          slotVersion: slot.version,
          consentVersion: need.consentVersion,
          id: randomUUID(),
          expectedVersion: 0,
          quantity: 2,
          note: privateNote,
          price: loan ? null : "187.65",
          currency: loan ? null : "USD",
          shareName: false,
          loanAccepted: loan,
          waitlist: false
        })
      );
    const quote = await claim(owner, slots[0], false, note),
      loan = await claim(owner, slots[1], true, note + " loan"),
      foreign = await claim(other, slots[0], false, otherNote);
    return {
      owner,
      manager,
      other,
      ineligible,
      listing,
      need,
      quote,
      loan,
      foreign,
      note,
      otherNote
    };
  } finally {
    if (prior === undefined) delete process.env.PRIVILEGED_MFA_MODE;
    else process.env.PRIVILEGED_MFA_MODE = prior;
  }
}

test("My Needs bootstrap omits private rows while pinned reads, exact replay, redaction and current MFA/account gates remain canonical", async () => {
  const f = await fixture(),
    endpoint = "/api/platform/exchange?view=need-mine";
  for (const headers of [{}, { RSC: "1" }] as Record<string, string>[]) {
    for (const token of [f.owner.token, f.other.token, ""]) {
      const response = await req("/platform/exchange/needs", token, headers);
      assert.equal(response.status, 200);
      assert.match(response.headers.get("cache-control")!, /no-store/);
      const source = await response.text();
      for (const secret of [
        f.quote.id,
        f.loan.id,
        f.foreign.id,
        f.note,
        f.otherNote,
        f.listing.title
      ])
        assert.ok(!source.includes(secret));
      assert.doesNotMatch(
        source.replaceAll("\\", ""),
        /"(?:quoteMinor|disputeNote|loanResponsibility)"\s*:/
      );
    }
  }
  const pinned = async (token: string, id: string, suffix = "") =>
    req(endpoint + suffix, token, { "x-expected-account": id });
  const current = await pinned(f.owner.token, f.owner.id);
  assert.equal(current.status, 200);
  privateResponse(current);
  const incomingPath = `/api/platform/exchange?view=need-contributors&id=${f.need.id}`;
  const incomingDefault = await req(incomingPath, f.manager.token, {
    "x-expected-account": f.manager.id
  });
  assert.equal(incomingDefault.status, 404);
  privateResponse(incomingDefault);
  const unprovenIncoming = await incomingDefault.text();
  assert.ok(!unprovenIncoming.includes(f.quote.id));
  assert.ok(!unprovenIncoming.includes(f.note));
  const otherCoordinatorRead = await req(incomingPath, f.other.token, {
    "x-expected-account": f.other.id
  });
  assert.equal(otherCoordinatorRead.status, 404);
  privateResponse(otherCoordinatorRead);
  const deniedIncoming = await otherCoordinatorRead.text();
  assert.ok(!deniedIncoming.includes(f.quote.id));
  assert.ok(!deniedIncoming.includes(f.note));
  const canonical = await read(db, f.owner.token, { view: "mine" });
  const data = await current.json();
  assert.deepEqual(data, canonical);
  assert.ok("contributions" in canonical && canonical.contributions);
  assert.deepEqual(
    canonical.contributions.map((row) => row.id).sort(),
    [f.quote.id, f.loan.id].sort()
  );
  assert.ok(canonical.contributions.every((row) => row.own && row.current));
  const quote = canonical.contributions.find((row) => row.id === f.quote.id)!;
  assert.equal(quote.note, f.note);
  assert.equal(quote.quoteMinor, 18765);
  const anchor = canonical.contributions[0].id;
  const paged = await pinned(f.owner.token, f.owner.id, "&after=" + anchor);
  assert.equal(paged.status, 200);
  privateResponse(paged);
  const pagedCanonical = await read(db, f.owner.token, {
    view: "mine",
    after: anchor
  });
  assert.deepEqual(await paged.json(), pagedCanonical);
  assert.ok("contributions" in pagedCanonical && pagedCanonical.contributions);
  assert.equal(pagedCanonical.contributions.length, 1);
  assert.notEqual(pagedCanonical.contributions[0].id, anchor);
  for (const [token, pin, status] of [
    [f.owner.token, f.other.id, 401],
    [f.other.token, f.owner.id, 401],
    ["", f.owner.id, 401],
    [f.ineligible.token, f.ineligible.id, 404]
  ] as const) {
    const denied = await pinned(token, pin);
    assert.equal(denied.status, status);
    privateResponse(denied);
    const body = await denied.text();
    assert.ok(!body.includes(f.quote.id));
    assert.ok(!body.includes(f.note));
  }
  const other = await pinned(f.other.token, f.other.id);
  assert.equal(other.status, 200);
  privateResponse(other);
  const otherData = await other.json();
  assert.deepEqual(
    otherData.contributions.map((row: { id: string }) => row.id),
    [f.foreign.id]
  );
  assert.ok(!JSON.stringify(otherData).includes(f.note));
  let version = 1;
  let originalBody = "";
  for (const operation of ["attribution", "dispute"] as const) {
    const fields =
      operation === "attribution"
        ? { shareName: true }
        : { note: "Private disputed amount " + randomUUID() };
    const body = JSON.stringify(
      input("need-" + operation, {
        id: f.quote.id,
        expectedVersion: version,
        ...fields
      })
    );
    originalBody = body;
    const first = await post(f.owner.token, f.owner.id, body);
    assert.equal(first.status, 200);
    privateResponse(first);
    const saved = await first.json();
    assert.equal(saved.id, f.quote.id);
    assert.equal(saved.version, version + 1);
    const replay = await post(f.owner.token, f.owner.id, body);
    assert.equal(replay.status, 200);
    privateResponse(replay);
    assert.deepEqual(await replay.json(), saved);
    assert.equal(
      (
        await db.exchangeNeedContribution.findUniqueOrThrow({
          where: { id: f.quote.id }
        })
      ).version,
      ++version
    );
    const drift = await post(
      f.owner.token,
      f.owner.id,
      JSON.stringify({ ...JSON.parse(body), expectedVersion: version })
    );
    assert.equal(drift.status, 409);
    const foreign = await post(f.other.token, f.other.id, body);
    assert.equal(foreign.status, 404);
    privateResponse(foreign);
  }
  const ineligible = await post(
    f.ineligible.token,
    f.ineligible.id,
    originalBody
  );
  assert.equal(ineligible.status, 403);
  privateResponse(ineligible);
  // My Needs remains a personal surface. Both private coordinator reads and
  // mutations demand session-bound privileged proof in the enforce-mode server.
  const receiveBody = JSON.stringify(
    input("need-receive", {
      id: f.loan.id,
      expectedVersion: 1,
      quantity: 2,
      reason: ""
    })
  );
  const locked = await post(f.manager.token, f.manager.id, receiveBody);
  assert.equal(locked.status, 404);
  privateResponse(locked);
  assert.equal(
    (await locked.json()).message,
    "This need is unavailable to your current account or duties."
  );
  assert.equal(
    (
      await db.exchangeNeedContribution.findUniqueOrThrow({
        where: { id: f.loan.id }
      })
    ).received,
    0
  );
  await privilegedAuthenticatorCommand(
    db,
    f.manager.token,
    { operation: "mfa-start", requestKey: randomUUID(), expectedVersion: 0 },
    f.manager.password
  );
  const factor = await db.adminAuthenticator.findUniqueOrThrow({
    where: { userId: f.manager.id }
  });
  const secret = openAuthenticator(f.manager.id, factor.secretCiphertext),
    enrolledCounter = BigInt(Math.floor(Date.now() / 30000));
  const enrolled = await privilegedAuthenticatorCommand(
    db,
    f.manager.token,
    {
      operation: "mfa-confirm",
      requestKey: randomUUID(),
      expectedVersion: factor.version,
      code: authenticatorTotp(secret, enrolledCounter)
    },
    undefined
  );
  const currentCounter = BigInt(Math.floor(Date.now() / 30000));
  await privilegedAuthenticatorCommand(
    db,
    f.manager.token,
    {
      operation: "mfa-challenge",
      requestKey: randomUUID(),
      expectedVersion: Number(enrolled.version),
      purpose: "privileged-work",
      code: authenticatorTotp(
        secret,
        currentCounter > enrolledCounter
          ? currentCounter
          : enrolledCounter + BigInt(1)
      )
    },
    undefined
  );
  const namedIncoming = await req(incomingPath, f.manager.token, {
    "x-expected-account": f.manager.id
  });
  assert.equal(namedIncoming.status, 200);
  privateResponse(namedIncoming);
  const incomingData = await namedIncoming.json();
  assert.equal(incomingData.ownerId, f.manager.id);
  const namedRow = incomingData.contributions.find(
    (row: { id: string }) => row.id === f.quote.id
  );
  assert.ok(namedRow);
  assert.equal(namedRow.current, true);
  assert.equal(namedRow.own, false);
  assert.equal(namedRow.note, f.note);
  assert.equal(namedRow.contributor?.name, f.owner.name);
  const anonymousRow = incomingData.contributions.find(
    (row: { id: string }) => row.id === f.foreign.id
  );
  assert.ok(anonymousRow);
  assert.equal(anonymousRow.note, f.otherNote);
  assert.equal(anonymousRow.contributor, null);
  const received = await post(f.manager.token, f.manager.id, receiveBody);
  assert.equal(received.status, 200);
  privateResponse(received);
  const receivedReceipt = await received.json();
  assert.equal(receivedReceipt.version, 2);
  const secondToken = await loginAccount(
    db,
    f.manager.email,
    f.manager.password,
    "Fictional second Needs coordinator browser"
  );
  const unprovenRead = await req(incomingPath, secondToken, {
    "x-expected-account": f.manager.id
  });
  assert.equal(unprovenRead.status, 404);
  privateResponse(unprovenRead);
  const unprovenBody = await unprovenRead.text();
  assert.ok(!unprovenBody.includes(f.quote.id));
  assert.ok(!unprovenBody.includes(f.note));
  const unprovenReplay = await post(secondToken, f.manager.id, receiveBody);
  assert.equal(unprovenReplay.status, 404);
  privateResponse(unprovenReplay);
  assert.equal(
    (await unprovenReplay.json()).message,
    "This need is unavailable to your current account or duties."
  );

  // Withdraw only this owned fictional source. A private read must redact its
  // content while preserving personal counts and outstanding equipment debt.
  const listing = await db.exchangeListing.findUniqueOrThrow({
    where: { id: f.listing.id }
  });
  await exchangeListingCommand(
    db,
    f.manager.token,
    input("status", {
      listingId: listing.id,
      expectedVersion: listing.version,
      state: "ARCHIVED"
    })
  );
  const redacted = await pinned(f.owner.token, f.owner.id);
  assert.equal(redacted.status, 200);
  privateResponse(redacted);
  const redactedCanonical = await read(db, f.owner.token, { view: "mine" });
  assert.deepEqual(await redacted.json(), redactedCanonical);
  assert.ok(
    "contributions" in redactedCanonical && redactedCanonical.contributions
  );
  assert.equal(redactedCanonical.contributions.length, 2);
  for (const row of redactedCanonical.contributions) {
    assert.equal(row.current, false);
    assert.equal(row.own, true);
    assert.equal(row.listingId, null);
    assert.equal(row.note, "");
    assert.equal(row.quoteMinor, null);
    assert.equal(row.disputeNote, "");
  }
  const retainedLoan = redactedCanonical.contributions.find(
    (row) => row.id === f.loan.id
  )!;
  assert.equal(retainedLoan.received, 2);
  assert.equal(retainedLoan.returned, 0);
  assert.ok(retainedLoan.loanReturnAt);
  // Historical own replay remains an immutable receipt, not authority to expose
  // revoked source details or apply the original private action again.
  const replay = await post(f.owner.token, f.owner.id, originalBody);
  assert.equal(replay.status, 200);
  privateResponse(replay);
  assert.equal((await replay.json()).version, version);
  const fresh = await post(
    f.owner.token,
    f.owner.id,
    JSON.stringify(
      input("need-dispute", {
        id: f.quote.id,
        expectedVersion: (
          await db.exchangeNeedContribution.findUniqueOrThrow({
            where: { id: f.quote.id }
          })
        ).version,
        note: "Unavailable new dispute"
      })
    )
  );
  assert.equal(fresh.status, 404);
  const returnBody = JSON.stringify(
    input("need-confirm-return", {
      id: retainedLoan.id,
      expectedVersion: retainedLoan.version,
      quantity: 2
    })
  );
  const returned = await post(f.owner.token, f.owner.id, returnBody);
  assert.equal(returned.status, 200);
  privateResponse(returned);
  const returnedReceipt = await returned.json();
  assert.equal(returnedReceipt.id, retainedLoan.id);
  assert.equal(returnedReceipt.version, retainedLoan.version + 1);
  const returnedAgain = await post(f.owner.token, f.owner.id, returnBody);
  assert.equal(returnedAgain.status, 200);
  assert.deepEqual(await returnedAgain.json(), returnedReceipt);
  const loanAfter = await db.exchangeNeedContribution.findUniqueOrThrow({
    where: { id: retainedLoan.id }
  });
  assert.equal(loanAfter.received, 2);
  assert.equal(loanAfter.returned, 2);
  await db.platformUser.update({
    where: { id: f.owner.id },
    data: { suspendedAt: new Date() }
  });
  for (const result of [
    await pinned(f.owner.token, f.owner.id),
    await post(f.owner.token, f.owner.id, originalBody)
  ]) {
    assert.equal(result.status, 401);
    privateResponse(result);
    const body = await result.text();
    assert.ok(!body.includes(f.quote.id));
    assert.ok(!body.includes(f.note));
  }
});
