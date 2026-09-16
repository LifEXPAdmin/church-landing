import test from "node:test";
import assert from "node:assert/strict";
import { emptyExchangeFields, exchangeCurrencies, exchangePriceText } from "../lib/platform/exchange-options";
import { exchangePriceMinor, parseExchangeFields, exchangeEditorFields } from "../lib/platform/exchange-input";

test("listing prices preserve exact zero, two and three-digit currency precision without floating-point rounding", () => {
  for (const [currency, typed, expected] of [["USD", "0.29", 29], ["USD", "1.2", 120],
    ["JPY", "299", 299], ["KWD", "1.001", 1001], ["KWD", "0.009", 9],
    ["USD", "999999.99", 99999999]] as const) {
    assert.equal(exchangePriceMinor(typed, currency), expected);
    assert.equal(exchangePriceMinor(exchangePriceText(expected, currency), currency), expected);
  }
  for (const [typed, currency] of [["1.001", "USD"], ["12.0", "JPY"], ["1.0001", "KWD"],
    ["0", "USD"], ["-2", "USD"], ["1e3", "USD"], ["NaN", "USD"], ["$1", "USD"],
    ["1,000", "USD"], ["+1", "USD"], ["01", "USD"], ["1.", "USD"], [".5", "USD"],
    ["1000000", "USD"], ["1", "usd"], ["1", "constructor"], [1.01, "USD"]])
    assert.throws(() => exchangePriceMinor(typed, currency));
  for (const [currency, { digits }] of Object.entries(exchangeCurrencies))
    assert.equal(new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits, digits);
});

test("private incomplete drafts round trip while publication enforces item, currency, locality and audience fields", () => {
  const draft = parseExchangeFields(1, emptyExchangeFields());
  assert.deepEqual(exchangeEditorFields(draft), emptyExchangeFields());
  assert.throws(() => parseExchangeFields(1, emptyExchangeFields(), true));
  const ready = { ...emptyExchangeFields(), title: "Fictional dining table", description: "Fictional item.\r\nMinor scratches.",
    category: "FURNITURE", condition: "GOOD", country: "US", placeId: 12345 };
  const free = parseExchangeFields(1, ready, true);
  assert.equal(free.description, "Fictional item.\nMinor scratches.");
  assert.equal(free.priceMinor, null);
  assert.equal(free.currency, null);
  const sale = { ...ready, intent: "SALE", price: "12.34", currency: "USD" };
  assert.deepEqual(exchangeEditorFields(parseExchangeFields(1, sale, true)), { ...sale, description: free.description });
  for (const change of [{ currency: "USD" }, { price: "3" }, { intent: "SERVICE" }, { category: "INVESTMENTS" },
    { condition: "" }, { audience: "CHILDREN" }, { audienceChurchId: "hidden-church" },
    { audience: "CHURCH" }, { country: "" }, { country: "us" }, { placeId: null },
    { placeId: "12345" }, { placeId: 0 }, { placeId: 1.5 }, { placeId: 100000001 }, { ownerId: "forged-owner" }])
    assert.throws(() => parseExchangeFields(1, { ...ready, ...change }, true));
  assert.throws(() => parseExchangeFields(1, { ...sale, currency: "" }, true));
  assert.throws(() => parseExchangeFields(1, { ...sale, price: "" }, true));
  assert.equal(parseExchangeFields(1, { ...sale, price: "" }).priceMinor, null);
});

test("listing forms reject stale schemas, omitted fields, forged scope and oversized content without truncation", () => {
  const value = emptyExchangeFields();
  assert.throws(() => parseExchangeFields(0, value));
  assert.throws(() => parseExchangeFields(2, value));
  assert.throws(() => parseExchangeFields(1, []));
  assert.throws(() => parseExchangeFields(1, { ...value, businessId: "forged-organization" }));
  assert.throws(() => parseExchangeFields(1, { ...value, priceMinor: 1 }));
  for (const key of Object.keys(value)) {
    const incomplete: Record<string, unknown> = { ...value };
    delete incomplete[key];
    assert.throws(() => parseExchangeFields(1, incomplete));
  }
  assert.throws(() => parseExchangeFields(1, { ...value, title: "a".repeat(121) }));
  assert.throws(() => parseExchangeFields(1, { ...value, description: "a".repeat(5001) }));
});
