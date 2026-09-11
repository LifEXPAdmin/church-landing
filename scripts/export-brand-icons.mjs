import { writeFile, mkdir } from "node:fs/promises";
import sharp from "sharp";
import { brandColors, churchMarkPaths } from "../lib/brand.ts";
const dir = new URL("../public/brand/", import.meta.url);
await mkdir(dir, { recursive: true });
function svg(maskable = false) {
  const inset = maskable ? 112 : 64,
    size = 512 - inset * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><title>Godschurches</title><rect width="512" height="512" rx="${maskable ? 0 : 96}" fill="${brandColors.paper}"/><g transform="translate(${inset} ${inset}) scale(${size / 24})" fill="none" stroke="${brandColors.olive}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${churchMarkPaths.map((d) => `<path d="${d}"/>`).join("")}</g></svg>`;
}
await writeFile(new URL("church-mark.svg", dir), svg());
await writeFile(new URL("church-mark-maskable.svg", dir), svg(true));
for (const [name, size, mask] of [
  ["icon-192.png", 192, false],
  ["icon-512.png", 512, false],
  ["search-icon.png", 96, false],
  ["apple-touch-icon.png", 180, false],
  ["maskable-512.png", 512, true]
]) {
  await sharp(Buffer.from(svg(mask)))
    .resize(size, size)
    .png()
    .toFile(new URL(name, dir).pathname);
}
const sizes = [16, 32, 48];
const images = await Promise.all(
  sizes.map((size) =>
    sharp(Buffer.from(svg())).resize(size, size).png().toBuffer()
  )
);
const header = Buffer.alloc(6 + 16 * sizes.length);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
images.forEach((bytes, i) => {
  const at = 6 + i * 16;
  header[at] = sizes[i];
  header[at + 1] = sizes[i];
  header.writeUInt16LE(1, at + 4);
  header.writeUInt16LE(32, at + 6);
  header.writeUInt32LE(bytes.length, at + 8);
  header.writeUInt32LE(offset, at + 12);
  offset += bytes.length;
});
await writeFile(
  new URL("../public/favicon.ico", import.meta.url),
  Buffer.concat([header, ...images])
);
console.log(
  "Exported editable SVG, five PNGs and 16/32/48 favicon from the existing Church mark."
);
