import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const mobile = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const root = resolve(mobile, "..");
const web = JSON.parse(readFileSync(join(root, "tsconfig.json"), "utf8"));
assert(web.exclude.includes("mobile"), "Website TypeScript must exclude the mobile project.");
assert(readFileSync(join(root, "eslint.config.mjs"), "utf8").includes('"mobile/**"'));
assert(readFileSync(join(root, ".vercelignore"), "utf8").split("\n").includes("mobile"));
assert(!JSON.parse(readFileSync(join(root, "package.json"), "utf8")).workspaces, "No implicit root workspace conversion.");
const allowed = new Set(["react", "react-native", "expo", "expo/fetch", "expo-status-bar", "expo-linking", "expo-secure-store", "react-native-safe-area-context"]);
let count = 0;
function inspect(path) {
  const source = readFileSync(path, "utf8");
  for (const match of source.matchAll(/(?:from\s+|import\s*)["']([^"']+)["']/g)) {
    const name = match[1];
    assert(name.startsWith(".") || allowed.has(name), "Unreviewed mobile runtime import: " + name);
    assert(!/\/lib\/|prisma|next\/|node:/.test(name), "Server runtime import in mobile source.");
  }
  assert(!/process\.env\.(?!EXPO_PUBLIC_)[A-Z_]+/.test(source), "Private environment access in mobile source.");
  count++;
}
function walk(path) { for (const item of readdirSync(path, { withFileTypes: true })) {
  const child = join(path, item.name);
  if (item.isDirectory()) walk(child); else if (/\.tsx?$/.test(item.name)) inspect(child);
} }
walk(join(mobile, "src")); inspect(join(mobile, "App.tsx")); inspect(join(mobile, "index.ts"));
console.log("Mobile boundary check passed for " + count + " authored modules.");
