import { registerHooks } from "node:module";
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import sharp from "sharp";
// Render TSX using the already-installed compiler; no app server or data access.
registerHooks({
  resolve(specifier, context, next) {
    if (
      specifier.startsWith(".") &&
      context.parentURL &&
      !/\.[cm]?[jt]sx?$/.test(specifier)
    ) {
      const url = new URL(specifier + ".ts", context.parentURL);
      if (existsSync(fileURLToPath(url))) return next(url.href, context);
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.endsWith(".tsx"))
      return {
        format: "module",
        shortCircuit: true,
        source: ts.transpileModule(readFileSync(fileURLToPath(url), "utf8"), {
          compilerOptions: {
            jsx: ts.JsxEmit.ReactJSX,
            module: ts.ModuleKind.ESNext,
            target: ts.ScriptTarget.ES2022
          }
        }).outputText
      };
    return next(url, context);
  }
});
const { ShareCard } = await import("../components/brand/share-card.tsx");
const output = ".account-test/brand-review";
mkdirSync(output, { recursive: true });
const fixtures = {
  default: {},
  long: {
    title:
      "A long community heading that must remain readable without overflowing the image",
    description:
      "Fictional layout sample only. No church or member record is loaded."
  },
  unicode: {
    title: "Espérance · Paz · 平安",
    description: "Faith across languages — a fictional typography sample."
  },
  missing: { title: "", description: "" }
};
for (const [name, input] of Object.entries(fixtures)) {
  const svg = renderToStaticMarkup(createElement(ShareCard, input));
  writeFileSync(`${output}/${name}.svg`, svg);
  const bytes = await sharp(Buffer.from(svg)).png().toBuffer();
  writeFileSync(`${output}/${name}.png`, bytes);
  await sharp(bytes)
    .extract({ left: 285, top: 0, width: 630, height: 630 })
    .png()
    .toFile(`${output}/${name}-square.png`);
  if (name === "default") writeFileSync("public/brand/share-card.png", bytes);
}
console.log(
  "Rendered default, long, Unicode and missing-input fixtures plus square crops."
);
