import test from "node:test";
import assert from "node:assert/strict";
import {
  playlistFields,
  playlistOrder,
  requireCompletePlaylistOrder
} from "../lib/platform/media-playlist-input";

test("playlist owner scopes reject a cross-church or personal-only audience", () => {
  const fields = {
    title: "Study together",
    description: "",
    audience: "CHURCH"
  };
  assert.throws(() => playlistFields(fields, false));
  assert.equal(playlistFields(fields, true).audience, "CHURCH");
  assert.throws(() => playlistFields({ ...fields, audience: "PRIVATE" }, true));
  assert.equal(
    playlistFields({ ...fields, audience: "PRIVATE" }, false).audience,
    "PRIVATE"
  );
  assert.throws(() =>
    playlistFields({ ...fields, audience: "UNKNOWN" }, false)
  );
  assert.throws(() => playlistFields({ ...fields, ownerId: "forged" }, true));
});

test("playlist text preserves valid Unicode without accepting malformed or oversized input", () => {
  const fields = {
    title: " Hope 🌿 ",
    description: "First\r\nSecond",
    audience: "PUBLIC"
  };
  assert.deepEqual(playlistFields(fields, false), {
    title: "Hope 🌿",
    description: "First\nSecond",
    audience: "PUBLIC"
  });
  for (const title of ["", " ", "x".repeat(161), "\u0000bad", "\ud800"])
    assert.throws(() => playlistFields({ ...fields, title }, false));
  assert.throws(() =>
    playlistFields({ ...fields, description: "x".repeat(2001) }, false)
  );
});

test("reorder rejects omissions, duplicates, foreign references and over-limit envelopes", () => {
  const current = ["entry_a", "entry_b", "entry_c"];
  assert.doesNotThrow(() =>
    requireCompletePlaylistOrder(playlistOrder([...current].reverse()), current)
  );
  assert.throws(() => playlistOrder(["entry_a", "entry_a"]));
  assert.throws(() => playlistOrder(["invalid/path"]));
  assert.throws(() =>
    playlistOrder(Array.from({ length: 201 }, (_, i) => `entry_${i}`))
  );
  assert.throws(() =>
    requireCompletePlaylistOrder(["entry_a", "entry_b"], current)
  );
  assert.throws(() =>
    requireCompletePlaylistOrder(["entry_a", "entry_b", "foreign"], current)
  );
  assert.doesNotThrow(() => requireCompletePlaylistOrder([], []));
});
