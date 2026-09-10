import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import {
  IMAGE_INPUT_BYTES,
  processImage
} from "../lib/platform/media-processing";
import { boundedBytes } from "../lib/platform/media-storage";

test("rotated phone JPEG is oriented, re-encoded and stripped of embedded private metadata in every size", async () => {
  const source = await sharp({
    create: { width: 1200, height: 600, channels: 3, background: "red" }
  })
    .jpeg()
    .composite([
      {
        input: await sharp({
          create: { width: 600, height: 600, channels: 3, background: "blue" }
        })
          .png()
          .toBuffer(),
        left: 600,
        top: 0
      }
    ])
    .withMetadata({ orientation: 6 })
    .withExifMerge({ IFD0: { Artist: "PRIVATE FIXTURE NAME" } })
    .withXmp(
      '<x:xmpmeta xmlns:x="adobe:ns:meta/">PRIVATE GPS FIXTURE</x:xmpmeta>'
    )
    .toBuffer();
  assert.equal((await sharp(source).metadata()).orientation, 6);
  const result = await processImage(
    Buffer.concat([source, Buffer.from("APPENDED PRIVATE PAYLOAD")])
  );
  assert.equal(result.manifest.original.width, 600);
  assert.equal(result.manifest.original.height, 1200);
  assert.equal(result.manifest.thumb.height, 240);
  const top = await sharp(result.files.original)
    .extract({ left: 300, top: 100, width: 1, height: 1 })
    .raw()
    .toBuffer();
  const bottom = await sharp(result.files.original)
    .extract({ left: 300, top: 1000, width: 1, height: 1 })
    .raw()
    .toBuffer();
  assert.ok(top[0] > 200 && top[2] < 30);
  assert.ok(bottom[2] > 200 && bottom[0] < 30);
  for (const bytes of Object.values(result.files)) {
    const metadata = await sharp(bytes).metadata();
    assert.equal(metadata.format, "webp");
    for (const field of ["exif", "xmp", "icc", "iptc", "orientation"] as const)
      assert.equal(metadata[field], undefined);
    assert.ok(!bytes.includes(Buffer.from("PRIVATE")));
    assert.ok(!bytes.equals(source));
  }
});
test("PNG transparency and WebP decode correctly without enlarging a small image", async () => {
  for (const format of ["png", "webp"] as const) {
    const source = await sharp({
      create: {
        width: 24,
        height: 12,
        channels: 4,
        background: { r: 0, g: 100, b: 0, alpha: 0.5 }
      }
    })
      [format]()
      .toBuffer();
    const result = await processImage(source);
    assert.equal(result.manifest.thumb.width, 24);
    assert.equal(result.manifest.thumb.height, 12);
    assert.equal(
      (await sharp(result.files.original).metadata()).hasAlpha,
      true
    );
  }
});
test("a large valid phone image produces reserved dimensions and smaller responsive derivatives", async () => {
  const source = await sharp({
    create: { width: 6000, height: 4000, channels: 3, background: "blue" }
  })
    .jpeg()
    .toBuffer();
  const result = await processImage(source);
  assert.equal(result.manifest.original.width, 6000);
  assert.equal(result.manifest.large.width, 1600);
  assert.equal(result.manifest.medium.width, 800);
  assert.equal(result.manifest.thumb.width, 240);
  assert.ok(result.files.thumb.length < result.files.original.length);
});
test("disguised documents, empty/oversized/truncated images and decompression-sized images are rejected", async () => {
  const valid = await sharp({
    create: { width: 100, height: 100, channels: 3, background: "blue" }
  })
    .jpeg()
    .toBuffer();
  const excessive = await sharp({
    create: { width: 7000, height: 6000, channels: 3, background: "white" }
  })
    .png()
    .toBuffer();
  const tooWide = await sharp({
    create: { width: 17000, height: 2, channels: 3, background: "white" }
  })
    .png()
    .toBuffer();
  for (const bytes of [
    Buffer.alloc(0),
    Buffer.alloc(IMAGE_INPUT_BYTES + 1),
    Buffer.from('<svg onload="alert(1)"/>'),
    Buffer.from("%PDF-disguised.jpg"),
    valid.subarray(0, Math.floor(valid.length / 2)),
    excessive,
    tooWide
  ])
    await assert.rejects(processImage(bytes), /image|JPEG|megapixels/i);
});
test("a small compressed input cannot produce an original larger than the hosting response limit", async () => {
  const compressed = await sharp({
    create: {
      width: 6000,
      height: 4000,
      channels: 3,
      background: "white",
      noise: { type: "gaussian", mean: 128, sigma: 40 }
    }
  })
    .jpeg({ quality: 15 })
    .toBuffer();
  assert.ok(compressed.length < IMAGE_INPUT_BYTES);
  await assert.rejects(
    processImage(compressed),
    /processed image is too large/
  );
});
test("animated PNG control chunks are rejected even when the decoder exposes only the fallback still", async () => {
  const source = await sharp({
    create: { width: 10, height: 10, channels: 3, background: "green" }
  })
    .png()
    .toBuffer();
  const chunk = (type: string, data: Buffer) => {
    const name = Buffer.from(type),
      body = Buffer.concat([name, data]);
    let crc = 0xffffffff;
    for (const byte of body) {
      crc ^= byte;
      for (let i = 0; i < 8; i++)
        crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    const prefix = Buffer.alloc(4),
      suffix = Buffer.alloc(4);
    prefix.writeUInt32BE(data.length);
    suffix.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([prefix, body, suffix]);
  };
  const animation = Buffer.alloc(8);
  animation.writeUInt32BE(1);
  const frame = Buffer.alloc(26);
  frame.writeUInt32BE(10, 4);
  frame.writeUInt32BE(10, 8);
  frame.writeUInt16BE(1, 20);
  frame.writeUInt16BE(10, 22);
  const animated = Buffer.concat([
    source.subarray(0, 33),
    chunk("acTL", animation),
    chunk("fcTL", frame),
    source.subarray(33)
  ]);
  assert.equal((await sharp(animated).metadata()).format, "png");
  await assert.rejects(processImage(animated), /still JPEG/);
});
test("animated WebP is rejected instead of silently accepting only its first frame", async () => {
  const frames = await Promise.all(
    ["red", "blue"].map((background) =>
      sharp({ create: { width: 10, height: 10, channels: 3, background } })
        .png()
        .toBuffer()
    )
  );
  const animated = await sharp(frames, { join: { animated: true } })
    .webp({ delay: [100, 100], loop: 0 })
    .toBuffer();
  assert.equal((await sharp(animated).metadata()).pages, 2);
  await assert.rejects(processImage(animated), /still JPEG/);
});
test("binary streaming limits count actual bytes and abort even when Content-Length is absent", async () => {
  let canceled = false;
  const oversized = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(new Uint8Array(11));
    },
    cancel() {
      canceled = true;
    }
  });
  await assert.rejects(
    boundedBytes(oversized, 10, AbortSignal.timeout(1000)),
    /too large/
  );
  assert.equal(canceled, true);
  const stalled = new ReadableStream<Uint8Array>({
    cancel() {
      canceled = true;
    }
  });
  const controller = new AbortController();
  const reading = boundedBytes(stalled, 10, controller.signal);
  controller.abort();
  await assert.rejects(reading);
});
