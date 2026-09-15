import { mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { shareCardSvg } from "../lib/share-card.ts";
import { renderShareCard } from "../lib/platform/share-card-image.ts";
// Use Node 24 with --import ./tests/register.mjs. The same layout and bundled
// font render the static default, production PNGs and editable SVG samples.
const output = ".account-test/brand-review";
mkdirSync(output, { recursive: true });
const fixtures = {
  default: {},
  post: {
    variant: "post",
    title: "A public post from Grace",
    description: "A fictional public layout sample about community life."
  },
  church: {
    variant: "church",
    title: "Fictional Hope Community",
    description: "A fictional public church summary for layout review."
  },
  event: {
    variant: "event",
    title: "Community supper",
    description:
      "A fictional public event sample. Check the event for current details."
  },
  long: {
    variant: "post",
    title:
      "A long community heading that must remain readable without overflowing the image",
    description:
      "Fictional layout sample only. No church or member record is loaded."
  },
  unicode: {
    title: "Espérance · Paz · Ελπίδα",
    description: "Faith across languages — a fictional typography sample."
  },
  wide: {
    variant: "post",
    title: "W".repeat(1000),
    description: "W".repeat(1000)
  },
  missing: { title: "", description: "" },
  unsupported: {
    title: "平安",
    description:
      "Unsupported glyphs use known branding; no remote font request."
  }
};
for (const [name, input] of Object.entries(fixtures)) {
  writeFileSync(`${output}/${name}.svg`, shareCardSvg(input));
  const bytes = await renderShareCard(input);
  writeFileSync(`${output}/${name}.png`, bytes);
  await sharp(bytes)
    .extract({ left: 285, top: 0, width: 630, height: 630 })
    .png()
    .toFile(`${output}/${name}-square.png`);
  if (name === "default") writeFileSync("public/brand/share-card.png", bytes);
}
console.log(
  "Rendered default, public post/church/event, long, Unicode and fallback samples plus square crops."
);
