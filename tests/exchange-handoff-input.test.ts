import test from "node:test";
import assert from "node:assert/strict";
import { emptyExchangeDefaults } from "../lib/platform/exchange-handoff-options";
import {
  exchangeDefaultDraftFields,
  parseExchangeCancellation,
  parseExchangeDefaults,
  parseExchangeHandoffPlan
} from "../lib/platform/exchange-handoff-input";

const now = new Date("2026-09-16T12:00:00Z");
const plan = {
  startLocal: "2026-09-17T10:00",
  endLocal: "2026-09-17T11:00",
  timeZone: "America/Chicago",
  pickupDetails: "  Fictional entrance.\r\nWait outside.  "
};

test("pickup plans preserve explicit local zone and exact instants while bounding future windows", () => {
  const parsed = parseExchangeHandoffPlan(1, plan, now);
  assert.equal(parsed.startAt.toISOString(), "2026-09-17T15:00:00.000Z");
  assert.equal(parsed.endAt.toISOString(), "2026-09-17T16:00:00.000Z");
  assert.equal(parsed.pickupDetails, "Fictional entrance.\nWait outside.");
  for (const change of [
    { endLocal: plan.startLocal },
    { endLocal: "2026-09-18T10:01" },
    { startLocal: "2026-09-15T10:00", endLocal: "2026-09-15T11:00" },
    { startLocal: "2026-10-17T10:00", endLocal: "2026-10-17T11:00" },
    { timeZone: "+03:00" },
    { startLocal: "2026-09-17T10:00Z" },
    { pickupDetails: "x".repeat(2001) },
    { recipientId: "forged" },
    { allDay: true },
    { weeklyUntil: "2026-12-31" }
  ])
    assert.throws(() =>
      parseExchangeHandoffPlan(1, { ...plan, ...change }, now)
    );
  assert.throws(() => parseExchangeHandoffPlan(0, plan, now));
  assert.throws(() =>
    parseExchangeHandoffPlan(1, { ...plan, pickupDetails: undefined }, now)
  );
  assert.throws(() => parseExchangeHandoffPlan(1, [], now));
});

test("pickup agreement refuses skipped and repeated daylight-saving times without silently moving them", () => {
  for (const [startLocal, endLocal, clock] of [
    ["2026-11-01T01:15", "2026-11-01T02:30", "2026-10-20T12:00Z"],
    ["2026-03-08T02:15", "2026-03-08T03:30", "2026-03-01T12:00Z"]
  ])
    assert.throws(
      () =>
        parseExchangeHandoffPlan(
          1,
          { ...plan, startLocal, endLocal },
          new Date(clock)
        ),
      /skipped or repeated/
    );
  const safe = parseExchangeHandoffPlan(
    1,
    { ...plan, startLocal: "2026-11-01T02:15", endLocal: "2026-11-01T03:15" },
    new Date("2026-10-20T12:00Z")
  );
  assert.equal(safe.startAt.toISOString(), "2026-11-01T08:15:00.000Z");
});

test("private defaults seed only a new listing projection and cannot widen an unavailable church audience", () => {
  const value = parseExchangeDefaults(1, {
    ...emptyExchangeDefaults(),
    intent: "SALE",
    audience: "CHURCH",
    audienceChurchId: "fictional-church",
    country: "US",
    placeId: 4887398,
    pickupDetails: "Fictional private instructions"
  });
  const draft = exchangeDefaultDraftFields(value, ["fictional-church"]);
  assert.equal(draft.intent, "SALE");
  assert.equal(draft.audience, "CHURCH");
  assert.equal(draft.price, "");
  assert.equal(draft.description, "");
  assert.equal(draft.title, "");
  assert.equal(Object.hasOwn(draft, "pickupDetails"), false);
  assert.equal(Object.hasOwn(draft, "inquiriesEnabled"), false);
  assert.doesNotMatch(JSON.stringify(draft), /private instructions/);
  assert.throws(
    () => exchangeDefaultDraftFields(value, []),
    /audience is unavailable/
  );
  assert.equal(value.pickupDetails, "Fictional private instructions");
});

test("default forms reject organization identity, forged fields, incomplete schemas and unbounded private text", () => {
  const value = emptyExchangeDefaults();
  assert.deepEqual(parseExchangeDefaults(1, value), value);
  for (const change of [
    { intent: "CHURCH_NEED" },
    { audience: "EVERYONE" },
    { audience: "CHURCH" },
    { audienceChurchId: "other" },
    { country: "us" },
    { placeId: 4887398 },
    { country: "US", placeId: "4887398" },
    { pickupDetails: "x".repeat(2001) },
    { ownerId: "forged" },
    { inquiriesEnabled: true },
    { pickupDetails: undefined }
  ])
    assert.throws(() => parseExchangeDefaults(1, { ...value, ...change }));
  assert.throws(() => parseExchangeDefaults(0, value));
  assert.throws(() => parseExchangeDefaults(1, {}));
  assert.throws(() => parseExchangeDefaults(1, []));
});

test("cancellation accepts bounded private explanations and rejects inherited reason names", () => {
  assert.deepEqual(
    parseExchangeCancellation("NO_SHOW", "  Fictional reason.  "),
    { reason: "NO_SHOW", note: "Fictional reason." }
  );
  assert.throws(() => parseExchangeCancellation("constructor", ""));
  assert.throws(() => parseExchangeCancellation("OTHER", "x".repeat(501)));
  assert.throws(() => parseExchangeCancellation("OTHER", null));
});
