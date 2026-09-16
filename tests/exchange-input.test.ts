import test from "node:test";
import assert from "node:assert/strict";
import {
  EXCHANGE_EDITOR_SCHEMA,
  changeExchangeIntent,
  exchangeDisplayPrice,
  emptyExchangeFields,
  exchangeCurrencies,
  exchangePriceText
} from "../lib/platform/exchange-options";
import {
  exchangePriceMinor,
  parseExchangeFields,
  exchangeEditorFields,
  parseExchangeListQuery
} from "../lib/platform/exchange-input";

test("listing search and filter inputs are bounded, singular and distinguish owned status from public discovery", () => {
  const query = parseExchangeListQuery(
    {
      intent: "SERVICE",
      category: "HOME_GARDEN",
      q: "  garden help  ",
      country: "US",
      placeId: "4887398",
      state: "ARCHIVED"
    },
    true
  );
  assert.equal(query.q, "garden help");
  assert.equal(query.placeId, 4887398);
  assert.equal(query.state, "ARCHIVED");
  assert.deepEqual(
    parseExchangeListQuery({
      q: "",
      country: "",
      placeId: "",
      intent: "",
      category: ""
    }),
    parseExchangeListQuery({})
  );
  for (const value of [
    { q: "a" },
    { q: "x".repeat(121) },
    { q: ["one", "two"] },
    { category: "constructor" },
    { intent: "WRONG" },
    { country: "US", placeId: "1e3" },
    { placeId: "4887398" },
    { state: "DRAFT" },
    { ownerId: "other" }
  ])
    assert.throws(() => parseExchangeListQuery(value));
  assert.throws(() => parseExchangeListQuery({ state: "WRONG" }, true));
});

test("listing prices preserve exact zero, two and three-digit currency precision without floating-point rounding", () => {
  for (const [currency, typed, expected] of [
    ["USD", "0.29", 29],
    ["USD", "1.2", 120],
    ["JPY", "299", 299],
    ["KWD", "1.001", 1001],
    ["KWD", "0.009", 9],
    ["USD", "999999.99", 99999999]
  ] as const) {
    assert.equal(exchangePriceMinor(typed, currency), expected);
    assert.equal(
      exchangePriceMinor(exchangePriceText(expected, currency), currency),
      expected
    );
  }
  for (const [typed, currency] of [
    ["1.001", "USD"],
    ["12.0", "JPY"],
    ["1.0001", "KWD"],
    ["0", "USD"],
    ["-2", "USD"],
    ["1e3", "USD"],
    ["NaN", "USD"],
    ["$1", "USD"],
    ["1,000", "USD"],
    ["+1", "USD"],
    ["01", "USD"],
    ["1.", "USD"],
    [".5", "USD"],
    ["1000000", "USD"],
    ["1", "usd"],
    ["1", "constructor"],
    [1.01, "USD"]
  ])
    assert.throws(() => exchangePriceMinor(typed, currency));
  for (const [currency, { digits }] of Object.entries(exchangeCurrencies))
    assert.equal(
      new Intl.NumberFormat("en", {
        style: "currency",
        currency
      }).resolvedOptions().maximumFractionDigits,
      digits
    );
});

test("private incomplete drafts round trip while publication enforces item, currency, locality and audience fields", () => {
  const draft = parseExchangeFields(
    EXCHANGE_EDITOR_SCHEMA,
    emptyExchangeFields()
  );
  assert.deepEqual(exchangeEditorFields(draft), emptyExchangeFields());
  assert.throws(() =>
    parseExchangeFields(EXCHANGE_EDITOR_SCHEMA, emptyExchangeFields(), true)
  );
  const ready = {
    ...emptyExchangeFields(),
    title: "Fictional dining table",
    description: "Fictional item.\r\nMinor scratches.",
    category: "FURNITURE",
    condition: "GOOD",
    country: "US",
    placeId: 12345
  };
  const free = parseExchangeFields(EXCHANGE_EDITOR_SCHEMA, ready, true);
  assert.equal(free.description, "Fictional item.\nMinor scratches.");
  assert.equal(free.priceMinor, null);
  assert.equal(free.currency, null);
  const sale = { ...ready, intent: "SALE", price: "12.34", currency: "USD" };
  assert.deepEqual(
    exchangeEditorFields(
      parseExchangeFields(EXCHANGE_EDITOR_SCHEMA, sale, true)
    ),
    { ...sale, description: free.description }
  );
  for (const change of [
    { currency: "USD" },
    { price: "3" },
    { intent: "SERVICE" },
    { category: "INVESTMENTS" },
    { condition: "" },
    { audience: "CHILDREN" },
    { audienceChurchId: "hidden-church" },
    { audience: "CHURCH" },
    { country: "" },
    { country: "us" },
    { placeId: null },
    { placeId: "12345" },
    { placeId: 0 },
    { placeId: 1.5 },
    { placeId: 100000001 },
    { ownerId: "forged-owner" }
  ])
    assert.throws(() =>
      parseExchangeFields(EXCHANGE_EDITOR_SCHEMA, { ...ready, ...change }, true)
    );
  assert.throws(() =>
    parseExchangeFields(EXCHANGE_EDITOR_SCHEMA, { ...sale, currency: "" }, true)
  );
  assert.throws(() =>
    parseExchangeFields(EXCHANGE_EDITOR_SCHEMA, { ...sale, price: "" }, true)
  );
  assert.equal(
    parseExchangeFields(EXCHANGE_EDITOR_SCHEMA, { ...sale, price: "" })
      .priceMinor,
    null
  );
});

test("listing forms reject stale schemas, omitted fields, forged scope and oversized content without truncation", () => {
  const value = emptyExchangeFields();
  assert.throws(() => parseExchangeFields(0, value));
  assert.throws(() => parseExchangeFields(1, value));
  assert.throws(() => parseExchangeFields(EXCHANGE_EDITOR_SCHEMA, []));
  assert.throws(() =>
    parseExchangeFields(EXCHANGE_EDITOR_SCHEMA, {
      ...value,
      businessId: "forged-organization"
    })
  );
  assert.throws(() =>
    parseExchangeFields(EXCHANGE_EDITOR_SCHEMA, { ...value, priceMinor: 1 })
  );
  for (const key of Object.keys(value)) {
    const incomplete: Record<string, unknown> = { ...value };
    delete incomplete[key];
    assert.throws(() =>
      parseExchangeFields(EXCHANGE_EDITOR_SCHEMA, incomplete)
    );
  }
  assert.throws(() =>
    parseExchangeFields(EXCHANGE_EDITOR_SCHEMA, {
      ...value,
      title: "a".repeat(121)
    })
  );
  assert.throws(() =>
    parseExchangeFields(EXCHANGE_EDITOR_SCHEMA, {
      ...value,
      description: "a".repeat(5001)
    })
  );
});

test("requests require requested items, preserve calendar dates and reject stale money or service details", () => {
  const fields = {
    ...emptyExchangeFields(),
    intent: "WANTED" as const,
    title: "Fictional books wanted",
    description: "For a fictional reading group.",
    category: "BOOKS" as const,
    country: "US",
    placeId: 12345,
    requestedItems: "Two ordinary books",
    neededBy: "2028-02-29"
  };
  for (const intent of ["WANTED", "CHURCH_NEED"] as const) {
    const request = parseExchangeFields(
      EXCHANGE_EDITOR_SCHEMA,
      { ...fields, intent },
      true
    );
    assert.equal(request.neededBy, "2028-02-29");
    assert.equal(request.condition, null);
    assert.deepEqual(exchangeEditorFields(request), { ...fields, intent });
  }
  for (const delta of [
    { requestedItems: "" },
    { neededBy: "2027-02-29" },
    { neededBy: "1999-01-01" },
    { neededBy: "2100-01-01" },
    { neededBy: "2026-02-30" },
    { neededBy: "2026-01-01T00:00" },
    { price: "1", currency: "USD" },
    { serviceArea: "A previous service" },
    { servicePricing: "FREE" },
    { requestedItems: "x".repeat(2001) }
  ])
    assert.throws(() =>
      parseExchangeFields(EXCHANGE_EDITOR_SCHEMA, { ...fields, ...delta }, true)
    );
});

test("services state free help or an exact paid rate and reject hidden item and request fields", () => {
  const fields = {
    ...emptyExchangeFields(),
    intent: "SERVICE" as const,
    title: "Fictional garden help",
    description: "Ordinary fictional garden work.",
    category: "HOME_GARDEN" as const,
    country: "US",
    placeId: 12345,
    serviceArea: "Chicago area",
    availability: "Saturday afternoons by agreement",
    qualifications: "Self-taught amateur, no professional qualifications",
    servicePricing: "FREE" as const
  };
  assert.deepEqual(
    exchangeEditorFields(
      parseExchangeFields(EXCHANGE_EDITOR_SCHEMA, fields, true)
    ),
    fields
  );
  assert.equal(
    exchangeDisplayPrice(
      parseExchangeFields(EXCHANGE_EDITOR_SCHEMA, fields, true)
    ),
    "Free"
  );
  const paid = {
    ...fields,
    servicePricing: "FIXED",
    serviceUnit: "HOUR",
    currency: "KWD",
    price: "1.001"
  };
  const value = parseExchangeFields(EXCHANGE_EDITOR_SCHEMA, paid, true);
  assert.equal(value.priceMinor, 1001);
  assert.equal(exchangeDisplayPrice(value), "KWD 1.001 per hour");
  assert.deepEqual(exchangeEditorFields(value), paid);
  for (const delta of [
    { serviceArea: "" },
    { availability: "" },
    { qualifications: "" },
    { servicePricing: "" },
    { servicePricing: "FIXED" },
    { category: "FURNITURE" },
    { condition: "GOOD" },
    { requestedItems: "Old request" },
    { neededBy: "2026-12-12" },
    { currency: "USD", price: "1" },
    { serviceUnit: "TASK" },
    { serviceArea: "x".repeat(501) },
    { availability: "x".repeat(1001) },
    { qualifications: "x".repeat(2001) }
  ])
    assert.throws(() =>
      parseExchangeFields(EXCHANGE_EDITOR_SCHEMA, { ...fields, ...delta }, true)
    );
  for (const delta of [
    { serviceUnit: "" },
    { serviceUnit: "DAY" },
    { currency: "" },
    { price: "1.0001" }
  ])
    assert.throws(() =>
      parseExchangeFields(EXCHANGE_EDITOR_SCHEMA, { ...paid, ...delta }, true)
    );
});

test("changing listing type clears every type-specific field while retaining common content, area and audience", () => {
  const fields = {
    ...emptyExchangeFields(),
    intent: "SERVICE" as const,
    title: "Retained title",
    description: "Retained description",
    country: "US",
    placeId: 12345,
    audience: "CHURCH" as const,
    audienceChurchId: "fixture-church",
    category: "HOME_GARDEN" as const,
    condition: "GOOD" as const,
    currency: "USD" as const,
    price: "25",
    requestedItems: "Old request",
    neededBy: "2028-02-29",
    serviceArea: "Old area",
    availability: "Old availability",
    qualifications: "Old qualifications",
    servicePricing: "FIXED" as const,
    serviceUnit: "HOUR" as const
  };
  for (const intent of ["FREE", "SALE", "WANTED", "CHURCH_NEED"] as const) {
    const changed = changeExchangeIntent(fields, intent);
    assert.deepEqual(changed, {
      ...emptyExchangeFields(),
      intent,
      title: fields.title,
      description: fields.description,
      country: fields.country,
      placeId: fields.placeId,
      audience: fields.audience,
      audienceChurchId: fields.audienceChurchId
    });
    assert.doesNotThrow(() =>
      parseExchangeFields(EXCHANGE_EDITOR_SCHEMA, changed)
    );
  }
  assert.equal(changeExchangeIntent(fields, "SERVICE"), fields);
});
