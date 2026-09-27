import test from "node:test";
import assert from "node:assert/strict";
import { catalogSource } from "../lib/platform/media-catalog-sources";
import {
  mediaFields,
  mediaAcknowledgment,
  mediaRights,
  requireMediaPublication
} from "../lib/platform/media-catalog-input";
import { MEDIA_POLICY } from "../lib/platform/media-catalog-options";
test("canonical source parsing never accepts private tokens, alternate hosts or normalized paths", () => {
  for (const url of [
    "https://youtu.be/abcdefghijk",
    "https://m.youtube.com/shorts/abcdefghijk",
    "https://www.youtube.com/live/abcdefghijk",
    "https://youtube.com/watch?v=abcdefghijk"
  ])
    assert.equal(
      catalogSource(url)?.url,
      "https://www.youtube.com/watch?v=abcdefghijk"
    );
  assert.equal(catalogSource("https://vimeo.com/123456")?.provider, "VIMEO");
  assert.equal(
    catalogSource("https://soundcloud.com/speaker/recording")?.provider,
    "SOUNDCLOUD"
  );
  for (const url of [
    "http://youtu.be/abcdefghijk",
    "https://youtube.com.evil.test/watch?v=abcdefghijk",
    "https://youtube.com./watch?v=abcdefghijk",
    "https://u:p@youtube.com/watch?v=abcdefghijk",
    "https://127.0.0.1/123",
    "https://vimeo.com/123/secret",
    "https://vimeo.com/123?h=secret",
    "https://soundcloud.com/a/b?secret_token=s-secret",
    "https://youtu.be/abcdefghijk?t=5",
    "https://youtube.com/watch?v=abcdefghijk&list=abc",
    "https://youtube.com/watch?v=abcdefghijk&v=abcdefghijk",
    "https://youtube.com/embed/abcdefghijk",
    "https://vimeo.com/x/../123",
    "https://vimeo.com/%31%32%33",
    "https://vimeo.com/123#secret",
    "https://vimeo.com/123?",
    "https://soundcloud.com/a/sets",
    "https://soundcloud.com/a/s-secret",
    "https://vimeo.com:444/123",
    "https://youtube.com\\@evil.test/watch?v=abcdefghijk",
    "https://vimeo.com/123\n"
  ])
    assert.throws(() => catalogSource(url), url);
});
test("bounded metadata preserves Unicode but rejects invalid controls and mixed format details", () => {
  assert.equal(mediaFields({ title: "café 🙏" }).title, "café 🙏");
  for (const f of [
    { title: "\ud800" },
    { description: "x\u0000" },
    { durationSeconds: 0 },
    { durationSeconds: 1.5 },
    { topics: ["one", "ONE"] },
    { languageIds: ["invented"] },
    { format: "SERMON", details: { episode: 1 } },
    { format: "PODCAST", details: { season: 0 } },
    { format: "SERMON", details: { preachedOn: "2026-02-30" } },
    { ownerId: "someone" }
  ])
    assert.throws(() => mediaFields(f));
});
test("source acknowledgment binds canonical URL and null audience; testimony needs explicit current consent", () => {
  const f = mediaFields({ sourceUrl: "https://youtu.be/abcdefghijk" });
  assert.throws(() => mediaAcknowledgment(null, f));
  const a = {
    policy: MEDIA_POLICY,
    sourceUrl: f.sourceUrl,
    audience: null,
    accepted: true
  };
  assert.ok(mediaAcknowledgment(a, f));
  assert.throws(() => mediaAcknowledgment({ ...a, audience: "PUBLIC" }, f));
  assert.throws(() => requireMediaPublication(f));
  const t = mediaFields({
    ...f,
    title: "Testimony",
    format: "TESTIMONY",
    presentation: "VIDEO",
    audience: "PUBLIC",
    details: { subject: "CONSENTED_OTHER" }
  });
  const rights = {
    basis: "OWN",
    reviewed: true,
    publicRecording: true,
    textRights: true
  };
  assert.throws(() => mediaRights(rights, t));
  assert.ok(mediaRights({ ...rights, consentReference: "permission-1" }, t));
  assert.throws(() =>
    mediaRights(
      { ...rights, consentReference: "permission-1", expiresAt: "2020-01-01" },
      t
    )
  );
});
