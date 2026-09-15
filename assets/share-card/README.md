# Preview font

Noto Sans variable font, Copyright 2022 The Noto Project Authors, distributed
under the included SIL Open Font License 1.1. Source downloaded 15 September 2026:
https://github.com/google/fonts/tree/main/ofl/notosans

`NotoSans.ttf` is the unmodified `NotoSans[wdth,wght].ttf`. Its cmap coverage is
recorded in `font-coverage.json` so unsupported text uses the static brand card
instead of host-dependent missing-glyph boxes or a remote font service. Public
HTML retains the original title in every script. The bundled font covers Latin,
Greek and Cyrillic; this is not a promise of universal script coverage.

`fonts.conf` supplies a serverless font configuration when the host has none.
Only generic font caches may be written to the temporary directory. Resource text
and generated source images are never persisted there.

After an intentional font update, use the pinned Next.js development font parser
to regenerate coverage, then render/review the actual production PNG fixtures:

```sh
node scripts/verify-share-card-font.mjs --write
node --import ./tests/register.mjs scripts/render-share-cards.mjs
```

The parser is development tooling only; no font parser or new package is added to
the application runtime. Static, SVG and dynamic PNG presentation share the same
layout and existing Church mark.
