import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const secretNames = [
  "DATABASE_URL",
  "DIRECT_URL",
  "AUTH_RATE_LIMIT_SECRET",
  "RESEND_API_KEY",
  "BLOB_READ_WRITE_TOKEN",
  "CRON_SECRET",
  "PUSH_VAPID_PRIVATE_KEY",
  "ADMIN_PASSWORD",
  "GOOGLE_CLIENT_SECRET",
  "MAILERLITE_API_KEY",
  "ANALYTICS_SALT",
  "DATABASE_URL_UNPOOLED",
  "POSTGRES_URL_NO_SSL",
  "POSTGRES_URL_NON_POOLING",
  "POSTGRES_PRISMA_URL",
  "POSTGRES_URL",
  "PGPASSWORD",
  "POSTGRES_PASSWORD",
  "VERCEL_AUTOMATION_BYPASS_SECRET"
];
const privateDirectories = new Set([
  ".account-test",
  ".git",
  "node_modules",
  ".vercel"
]);
const dependencyFields = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies"
];
const sourceExtension = /\.(?:[cm]?[jt]s|[jt]sx|mdx)$/i;

function secretPatterns(env) {
  return secretNames.flatMap((key) => {
    const value = env[key];
    if (typeof value !== "string" || value.length < 16) return [];
    const variants = new Set([value, JSON.stringify(value).slice(1, -1)]);
    // Malformed Unicode still receives raw and JSON checks, without exposing it.
    try {
      variants.add(encodeURIComponent(value));
      variants.add(encodeURI(value));
    } catch {
      /* Encoding is unavailable for an unpaired surrogate. */
    }
    return [{ key, variants: [...variants] }];
  });
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function registryUrl(value) {
  if (typeof value !== "string" || /[\s?\\#]/.test(value)) return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname === "registry.npmjs.org" &&
      !url.port &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}

function strongIntegrity(value) {
  if (typeof value !== "string" || !/^sha512-[A-Za-z0-9+/]{86}==$/.test(value))
    return false;
  const encoded = value.slice(7);
  const digest = Buffer.from(encoded, "base64");
  return digest.length === 64 && digest.toString("base64") === encoded;
}

function privateArtifact(path) {
  const parts = path.toLowerCase().split("/");
  const name = parts.at(-1);
  return (
    parts.some((part) => privateDirectories.has(part)) ||
    (name.startsWith(".env") && name !== ".env.example") ||
    /\.(?:pem|key|p12|pfx|jks|keystore|pkcs12|der)$/.test(name)
  );
}

/** A bounded guard, not an exhaustive credential or deployed-provider audit.
 * Source mode reads only tracked manifests and authored app/components/lib code.
 * Build mode deliberately needs no Git metadata and reads only .next/static.
 * Environment files are never loaded; supplied eligible secret coverage is counted.
 */
export function verifySourceSecurity({
  cwd = process.cwd(),
  build = false,
  env = process.env
} = {}) {
  const patterns = secretPatterns(env);
  const report = {
    ok: true,
    mode: build ? "build" : "source",
    counts: {
      trackedFiles: 0,
      authoredFiles: 0,
      lockedPackages: 0,
      publicBuildFiles: 0,
      suppliedSecretKeys: build ? patterns.length : 0
    },
    findings: []
  };
  const redact = (value) => {
    let result = value;
    for (const { variants } of patterns) {
      for (const variant of variants)
        result = result.split(variant).join("[REDACTED]");
    }
    return result;
  };
  const add = (code, path, key) => {
    const finding = {
      code,
      ...(path ? { path: redact(path) } : {}),
      ...(key ? { key: redact(key) } : {})
    };
    if (
      !report.findings.some((previous) => isDeepStrictEqual(previous, finding))
    )
      report.findings.push(finding);
    report.ok = false;
  };
  try {
    const root = realpathSync(cwd);
    // Reject symlinks in every path component before reading selected files.
    const inspect = (path, missingCode) => {
      const parts = path.split("/");
      if (parts.some((part) => !part || part === "." || part === "..")) {
        add("PATH_INVALID", path);
        return null;
      }
      try {
        let current = root;
        let info;
        for (const part of parts) {
          current = join(current, part);
          info = lstatSync(current);
          if (info.isSymbolicLink()) {
            add("SYMLINK_DISALLOWED", path);
            return null;
          }
        }
        return info;
      } catch {
        add(missingCode, path);
        return null;
      }
    };
    const read = (path) => {
      const info = inspect(path, "FILE_UNREADABLE");
      if (!info) return null;
      if (!info.isFile()) {
        add("FILE_TYPE_INVALID", path);
        return null;
      }
      try {
        return readFileSync(join(root, path));
      } catch {
        add("FILE_UNREADABLE", path);
        return null;
      }
    };

    if (build) {
      const info = inspect(".next/static", "BUILD_MISSING");
      if (!info) return report;
      if (!info.isDirectory()) {
        add("BUILD_MISSING", ".next/static");
        return report;
      }
      const visit = (directory) => {
        let entries;
        try {
          entries = readdirSync(join(root, directory), { withFileTypes: true });
        } catch {
          add("BUILD_UNREADABLE", directory);
          return;
        }
        for (const entry of entries) {
          const path = directory + "/" + entry.name;
          if (entry.isSymbolicLink()) {
            add("SYMLINK_DISALLOWED", path);
            continue;
          }
          if (entry.isDirectory()) {
            visit(path);
            continue;
          }
          const bytes = read(path);
          if (!bytes) continue;
          report.counts.publicBuildFiles += 1;
          if (
            /\.map$/i.test(path) ||
            (/\.(?:[cm]?js|css)$/i.test(path) &&
              /(?:\/\/[#@]|\/\*[#@])\s*sourceMappingURL\s*=/.test(
                bytes.toString("utf8")
              ))
          ) {
            add("PUBLIC_SOURCE_MAP", path);
          }
          for (const { key, variants } of patterns) {
            if (variants.some((value) => bytes.includes(Buffer.from(value))))
              add("PUBLIC_SECRET_VALUE", path, key);
          }
        }
      };
      visit(".next/static");
      if (!report.counts.publicBuildFiles)
        add("BUILD_OUTPUT_EMPTY", ".next/static");
      return report;
    }

    const git = (args) =>
      execFileSync("git", args, {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        maxBuffer: 32 * 1024 * 1024
      });
    let tracked;
    try {
      if (realpathSync(git(["rev-parse", "--show-toplevel"]).trim()) !== root) {
        add("GIT_ROOT_REQUIRED");
        return report;
      }
      tracked = [
        ...new Set(git(["ls-files", "-z"]).split("\0").filter(Boolean))
      ];
    } catch {
      add("GIT_ROOT_REQUIRED");
      return report;
    }
    const trackedSet = new Set(tracked);
    report.counts.trackedFiles = tracked.length;
    for (const path of tracked) {
      if (privateArtifact(path)) {
        add("TRACKED_PRIVATE_ARTIFACT", path);
        continue;
      }
      if (
        !/^(?:app|components|lib)\//.test(path) ||
        !sourceExtension.test(path)
      )
        continue;
      const bytes = read(path);
      if (!bytes) continue;
      report.counts.authoredFiles += 1;
      const names = new Set(
        bytes.toString("utf8").match(/\bNEXT_PUBLIC_[A-Za-z0-9_]+\b/g) || []
      );
      for (const key of names)
        if (key !== "NEXT_PUBLIC_SITE_URL")
          add("PUBLIC_ENV_NOT_ALLOWED", path, key);
    }
    const json = (path) => {
      if (!trackedSet.has(path)) {
        add("TRACKED_MANIFEST_REQUIRED", path);
        return null;
      }
      const bytes = read(path);
      if (!bytes) return null;
      try {
        const value = JSON.parse(bytes.toString("utf8"));
        if (isObject(value)) return value;
      } catch {
        /* Parser messages may contain file contents. Never return them. */
      }
      add("JSON_INVALID", path);
      return null;
    };
    const manifest = json("package.json");
    const lock = json("package-lock.json");
    if (!manifest || !lock) return report;
    if (
      lock.lockfileVersion !== 3 ||
      !isObject(lock.packages) ||
      !isObject(lock.packages[""])
    ) {
      add("LOCKFILE_V3_REQUIRED", "package-lock.json");
      return report;
    }
    const lockRoot = lock.packages[""];
    if (
      lock.name !== manifest.name ||
      lock.version !== manifest.version ||
      lockRoot.name !== manifest.name ||
      lockRoot.version !== manifest.version ||
      dependencyFields.some(
        (field) =>
          !isDeepStrictEqual(manifest[field] ?? {}, lockRoot[field] ?? {})
      )
    ) {
      add("LOCK_ROOT_MISMATCH", "package-lock.json");
    }
    for (const field of [
      "dependencies",
      "devDependencies",
      "optionalDependencies"
    ]) {
      if (manifest[field] !== undefined && !isObject(manifest[field])) {
        add("DEPENDENCY_METADATA_INVALID", "package.json");
        continue;
      }
      for (const name of Object.keys(manifest[field] ?? {})) {
        if (!isObject(lock.packages["node_modules/" + name]))
          add("LOCK_DIRECT_DEPENDENCY_MISSING", "package-lock.json");
      }
    }
    for (const [path, entry] of Object.entries(lock.packages)) {
      if (!path) continue;
      report.counts.lockedPackages += 1;
      if (!isObject(entry) || !registryUrl(entry.resolved))
        add("LOCK_REGISTRY_UNTRUSTED", "package-lock.json");
      if (!isObject(entry) || !strongIntegrity(entry.integrity))
        add("LOCK_INTEGRITY_INVALID", "package-lock.json");
    }
  } catch {
    add("CHECK_FAILED");
  }
  return report;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const args = process.argv.slice(2);
  const report =
    args.length === 0 || (args.length === 1 && args[0] === "--build")
      ? verifySourceSecurity({ build: args[0] === "--build" })
      : {
          ok: false,
          mode: "invalid",
          counts: {},
          findings: [{ code: "ARGUMENT_INVALID" }]
        };
  console.log(JSON.stringify(report));
  process.exitCode = report.ok ? 0 : 1;
}
