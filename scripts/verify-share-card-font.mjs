import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const createFont =
  require("next/dist/compiled/@next/font/dist/fontkit").default;
const bytes = readFileSync("assets/share-card/NotoSans.ttf");
const font = createFont(bytes);
const ranges = [];
for (const point of [...font.characterSet].sort((a, b) => a - b)) {
  const last = ranges.at(-1);
  if (last && last[1] + 1 === point) last[1] = point;
  else ranges.push([point, point]);
}
const file = "assets/share-card/font-coverage.json";
if (process.argv.includes("--write"))
  writeFileSync(file, JSON.stringify(ranges) + "\n");
else assert.deepEqual(JSON.parse(readFileSync(file, "utf8")), ranges);
console.log(
  JSON.stringify({
    family: font.familyName,
    glyphs: font.characterSet.length,
    ranges: ranges.length,
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex")
  })
);
