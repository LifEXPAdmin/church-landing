import sharp from "sharp";
import path from "node:path";
import { readFile } from "node:fs/promises";
import {
  shareCardLayout,
  shareCardSvg,
  xmlText,
  type PublicShareCardInput
} from "../share-card";
import fontCoverage from "../../assets/share-card/font-coverage.json" with { type: "json" };

const fontfile = path.join(process.cwd(), "assets/share-card/NotoSans.ttf");
// Serverless hosts have no guaranteed system font configuration. The bundled
// configuration contains only our licensed font; existing host settings win.
process.env.FONTCONFIG_FILE ??= path.join(
  process.cwd(),
  "assets/share-card/fonts.conf"
);
const fallbackFile = path.join(process.cwd(), "public/brand/share-card.png");
// Only generic bytes are cached. Resource copy and generated resource images
// never enter memory caches, disk/Blob storage or the shared image optimizer.
let fallback: Promise<Buffer> | undefined;
export function defaultShareCard() {
  return (fallback ??= readFile(fallbackFile).catch((error) => {
    fallback = undefined;
    throw error;
  }));
}
export function shareCardHasGlyphs(input: PublicShareCardInput) {
  return shareCardLayout(input).every((line) =>
    Array.from(line.text).every((character) => {
      const point = character.codePointAt(0)!;
      return fontCoverage.some(
        ([start, end]) => point >= start && point <= end
      );
    })
  );
}
export async function renderShareCard(input: PublicShareCardInput = {}) {
  // Bundled font only: no system-font dependency, remote font lookup or sending
  // source text to an image/font provider. Unsupported scripts use known branding;
  // their original public title remains in ordinary HTML metadata.
  if (!shareCardHasGlyphs(input)) return defaultShareCard();
  const layers = [];
  for (const line of shareCardLayout(input)) {
    const result = await sharp({
      text: {
        text: `<span foreground="${line.color}">${xmlText(line.text)}</span>`,
        font: `Noto Sans ${line.weight === 600 ? "Semi-Bold" : "Regular"} ${line.size}`,
        fontfile,
        dpi: 72,
        rgba: true
      }
    })
      .png()
      .toBuffer({ resolveWithObject: true });
    // Character counts alone cannot bound wide glyphs such as a run of W's.
    // Fit every text layer inside the comfortable central square crop.
    const scale = Math.min(1, 540 / result.info.width);
    const data =
      scale < 1
        ? await sharp(result.data).resize({ width: 540 }).png().toBuffer()
        : result.data;
    const width = Math.min(540, result.info.width);
    layers.push({
      input: data,
      left: Math.round(line.anchor === "middle" ? line.x - width / 2 : line.x),
      top: line.y - Math.round(line.size * scale)
    });
  }
  return sharp(Buffer.from(shareCardSvg({}, true)))
    .composite(layers)
    .png()
    .toBuffer();
}
