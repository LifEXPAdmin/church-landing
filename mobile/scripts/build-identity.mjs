import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import config from "../app.config.js";

const script = fileURLToPath(import.meta.url);
const website = resolve(dirname(script), "../..");

/** Only public, bounded provenance leaves this process. No paths/status text. */
export function mobileBuildEnv() {
  const run = (args) => execFileSync("git", args, { cwd: website, encoding: "utf8", maxBuffer: 1024 * 1024 }).trim();
  const sourceBase = run(["rev-parse", "HEAD"]);
  const sourceState = run(["status", "--porcelain=v1", "--untracked-files=normal"]) ? "modified" : "clean";
  const selected = config();
  if (!/^[a-f0-9]{40}$/.test(sourceBase) || !/^\d{1,4}\.\d{1,4}\.\d{1,4}$/.test(selected.version)
    || !["development", "staging"].includes(selected.extra.variant)) throw new Error("Mobile build identity is unavailable.");
  return {
    // Pin the same selection before Expo loads dotenv in the child process.
    APP_VARIANT: selected.extra.variant,
    EXPO_PUBLIC_APP_VERSION: selected.version,
    EXPO_PUBLIC_APP_VARIANT: selected.extra.variant,
    EXPO_PUBLIC_SOURCE_BASE: sourceBase,
    EXPO_PUBLIC_SOURCE_STATE: sourceState
  };
}

// Values are validated single-line ASCII before use in the hosted runner's env file.
if (process.argv[1] && resolve(process.argv[1]) === script) {
  for (const [name, value] of Object.entries(mobileBuildEnv())) console.log(`${name}=${value}`);
}
