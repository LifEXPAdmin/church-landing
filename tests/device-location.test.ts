import test from "node:test";
import assert from "node:assert/strict";
import { coarseDeviceArea } from "../lib/platform/device-location";
import { nearbyDiscoveryPlaces } from "../lib/platform/discovery-places";
import { PortalError } from "../lib/platform/portal-policy";

const now = 1_800_000_000_000;
const position = (
  latitude: number,
  longitude: number,
  accuracy = 20,
  timestamp = now
) => ({
  timestamp,
  coords: {
    latitude,
    longitude,
    accuracy,
    altitude: null,
    altitudeAccuracy: null,
    heading: null,
    speed: null,
    toJSON() {
      throw Error("Precise coordinates must not be serialized");
    }
  }
});
test("device positions become bounded coarse cells without retaining coordinates or stale and inaccurate results", () => {
  assert.deepEqual(coarseDeviceArea(position(41.8781234, -87.6299876), now), {
    latitudeCell: 527,
    longitudeCell: 369
  });
  assert.deepEqual(coarseDeviceArea(position(41.8789999, -87.6291234), now), {
    latitudeCell: 527,
    longitudeCell: 369
  });
  assert.deepEqual(coarseDeviceArea(position(-90, -180), now), {
    latitudeCell: 0,
    longitudeCell: 0
  });
  assert.deepEqual(coarseDeviceArea(position(90, 180), now), {
    latitudeCell: 719,
    longitudeCell: 0
  });
  for (const invalid of [
    position(91, 0),
    position(0, 181),
    position(NaN, 0),
    position(0, Infinity),
    position(0, 0, -1),
    position(0, 0, 10001),
    position(0, 0, 10, now - 60001),
    position(0, 0, 10, now + 5001)
  ])
    assert.equal(coarseDeviceArea(invalid, now), null);
});

test("nearby lookup returns five selected-country labels at most, accepts only cells and stops at its geographic bound", async () => {
  const area = coarseDeviceArea(position(41.8781234, -87.6299876), now)!;
  const results = await nearbyDiscoveryPlaces({ country: "US", ...area });
  assert.equal(results.length, 5);
  assert.equal(new Set(results.map((r) => r.id)).size, 5);
  assert.ok(results.some((p) => /Chicago/.test(p.label)));
  for (const result of results) {
    assert.deepEqual(Object.keys(result).sort(), ["country", "id", "label"]);
    assert.equal(result.country, "US");
  }
  assert.deepEqual(await nearbyDiscoveryPlaces({ country: "AU", ...area }), []);
  assert.deepEqual(
    await nearbyDiscoveryPlaces({
      country: "US",
      latitudeCell: 360,
      longitudeCell: 720
    }),
    []
  );
  for (const input of [
    { country: "US", latitude: 41.8781234, longitude: -87.6299876 },
    { country: "US", ...area, accuracy: 20 },
    { country: "US", ...area, latitudeCell: 527.1 },
    { country: "US", ...area, latitudeCell: -1 },
    { country: "US", ...area, latitudeCell: 720 },
    { country: "US", ...area, longitudeCell: 1440 },
    { country: "US", ...area, longitudeCell: "369" },
    { country: "../../etc", ...area },
    { country: null, ...area }
  ])
    await assert.rejects(nearbyDiscoveryPlaces(input), PortalError);
});
