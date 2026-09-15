import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  defaultDiscoveryPreferences,
  parseDiscoveryPreferences,
  parseDiscoveryFilters,
  guestDiscoveryPreferences,
  denominationKey
} from "../lib/platform/discovery-options";
import {
  getDiscoveryPlace,
  searchDiscoveryPlaces,
  townDistanceKm
} from "../lib/platform/discovery-places";
import { postDiscoveryData } from "../lib/platform/post-discovery";
import { PortalError } from "../lib/platform/portal-policy";

test("catalog provenance matches generated public files and search exposes labels only", async () => {
  const manifest = JSON.parse(
    readFileSync("data/discovery/manifest.json", "utf8")
  );
  assert.ok(manifest.places > 40000 && manifest.countries > 180);
  for (const [name, expected] of Object.entries(manifest.outputs) as [
    string,
    { bytes: number; sha256: string }
  ][]) {
    const data = readFileSync("data/discovery/" + name);
    assert.equal(data.length, expected.bytes);
    assert.equal(
      createHash("sha256").update(data).digest("hex"),
      expected.sha256
    );
  }
  const result = await searchDiscoveryPlaces("US", "Chicago");
  const city = result.places.find((place) =>
    place.label.startsWith("Chicago,")
  );
  assert.ok(city);
  assert.deepEqual(Object.keys(city).sort(), ["country", "id", "label"]);
  assert.ok(result.places.length <= 20);
  const p = await getDiscoveryPlace("US", city.id);
  assert.ok(p);
  assert.equal(townDistanceKm(p, p), 0);
  await assert.rejects(getDiscoveryPlace("CA", city.id), PortalError);
  await assert.rejects(searchDiscoveryPlaces("US", "  "), PortalError);
  await assert.rejects(
    searchDiscoveryPlaces("../../etc", "Chicago"),
    PortalError
  );
});
test("classification requires deliberate coarse-location consent and never infers unknown language or denomination", async () => {
  const blank = await postDiscoveryData({});
  assert.ok(Object.values(blank).every((value) => value === null));
  assert.equal(
    (await postDiscoveryData({ denomination: "   " })).discoveryDenomination,
    null
  );
  await assert.rejects(
    postDiscoveryData({ country: "US", shareLocality: false }),
    PortalError
  );
  await assert.rejects(
    postDiscoveryData({ language: "xx", shareLocality: false }),
    PortalError
  );
  const country = await postDiscoveryData({
    country: "US",
    shareLocality: true,
    denomination: "Non Denominational",
    language: "en"
  });
  assert.equal(country.discoveryCountry, "US");
  assert.equal(country.discoveryPlaceId, null);
  assert.equal(country.discoveryDenomination, "non-denominational");
  assert.notEqual(denominationKey("Anglican"), denominationKey("Methodist"));
});
test("preferences reject unsupported, oversized, duplicate and ambiguous choices instead of silently widening them", () => {
  assert.deepEqual(
    parseDiscoveryPreferences({}),
    defaultDiscoveryPreferences()
  );
  assert.throws(
    () => parseDiscoveryPreferences({ inferredFaith: "Baptist" }),
    PortalError
  );
  assert.throws(
    () => parseDiscoveryFilters({ geography: "local", country: "US" }),
    PortalError
  );
  assert.throws(
    () => parseDiscoveryFilters({ denominations: ["Baptist", "baptist"] }),
    PortalError
  );
  assert.throws(
    () => parseDiscoveryPreferences({ feedback: { prayer: 20 } }),
    PortalError
  );
  assert.throws(
    () =>
      parseDiscoveryPreferences({
        hiddenWords: Array.from({ length: 21 }, (_, i) => "word" + i)
      }),
    PortalError
  );
  assert.throws(() => guestDiscoveryPreferences("malformed"), PortalError);
  assert.deepEqual(
    parseDiscoveryPreferences({ hiddenWords: [" A  B ", "ＡＢ"] }).hiddenWords,
    ["a  b", "ａｂ"]
  );
  assert.throws(() => denominationKey("\uFDFA".repeat(6)), PortalError);
  const p = defaultDiscoveryPreferences();
  p.hiddenWords = ["private phrase"];
  assert.deepEqual(
    guestDiscoveryPreferences(encodeURIComponent(JSON.stringify(p))),
    p
  );
});
