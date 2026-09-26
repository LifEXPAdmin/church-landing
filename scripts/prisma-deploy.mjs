import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import nextEnv from "@next/env";
const { loadEnvConfig } = nextEnv;

const hosted = (env) => Boolean(env.VERCEL || env.VERCEL_ENV);
const production = (env) =>
  env.VERCEL === "1" && env.VERCEL_ENV === "production";

export function runPrismaDeploy({
  env = process.env,
  cwd = process.cwd(),
  loadEnvironment = loadEnvConfig,
  spawn = spawnSync,
  reportError = console.error
} = {}) {
  const initiallyHosted = hosted(env);
  const denied = () => {
    reportError(
      "Hosted Prisma migrations require VERCEL=1 and VERCEL_ENV=production."
    );
    return 1;
  };
  // Reject before reading local credentials. A loader cannot downgrade a hosted
  // process to the local operator path by clearing its original identity.
  if (initiallyHosted && !production(env)) return denied();

  let loadFailed = false;
  try {
    loadEnvironment(cwd, undefined, {
      info() {},
      error() {
        loadFailed = true;
      }
    });
  } catch {
    loadFailed = true;
  }
  if (loadFailed) {
    reportError("Prisma migration environment loading failed.");
    return 1;
  }
  if ((initiallyHosted || hosted(env)) && !production(env)) return denied();

  env.DIRECT_URL =
    env.DIRECT_URL ||
    env.DATABASE_URL_UNPOOLED ||
    env.POSTGRES_URL_NON_POOLING ||
    env.POSTGRES_PRISMA_URL ||
    env.POSTGRES_URL ||
    env.DATABASE_URL;

  try {
    const result = spawn("npx", ["prisma", "migrate", "deploy"], {
      stdio: "inherit",
      env
    });
    if (!result.error && result.status === 0) return 0;
    reportError("Prisma migration command failed.");
    return result.error ? 1 : (result.status ?? 1);
  } catch {
    reportError("Prisma migration command failed.");
    return 1;
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  process.exitCode = runPrismaDeploy();
}
