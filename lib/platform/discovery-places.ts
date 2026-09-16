import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { join } from "node:path";
import {
  DISCOVERY_RADII,
  discoveryCountry,
  discoveryPlaceId
} from "./discovery-options";
import { PortalError } from "./portal-policy";
import { isDeviceArea } from "./device-location";

type Town = [number, string, string, string, number, number, string];
export type DiscoveryPlace = {
  id: number;
  country: string;
  name: string;
  region: string;
  regionName: string;
  latitude: number;
  longitude: number;
};
const cache = new Map<string, Promise<Town[]>>();
async function towns(value: unknown) {
  const country = discoveryCountry(value);
  if (!country)
    throw new PortalError(
      400,
      "Choose a country to find a named town or area."
    );
  let result = cache.get(country);
  if (!result) {
    result = readFile(
      join(process.cwd(), "data/discovery/countries", country + ".json.gz")
    )
      .then(
        (bytes) =>
          JSON.parse(
            gunzipSync(bytes, { maxOutputLength: 8 * 1024 * 1024 }).toString(
              "utf8"
            )
          ) as Town[]
      )
      .catch((error) => {
        cache.delete(country);
        if (error.code === "ENOENT") return [];
        throw new PortalError(
          503,
          "Town search is temporarily unavailable. Keep your current selection and try again."
        );
      });
    // Bound memory: no whole-world index in the feed process.
    if (cache.size >= 8) cache.delete(cache.keys().next().value!);
    cache.set(country, result);
  }
  return result;
}
function place(country: string, row: Town): DiscoveryPlace {
  return {
    id: row[0],
    country,
    name: row[1],
    region: row[2],
    regionName: row[3],
    latitude: row[4],
    longitude: row[5]
  };
}
export function discoveryPlaceLabel(
  p: Pick<DiscoveryPlace, "name" | "regionName" | "country">
) {
  return [p.name, p.regionName, p.country].filter(Boolean).join(", ");
}
export async function getDiscoveryPlace(
  country: unknown,
  value: unknown
): Promise<DiscoveryPlace | null> {
  const id = discoveryPlaceId(value);
  if (id === null) return null;
  const rows = await towns(country),
    row = rows.find((r) => r[0] === id);
  if (!row)
    throw new PortalError(
      400,
      "This town or area is unavailable in the selected country. Choose a result from the current list."
    );
  return place(country as string, row);
}
const searchKey = (value: string) =>
  value.normalize("NFKD").replace(/\p{M}/gu, "").toLocaleLowerCase("en-US");
export async function searchDiscoveryPlaces(country: unknown, query: unknown) {
  if (
    typeof query !== "string" ||
    query.trim().length < 2 ||
    query.length > 100
  )
    throw new PortalError(
      400,
      "Enter 2 to 100 characters of a town or area name."
    );
  const key = searchKey(query.trim()),
    rows = await towns(country);
  const matches = rows.filter(
    (row) => searchKey(row[1]).includes(key) || searchKey(row[6]).includes(key)
  );
  matches.sort(
    (a, b) =>
      Number(!searchKey(a[1]).startsWith(key)) -
        Number(!searchKey(b[1]).startsWith(key)) ||
      a[1].localeCompare(b[1]) ||
      a[0] - b[0]
  );
  return {
    places: matches.slice(0, 20).map((row) => {
      const p = place(country as string, row);
      return { id: p.id, country: p.country, label: discoveryPlaceLabel(p) };
    }),
    hasMore: matches.length > 20
  };
}
export function townDistanceKm(
  a: Pick<DiscoveryPlace, "latitude" | "longitude">,
  b: Pick<DiscoveryPlace, "latitude" | "longitude">
) {
  const rad = Math.PI / 180,
    dlat = (b.latitude - a.latitude) * rad,
    dlon = (b.longitude - a.longitude) * rad;
  const half =
    Math.sin(dlat / 2) ** 2 +
    Math.cos(a.latitude * rad) *
      Math.cos(b.latitude * rad) *
      Math.sin(dlon / 2) ** 2;
  return 6371.0088 * 2 * Math.asin(Math.min(1, Math.sqrt(half)));
}

// Server-only catalog centers. Consumers receive IDs grouped into approximate
// bands, never device or household coordinates. Bound the selection cache too.
const bandCache = new Map<
  string,
  Promise<{ radiusKm: number; placeIds: number[] }[]>
>();
export async function discoveryPlaceBands(
  country: string,
  placeId: number,
  radiusKm: number
) {
  if (!DISCOVERY_RADII.some((radius) => radius === radiusKm))
    throw new PortalError(400, "Choose a supported approximate radius.");
  const key = `${country}:${placeId}:${radiusKm}`;
  let result = bandCache.get(key);
  if (!result) {
    result = (async () => {
      const center = await getDiscoveryPlace(country, placeId);
      if (!center) throw new PortalError(400, "Choose a named town.");
      const bands = DISCOVERY_RADII.filter((radius) => radius <= radiusKm).map(
        (radius) => ({ radiusKm: radius, placeIds: [] as number[] })
      );
      for (const row of await towns(country)) {
        const distance = townDistanceKm(center, {
          latitude: row[4],
          longitude: row[5]
        });
        const band = bands.find((item) => distance <= item.radiusKm);
        if (band) band.placeIds.push(row[0]);
      }
      return bands;
    })().catch((error) => {
      bandCache.delete(key);
      throw error;
    });
    if (bandCache.size >= 16) bandCache.delete(bandCache.keys().next().value!);
    bandCache.set(key, result);
  }
  return result;
}

export async function nearbyDiscoveryPlaces(input: Record<string, unknown>) {
  if (
    Object.keys(input).some(
      (key) => !["country", "latitudeCell", "longitudeCell"].includes(key)
    ) ||
    !isDeviceArea(input)
  )
    throw new PortalError(
      400,
      "Use an approximate area from the device-location control, or choose a town manually."
    );
  const country = discoveryCountry(input.country);
  if (!country)
    throw new PortalError(
      400,
      "Choose a country before requesting nearby areas."
    );
  const center = {
    latitude: (input.latitudeCell + 0.5) / 4 - 90,
    longitude: (input.longitudeCell + 0.5) / 4 - 180
  };
  const matches: { row: Town; distance: number }[] = [];
  for (const row of await towns(country)) {
    const distance = townDistanceKm(center, {
      latitude: row[4],
      longitude: row[5]
    });
    if (distance > 100) continue;
    matches.push({ row, distance });
    matches.sort((a, b) => a.distance - b.distance || a.row[0] - b.row[0]);
    if (matches.length > 5) matches.pop();
  }
  return matches.map(({ row }) => ({
    id: row[0],
    country,
    label: discoveryPlaceLabel(place(country, row))
  }));
}
