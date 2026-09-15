import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Verify emitted code, not only installed dependency bytes: Next treats its
// package as managed input and can restore an older renderer from build cache.
// This exact host-replay shape belongs to the checksum-pinned Next backport.
const repairedReplay =
  /case 5:([\w$]+)\(([\w$]+)\),\2===([\w$]+)&&\(([\w$]+)\?\(([\w$]+)\(\2\),null!=\2\.stateNode&&\(([\w$]+)=\2\.stateNode\)\):\(\5\(\2\),\4=!0\)\);default:/;
const staleReplay =
  /case 15:case 0:[^{}]{0,250}?case 11:[^{}]{0,250}?case 5:[\w$]+\([\w$]+\);default:/;

export function verifyHydrationOutput(build) {
  const manifest = JSON.parse(
    readFileSync(resolve(build, "app-build-manifest.json"), "utf8")
  );
  const files = [...new Set(Object.values(manifest.pages).flat())];
  const repaired = [];
  // Pages Router's separate framework bundle is not an App Router input. Check
  // the actual application manifest, including not-found and error entries.
  for (const file of files) {
    assert.equal(typeof file, "string");
    if (!file.endsWith(".js")) continue;
    assert.ok(
      file.startsWith("static/chunks/") && !file.split(/[\\/]/).includes("..")
    );
    const bytes = readFileSync(resolve(build, file));
    const text = bytes.toString("utf8");
    assert.ok(
      !staleReplay.test(text),
      `Stale host hydration renderer: ${file}`
    );
    if (repairedReplay.test(text))
      repaired.push({
        file,
        bytes: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex")
      });
  }
  assert.ok(
    repaired.length,
    "Built client lacks the verified host hydration repair"
  );
  return repaired;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  console.log(
    "Built hydration repair verified: " +
      JSON.stringify(verifyHydrationOutput(resolve(".next")))
  );
