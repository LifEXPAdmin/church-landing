import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import { parse } from "parse5";
import postcss from "postcss";

// Build tooling only. Inspect authored source, never stored member content.
const root = process.cwd();
const issues = [];
let files = 0;
let fragments = 0;
function inspect(text, file, line) {
  fragments++;
  const decoded = text.replace(
    /&(?:mdash|ndash);|&#(?:0*821[12]|x0*201[34]);?/gi,
    "\u2014"
  );
  // Ordinary CSS variables and URL syntax are not sentence punctuation.
  const prose = decoded
    .replace(/var\(--[\w-]+\)/g, "")
    .replace(/\bhttps?:\/\/[^\s"'<>]+/g, "");
  const doubleBreak = /--/.test(prose) && !/^--[a-z][\w-]*$/i.test(prose);
  if (/[\u2013\u2014]/u.test(decoded) || doubleBreak)
    issues.push(`${file}:${line}: rewrite authored punctuation or placeholder`);
}
function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      walk(path);
      continue;
    }
    if (/\.test\.[cm]?[jt]sx?$/.test(path)) continue;
    const sourceFile = /\.[cm]?[jt]sx?$/.test(path);
    const staticText = /\.(?:html|svg|json|webmanifest|css|txt|mdx?)$/.test(
      path
    );
    if (!sourceFile && !staticText) continue;
    files++;
    const source = readFileSync(path, "utf8");
    const file = relative(root, path);
    if (!sourceFile) {
      // Static markup has technical double hyphens in comments and CSS names.
      // Literal/encoded long dashes still fail, including CSS content escapes.
      source.split("\n").forEach((line, i) => {
        if (
          /[\u2013\u2014]|&(?:mdash|ndash);|&#(?:0*821[12]|x0*201[34]);?|\\0*201[34]\b/i.test(
            line
          )
        )
          issues.push(`${file}:${i + 1}: rewrite authored static punctuation`);
      });
      if (/\.(?:html|svg)$/.test(path)) {
        function visitMarkup(node) {
          if (node.nodeName === "#text") inspect(node.value, file, 1);
          for (const attr of node.attrs ?? []) inspect(attr.value, file, 1);
          for (const child of node.childNodes ?? []) visitMarkup(child);
        }
        visitMarkup(parse(source));
      } else if (/\.(?:json|webmanifest)$/.test(path)) {
        function visitValue(value) {
          if (typeof value === "string") inspect(value, file, 1);
          else if (value && typeof value === "object")
            Object.values(value).forEach(visitValue);
        }
        visitValue(JSON.parse(source));
      } else if (path.endsWith(".css")) {
        postcss
          .parse(source)
          .walkDecls("content", (decl) =>
            inspect(decl.value, file, decl.source?.start?.line ?? 1)
          );
      } else {
        source.split("\n").forEach((line, i) => inspect(line, file, i + 1));
      }
      continue;
    }
    const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
    function visit(node) {
      const line = () =>
        ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1;
      if (
        ts.isStringLiteralLike(node) ||
        ts.isTemplateHead(node) ||
        ts.isTemplateMiddle(node) ||
        ts.isTemplateTail(node) ||
        ts.isJsxText(node)
      )
        inspect(node.text, file, line());
      if (
        ts.isCallExpression(node) &&
        /^String\.(?:fromCharCode|fromCodePoint)$/.test(
          node.expression.getText(ast)
        ) &&
        node.arguments.some(
          (arg) =>
            ts.isNumericLiteral(arg) &&
            [0x2013, 0x2014].includes(Number(arg.text))
        )
      )
        issues.push(
          `${file}:${line()}: do not generate a long dash for authored copy`
        );
      ts.forEachChild(node, visit);
    }
    visit(ast);
  }
}
for (const directory of ["app", "components", "lib", "public"])
  walk(join(root, directory));
if (issues.length) {
  console.error(issues.join("\n"));
  process.exitCode = 1;
} else {
  console.log(
    `Website copy check passed: ${files} source/static files, ${fragments} authored fragments. Stored member content is untouched.`
  );
}
