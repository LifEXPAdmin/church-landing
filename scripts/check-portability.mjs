import { lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import ts from "typescript";

const options = {
  target: ts.ScriptTarget.ES2022,
  lib: ["lib.es2022.d.ts"],
  types: [],
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  strict: true,
  noEmit: true,
  skipLibCheck: false,
  isolatedModules: true
};
const beneath = (parent, file) => {
  const path = relative(parent, file);
  return path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path);
};
const readJson = file => JSON.parse(readFileSync(file, "utf8"));
const baselineId = "initial-native-v1-64e2106";
// Keep the first reviewed, incompatible preactivation evidence byte-for-byte.
// Its TypeScript fixture is archived as text so root compilation cannot treat it
// as a supported consumer. This is not a waiver for an installed client.
const historicalEvidence = {
  "api-v1-pre-native-compatibility.ts.txt": "9248af0dad5510151f23e6a49d752c94328994daf8ef943ce1911bd6236ad691",
  "api-v1-requests.json": "cb002ec613317550115d49d4b05f27041089b6981d08ed1d0b73cc83c1c1e06f"
};

class BoundaryError extends Error {
  constructor(code, file) {
    super(code);
    this.code = code;
    this.file = file;
  }
}
const reject = (code, file) => { throw new BoundaryError(code, file); };

function sourceFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = join(directory, entry.name);
    if (entry.isSymbolicLink()) reject("SOURCE_SYMLINK", file);
    if (entry.name.endsWith(".d.ts")) reject("DECLARATION_ONLY_SOURCE", file);
    if (entry.isDirectory()) files.push(...sourceFiles(file));
    else if (entry.isFile() && /\.ts$/.test(entry.name)) files.push(file);
    else reject("UNREVIEWED_PACKAGE_ASSET", file);
  }
  return files;
}

/** Inspect every edge before TypeScript follows it outside an allowed source set. */
function portableGraph(roots, allowed) {
  const seen = new Set();
  function visit(file) {
    if (!allowed(file) || !allowed(realpathSync(file))) reject("SOURCE_ESCAPE", file);
    if (lstatSync(file).isSymbolicLink()) reject("SOURCE_SYMLINK", file);
    if (seen.has(file)) return;
    seen.add(file);
    const text = readFileSync(file, "utf8");
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.ES2022, true);
    if (source.referencedFiles.length || source.typeReferenceDirectives.length || source.libReferenceDirectives.length)
      reject("AMBIENT_REFERENCE", file);
    if (/\/\/\s*@ts-(?:ignore|nocheck|expect-error)\b/.test(text)) reject("SUPPRESSED_PORTABLE_TYPES", file);
    function dependency(specifier) {
      if (!specifier || !specifier.startsWith(".")) reject("EXTERNAL_PORTABLE_IMPORT", file);
      const target = ts.resolveModuleName(specifier, file, options, ts.sys).resolvedModule;
      if (!target || !/\.ts$/.test(target.resolvedFileName)) reject("UNRESOLVED_PORTABLE_IMPORT", file);
      if (target.resolvedFileName.endsWith(".d.ts")) reject("DECLARATION_ONLY_SOURCE", file);
      if (!allowed(target.resolvedFileName)) reject("SOURCE_ESCAPE", file);
      visit(target.resolvedFileName);
    }
    function walk(node) {
      if (ts.getCombinedModifierFlags(node) & ts.ModifierFlags.Ambient) reject("AMBIENT_DECLARATION", file);
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
        if (!ts.isStringLiteral(node.moduleSpecifier)) reject("DYNAMIC_PORTABLE_IMPORT", file);
        dependency(node.moduleSpecifier.text);
      }
      if (ts.isImportTypeNode(node)) {
        if (!ts.isLiteralTypeNode(node.argument) || !ts.isStringLiteral(node.argument.literal)) reject("DYNAMIC_PORTABLE_IMPORT", file);
        dependency(node.argument.literal.text);
      }
      if (ts.isImportEqualsDeclaration(node)) reject("COMMONJS_PORTABLE_IMPORT", file);
      if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
        if (ts.isIdentifier(node.expression) && ["require", "eval", "Function"].includes(node.expression.text))
          reject("DYNAMIC_PORTABLE_RUNTIME", file);
        if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
          if (node.arguments?.length !== 1 || !ts.isStringLiteral(node.arguments[0])) reject("DYNAMIC_PORTABLE_IMPORT", file);
          dependency(node.arguments[0].text);
        }
      }
      ts.forEachChild(node, walk);
    }
    walk(source);
  }
  for (const file of roots) visit(file);
  return [...seen];
}

function typecheck(files, code) {
  const program = ts.createProgram(files, options);
  const diagnostics = ts.getPreEmitDiagnostics(program);
  if (diagnostics.length) {
    // Never print rejected source literals or inferred private values.
    const diagnostic = diagnostics[0];
    reject(`${code}_TS${diagnostic.code}`, diagnostic.file?.fileName ?? files[0]);
  }
}

function packageBoundary(root) {
  const directory = join(root, "packages/shared-core"), source = join(directory, "src");
  if (lstatSync(directory).isSymbolicLink() || lstatSync(source).isSymbolicLink()) reject("SOURCE_SYMLINK", directory);
  const manifestFile = join(directory, "package.json"), manifest = readJson(manifestFile);
  if (manifest.name !== "@godschurches/shared-core" || manifest.private !== true || manifest.sideEffects !== false)
    reject("PACKAGE_IDENTITY", manifestFile);
  for (const field of ["dependencies", "optionalDependencies", "peerDependencies", "scripts", "imports", "bin", "browser"])
    if (manifest[field] && Object.keys(manifest[field]).length) reject("PACKAGE_RUNTIME_DEPENDENCY", manifestFile);
  if (JSON.stringify(manifest.files) !== '["src"]') reject("PACKAGE_FILES", manifestFile);
  if (!manifest.exports || !Object.hasOwn(manifest.exports, ".")) reject("PACKAGE_EXPORTS", manifestFile);
  for (const [key, conditions] of Object.entries(manifest.exports)) {
    if (!(key === "." || /^\.\/[a-z0-9/-]+$/.test(key)) || !conditions || typeof conditions !== "object" ||
        Object.keys(conditions).sort().join(",") !== "default,react-native,types") reject("PACKAGE_EXPORTS", manifestFile);
    for (const target of Object.values(conditions)) {
      if (typeof target === "string" && target.endsWith(".d.ts")) reject("DECLARATION_ONLY_SOURCE", manifestFile);
      if (typeof target !== "string" || !/^\.\/src\/.+\.ts$/.test(target) || !beneath(source, resolve(directory, target)) ||
          !beneath(source, realpathSync(resolve(directory, target)))) reject("PACKAGE_EXPORT_ESCAPE", manifestFile);
    }
  }
  if (manifest.main !== manifest.exports["."].default || manifest.types !== manifest.exports["."].types)
    reject("PACKAGE_ENTRY_MISMATCH", manifestFile);
  const configFile = join(directory, "tsconfig.json"), config = readJson(configFile);
  const parsed = ts.parseJsonConfigFileContent(config, ts.sys, directory);
  if (parsed.errors.length || config.extends || JSON.stringify(parsed.options.lib) !== '["lib.es2022.d.ts"]' ||
      JSON.stringify(parsed.options.types) !== '[]' || parsed.options.strict !== true || parsed.options.skipLibCheck !== false)
    reject("PACKAGE_TYPE_ENVIRONMENT", configFile);
  const files = portableGraph(sourceFiles(source), file => beneath(source, file));
  typecheck(files, "PORTABLE_TYPES");
  return files;
}

function webContractForwards(root, shared) {
  const forwards = ["api-contracts", "native-auth-contracts"].map(name => {
    const file = join(root, `lib/platform/${name}.ts`);
    if (lstatSync(file).isSymbolicLink()) reject("SOURCE_SYMLINK", file);
    const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.ES2022, true);
    const statement = source.statements[0];
    if (source.parseDiagnostics.length || source.statements.length !== 1 || !ts.isExportDeclaration(statement) ||
        statement.isTypeOnly || statement.exportClause || statement.attributes ||
        !statement.moduleSpecifier || !ts.isStringLiteral(statement.moduleSpecifier) ||
        statement.moduleSpecifier.text !== `../../packages/shared-core/src/${name}`)
      reject("WEB_CONTRACT_FORWARD_CHANGED", file);
    return file;
  });
  const allowed = new Set([...shared, ...forwards]);
  portableGraph(forwards, file => allowed.has(file));
  typecheck(forwards, "WIRE_PORTABLE_TYPES");
  return forwards;
}

/** Lightweight source/contract gate. Does not run an SDK, database, app or deployment. */
export async function checkPortability(root, { requests = true } = {}) {
  root = realpathSync(root);
  const report = { ok: true, baseline: baselineId, sourceFiles: [], checks: [], findings: [] };
  try {
    for (const [name, hash] of Object.entries(historicalEvidence)) {
      const file = join(root, "tests/fixtures", name);
      if (lstatSync(file).isSymbolicLink() || createHash("sha256").update(readFileSync(file)).digest("hex") !== hash)
        reject("HISTORICAL_CONTRACT_EVIDENCE_CHANGED", file);
    }
    report.checks.push("pre-native-evidence-preserved");
    const shared = packageBoundary(root);
    report.sourceFiles.push(...shared.map(file => relative(root, file)));
    report.checks.push("shared-exports", "shared-import-closure", "shared-no-dom");
    const forwards = webContractForwards(root, shared);
    const wire = join(root, "packages/shared-core/src/api-contracts.ts");
    report.sourceFiles.push(...forwards.map(file => relative(root, file)));
    report.checks.push("web-contract-forwards");
    report.checks.push("wire-no-dom");
    const fixture = join(root, "tests/fixtures/api-v1-initial-native-compatibility.ts");
    typecheck([fixture, wire], "WIRE_COMPATIBILITY");
    report.checks.push("v1-response-and-request-types");
    if (requests) {
      const currentModule = await import(pathToFileURL(wire).href);
      const { apiContracts, API_VERSION } = currentModule;
      const baseline = readJson(join(root, "tests/fixtures/api-v1-initial-native-requests.json"));
      if (baseline.baseline !== baselineId) reject("WIRE_BASELINE_CHANGED", fixture);
      if (API_VERSION !== baseline.apiVersion) reject("WIRE_VERSION_CHANGED", wire);
      for (const [name, previous] of Object.entries(baseline.operations)) {
        const current = apiContracts[name];
        if (!current || current.method !== previous.method || current.path !== previous.path) reject("WIRE_ENDPOINT_CHANGED", wire);
        for (const part of ["params", "query", "body"]) {
          try { assert.deepEqual(current[part].parse(previous[part]), previous[part]); }
          catch { reject("WIRE_REQUEST_INCOMPATIBLE", wire); }
        }
      }
      report.checks.push("v1-request-values-and-endpoints");
      // These public primitives are used in responses as well as requests.
      // Widening their output domain can break an installed strict decoder even
      // when the TypeScript field remains a string. Keep explicit frozen probes.
      for (const [name, previous] of Object.entries(baseline.responsePrimitives)) {
        const current = currentModule[name];
        if (!current || typeof current.parse !== "function") reject("WIRE_RESPONSE_PRIMITIVE_MISSING", wire);
        const maximum = previous.character.repeat(previous.maximumLength);
        try { assert.equal(current.parse(maximum), maximum); }
        catch { reject("WIRE_REQUEST_PRIMITIVE_NARROWED", wire); }
        const rejected = [...previous.rejected, previous.character.repeat(previous.maximumLength + 1)];
        for (const value of rejected) {
          let accepted = false;
          try { current.parse(value); accepted = true; } catch { /* Expected by the previous decoder. */ }
          if (accepted) reject("WIRE_RESPONSE_BOUND_CHANGED", wire);
        }
      }
      report.checks.push("v1-response-primitive-bounds");
    }
  } catch (error) {
    report.ok = false;
    report.findings.push({ code: error instanceof BoundaryError ? error.code : "PORTABILITY_CHECK_FAILED",
      ...(error instanceof BoundaryError && error.file ? { file: relative(root, error.file) } : {}) });
  }
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = await checkPortability(resolve(dirname(fileURLToPath(import.meta.url)), ".."));
  console.log(JSON.stringify(report));
  process.exitCode = report.ok ? 0 : 1;
}
