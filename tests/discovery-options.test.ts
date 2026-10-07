import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import {
  defaultDiscoveryPreferences,
  DISCOVERY_RESOURCE_KINDS,
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
    {
      bytes: number;
      sha256: string;
      uncompressedBytes?: number;
      uncompressedSha256?: string;
    }
  ][]) {
    const data = readFileSync("data/discovery/" + name);
    assert.equal(data.length, expected.bytes);
    assert.equal(
      createHash("sha256").update(data).digest("hex"),
      expected.sha256
    );
    if (name.endsWith(".gz")) {
      const raw = gunzipSync(data);
      assert.equal(raw.length, expected.uncompressedBytes);
      assert.equal(
        createHash("sha256").update(raw).digest("hex"),
        expected.uncompressedSha256
      );
    }
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

test("resource choices preserve older defaults but distinguish hiding all kinds and keep guest presets", () => {
  const all = [...DISCOVERY_RESOURCE_KINDS].sort();
  const old = {
    filters: { types: ["PRAYER"] },
    presets: [
      {
        id: "old-preset",
        name: "Older saved feed",
        mode: "public",
        filters: {}
      }
    ]
  };
  const parsed = parseDiscoveryPreferences(old);
  assert.deepEqual(parsed.filters.resources, all);
  assert.deepEqual(parsed.filters.types, ["PRAYER"]);
  assert.deepEqual(parsed.presets[0].filters.resources, all);
  const none = parseDiscoveryPreferences({
    filters: { resources: [] },
    presets: [
      {
        id: "plain",
        name: "Posts without resources",
        mode: "public",
        filters: { resources: [] }
      }
    ]
  });
  assert.deepEqual(none.filters.resources, []);
  assert.deepEqual(none.presets[0].filters.resources, []);
  assert.deepEqual(
    guestDiscoveryPreferences(encodeURIComponent(JSON.stringify(none))),
    none
  );
  assert.deepEqual(
    parseDiscoveryFilters({
      resources: [...DISCOVERY_RESOURCE_KINDS].reverse()
    }).resources,
    all
  );
  for (const kind of DISCOVERY_RESOURCE_KINDS) {
    assert.deepEqual(parseDiscoveryFilters({ resources: [kind] }).resources, [
      kind
    ]);
  }
});

test("resource choices reject unknown, malformed and duplicate entries without widening a saved selection", () => {
  for (const resources of [
    null,
    false,
    "mediaCatalogItem",
    [null],
    [undefined],
    [123],
    [{}],
    ["business"],
    ["mediaCatalogItem", "mediaCatalogItem"],
    [...DISCOVERY_RESOURCE_KINDS, "eventOccurrence"]
  ]) {
    assert.throws(() => parseDiscoveryFilters({ resources }), PortalError);
  }
  const corrupt = encodeURIComponent(
    JSON.stringify({ filters: { resources: ["unknown"] } })
  );
  assert.throws(
    () => guestDiscoveryPreferences(corrupt),
    (e: unknown) => e instanceof PortalError && e.status === 409
  );
});
