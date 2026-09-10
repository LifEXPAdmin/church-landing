import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import sharp from "sharp";
import {
  centeredCrop,
  validImageCrop,
  imageCropRect
} from "../lib/platform/image-crop";
import {
  defaultProfileStyle,
  validProfileStyle,
  profileInitials,
  PROFILE_PALETTES
} from "../lib/platform/profile-style";
import { processImage } from "../lib/platform/media-processing";

test("crop coordinates reject non-finite, out-of-bounds and injected fields", () => {
  assert.ok(validImageCrop(centeredCrop));
  for (const crop of [
    null,
    [],
    {},
    { ...centeredCrop, x: -0.01 },
    { ...centeredCrop, y: 1.1 },
    { ...centeredCrop, zoom: 0.99 },
    { ...centeredCrop, zoom: 4.1 },
    { ...centeredCrop, x: NaN },
    { ...centeredCrop, y: Infinity },
    { ...centeredCrop, zoom: "2" },
    { ...centeredCrop, html: "<script>" }
  ])
    assert.equal(validImageCrop(crop), false);
});
test("crop rectangles stay inside portrait, landscape and tiny images at every extreme", () => {
  for (const [width, height] of [
    [1, 1],
    [2, 9],
    [9, 2],
    [4032, 3024],
    [3024, 4032]
  ])
    for (const aspect of [1, 3])
      for (const zoom of [1, 1.05, 4])
        for (const x of [0, 0.5, 1])
          for (const y of [0, 0.5, 1]) {
            const r = imageCropRect(width, height, aspect, { x, y, zoom });
            assert.ok(
              r.width >= 1 && r.height >= 1 && r.left >= 0 && r.top >= 0
            );
            assert.ok(r.left + r.width <= width && r.top + r.height <= height);
            assert.ok(Math.abs(r.height - r.width / aspect) < 1);
          }
});
test("rotated photo crop uses displayed orientation, preserves full normalized original and removes metadata", async () => {
  const blue = await sharp({
    create: { width: 300, height: 300, channels: 3, background: "blue" }
  })
    .png()
    .toBuffer();
  const source = await sharp({
    create: { width: 600, height: 300, channels: 3, background: "red" }
  })
    .composite([{ input: blue, left: 300, top: 0 }])
    .jpeg()
    .withMetadata({ orientation: 6 })
    .withExifMerge({ IFD0: { Artist: "PRIVATE CROP FIXTURE" } })
    .toBuffer();
  for (const aspect of [1, 3]) {
    const result = await processImage(source, {
      aspect,
      crop: { x: 0.5, y: 1, zoom: 1 }
    });
    assert.equal(result.manifest.original.width, 300);
    assert.equal(result.manifest.original.height, 600);
    for (const variant of ["large", "medium", "thumb"] as const) {
      const size = result.manifest[variant];
      assert.ok(Math.abs(size.width / size.height - aspect) < 0.03);
      const sample = await sharp(result.files[variant])
        .resize(1, 1)
        .raw()
        .toBuffer();
      assert.ok(
        sample[2] > 200 && sample[0] < 30,
        "bottom crop must show blue after rotation"
      );
      const metadata = await sharp(result.files[variant]).metadata();
      assert.equal(metadata.exif, undefined);
      assert.equal(metadata.orientation, undefined);
    }
    const top = await sharp(result.files.original)
      .extract({ left: 100, top: 50, width: 1, height: 1 })
      .raw()
      .toBuffer();
    assert.ok(
      top[0] > 200 && top[2] < 30,
      "original must retain the uncropped red area"
    );
  }
});
test("profile presets are bounded and initials handle multiple words and Unicode", () => {
  assert.equal(profileInitials("  Lee  Walker "), "LW");
  assert.equal(profileInitials("李 明"), "李明");
  assert.equal(profileInitials(""), "");
  assert.ok(validProfileStyle(defaultProfileStyle));
  for (const values of [
    { palette: "#ffffff" },
    { background: "url(https://example.test)" },
    { sectionOrder: "<script>" },
    { introduction: "x".repeat(1001) },
    { introduction: { html: "code" } }
  ])
    assert.equal(
      validProfileStyle({ ...defaultProfileStyle, ...values }),
      false
    );
});
test("all allowed light and dark profile palettes provide normal-text contrast", () => {
  const css = readFileSync("app/platform/platform.css", "utf8");
  const light = PROFILE_PALETTES.map((p) => [p.background, p.ink]);
  const dark = [
    ...css.matchAll(
      /--profile-dark-paper: (#[a-f0-9]{6});\s*--profile-dark-ink: (#[a-f0-9]{6});/g
    )
  ].map((m) => [m[1], m[2]]);
  assert.equal(dark.length, 3);
  const luminance = (hex: string) =>
    hex
      .slice(1)
      .match(/../g)!
      .map((n) => parseInt(n, 16) / 255)
      .map((n) => (n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4))
      .reduce((a, n, i) => a + n * [0.2126, 0.7152, 0.0722][i], 0);
  for (const [bg, ink] of [...light, ...dark]) {
    const a = luminance(bg),
      b = luminance(ink);
    assert.ok(
      (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) >= 4.5,
      `${bg}/${ink}`
    );
    assert.ok(css.includes(bg) && css.includes(ink));
  }
});
