import test from "node:test";
import assert from "node:assert/strict";
import {
  MEDIA_CHAPTER_MAX_COUNT,
  MEDIA_COMMAND_MAX_BYTES,
  MEDIA_TRANSCRIPT_MAX_CHARS,
  mediaTranscript
} from "../lib/platform/media-transcript";
import { PortalError } from "../lib/platform/portal-policy";

const invalid = (work: () => unknown, message: RegExp) =>
  assert.throws(
    work,
    (error: unknown) =>
      error instanceof PortalError &&
      error.status === 400 &&
      message.test(error.message)
  );

test("optional transcript content remains empty; manual text and titles normalize without interpreting markup", () => {
  assert.deepEqual(mediaTranscript(undefined, undefined), {
    transcriptText: "",
    chapters: []
  });
  assert.deepEqual(
    mediaTranscript(
      "  café 🙏\r\n<script>literal</script>\rnext  ",
      [{ startSeconds: 0, title: "  Opening 🙏  " }],
      20
    ),
    {
      transcriptText: "café 🙏\n<script>literal</script>\nnext",
      chapters: [{ startSeconds: 0, title: "Opening 🙏" }]
    }
  );
  assert.deepEqual(mediaTranscript("", []), {
    transcriptText: "",
    chapters: []
  });
});

test("transcript limits count UTF-16 units and reject malformed text without truncation", () => {
  const maximum = "🙏".repeat(MEDIA_TRANSCRIPT_MAX_CHARS / 2);
  assert.equal(mediaTranscript(maximum, []).transcriptText, maximum);
  invalid(() => mediaTranscript(maximum + "x", []), /transcript/);
  for (const bad of [
    "\ud800",
    "\udc00",
    "before\u0000after",
    "before\u001fafter",
    "before\u007fafter",
    42,
    {}
  ])
    invalid(() => mediaTranscript(bad, []), /transcript/);
  assert.equal(mediaTranscript("a\tb\nc", []).transcriptText, "a\tb\nc");
  assert.equal(MEDIA_COMMAND_MAX_BYTES, 524288);
});

test("chapter times remain strictly ordered whole seconds and below a known duration", () => {
  const chapters = [
    { startSeconds: 0, title: "Opening" },
    { startSeconds: 59, title: "Closing" }
  ];
  assert.deepEqual(mediaTranscript("", chapters, 60).chapters, chapters);
  assert.equal(
    mediaTranscript("", [
      { startSeconds: 604800, title: "Unknown duration marker" }
    ]).chapters[0].startSeconds,
    604800
  );
  for (const startSeconds of [-1, 0.5, "1", NaN, Infinity, 604801])
    invalid(
      () => mediaTranscript("", [{ startSeconds, title: "Chapter" }]),
      /Chapter 1/
    );
  for (const later of [0, 59])
    invalid(
      () =>
        mediaTranscript("", [
          { startSeconds: 59, title: "First" },
          { startSeconds: later, title: "Second" }
        ]),
      /Chapter 2.*after/
    );
  invalid(
    () => mediaTranscript("", [{ startSeconds: 60, title: "At the end" }], 60),
    /before.*duration/
  );
  invalid(() => mediaTranscript("", chapters, 59), /before.*duration/);
  invalid(() => mediaTranscript("", chapters, 0), /duration/);
});

test("chapter shape, title and collection bounds reject hidden fields and retain the supplied order", () => {
  const chapters = Array.from(
    { length: MEDIA_CHAPTER_MAX_COUNT },
    (_, startSeconds) => ({ startSeconds, title: "x".repeat(120) })
  );
  assert.deepEqual(mediaTranscript("", chapters, 101).chapters, chapters);
  invalid(
    () =>
      mediaTranscript("", [...chapters, { startSeconds: 100, title: "Extra" }]),
    /100/
  );
  for (const value of [
    null,
    {},
    "chapters",
    [null],
    [{ startSeconds: 0 }],
    [{ startSeconds: 0, title: "Valid", href: "https://example.test" }]
  ])
    invalid(() => mediaTranscript("", value), /chapter/i);
  for (const title of [" ", "x".repeat(121), "\ud800", "bad\u0007text"])
    invalid(
      () => mediaTranscript("", [{ startSeconds: 0, title }]),
      /chapter 1 title/i
    );
  const source = [
    { startSeconds: 2, title: "  Second  " },
    { startSeconds: 3, title: "Third" }
  ];
  mediaTranscript("", source);
  assert.equal(
    source[0].title,
    "  Second  ",
    "Parsing never changes the retained editor input"
  );
});
