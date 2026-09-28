import test from "node:test";
import assert from "node:assert/strict";
import { artistLink } from "../lib/platform/artist-links";
import {
  artistFields,
  artistRights,
  releaseFields,
  requireReleasePublication
} from "../lib/platform/artist-input";
import { ARTIST_POLICY } from "../lib/platform/artist-types";
const fields = () =>
  artistFields({
    name: "Fictional Ensemble",
    presentation: "TEAM",
    roles: ["Band"],
    genres: ["Acoustic"],
    credits: [{ name: "A supplied person", role: "Composer" }]
  });
test("canonical provider adapters preserve exact track selections without network work", () => {
  assert.equal(
    artistLink("https://open.spotify.com/album/1234567890123456789012").kind,
    "album"
  );
  assert.equal(
    artistLink("https://music.apple.com/US/album/a%20song/123?i=456").url,
    "https://music.apple.com/us/album/a%20song/123?i=456"
  );
  assert.equal(
    artistLink("https://fictional-band.bandcamp.com/track/my-song").kind,
    "track"
  );
});
test("unsafe credentials, fragments, private parameters and unsupported destinations fail closed", () => {
  for (const u of [
    "http://open.spotify.com/album/1234567890123456789012",
    "https://@open.spotify.com/album/1234567890123456789012",
    "https://open.spotify.com/album/1234567890123456789012#",
    "https://open.spotify.com:443/album/1234567890123456789012",
    "https://open.spotify.com./album/1234567890123456789012",
    "https://open.spotify.com/playlist/1234567890123456789012",
    "https://open.spotify.com/album/1234567890123456789012?si=private",
    "https://music.apple.com/us/album/a%2fb/123",
    "https://music.apple.com/us/album/a%C2%85b/123",
    "https://music.apple.com/us/album/a/123?i=1&i=2",
    "https://music.apple.com/us/song/a/123?i=2",
    "https://help.bandcamp.com/album/test",
    "https://a.bandcamp.com/track/song?token=private",
    "https://a.bandcamp.com/track/song%ZZ",
    "https://127.0.0.1/track/song",
    "javascript:alert(1)"
  ])
    assert.throws(() => artistLink(u), u);
});
test("metadata rejects forged fields, malformed types, excessive bounds and malformed Unicode", () => {
  for (const patch of [
    { presentation: ["TEAM"] },
    { ownerId: "forged" },
    { verified: true },
    { name: "x".repeat(161) },
    { name: "\ud800" },
    { name: "invalid\u0085control" },
    { genres: ["Folk", "folk"] },
    { roles: ["Verified artist"] },
    { townId: "1", countryId: null }
  ])
    assert.throws(() => artistFields({ ...fields(), ...patch }));
  assert.throws(() => releaseFields({ kind: ["SINGLE"] }));
  assert.throws(() =>
    releaseFields({ kind: "SINGLE", releaseDate: "2030-02-30" })
  );
});
test("rights expiry is explicit, exact and never coerced to unlimited permission", () => {
  const v = { policy: ARTIST_POLICY, confirmed: true, basis: "OWN_WORK" };
  for (const expiresAt of [
    false,
    0,
    [],
    {},
    "2030-02-30T00:00:00.000Z",
    "2020-01-01T00:00:00.000Z"
  ])
    assert.throws(() => artistRights({ ...v, expiresAt }, fields(), "actor"));
  assert.throws(() =>
    artistRights({ ...v, basis: ["OWN_WORK"] }, fields(), "actor")
  );
  assert.equal(
    artistRights(
      { ...v, expiresAt: "2030-03-01T00:00:00.000Z" },
      fields(),
      "actor"
    ).rightsExpiresAt?.toISOString(),
    "2030-03-01T00:00:00.000Z"
  );
});
test("release publication validates all tracks and correct target type", () => {
  const base = {
    kind: "SINGLE",
    title: "A fictional single",
    tracks: [
      {
        id: "track-1",
        title: "One",
        links: ["https://a.bandcamp.com/track/one"]
      }
    ],
    links: []
  };
  requireReleasePublication(releaseFields(base));
  assert.throws(() =>
    requireReleasePublication(releaseFields({ ...base, tracks: [] }))
  );
  assert.throws(() =>
    releaseFields({ ...base, tracks: [base.tracks[0], base.tracks[0]] })
  );
  assert.throws(() =>
    releaseFields({
      ...base,
      kind: "ALBUM",
      links: ["https://a.bandcamp.com/track/one"]
    })
  );
  assert.throws(() =>
    releaseFields({
      ...base,
      tracks: [
        { ...base.tracks[0], links: ["https://a.bandcamp.com/album/one"] }
      ]
    })
  );
});
