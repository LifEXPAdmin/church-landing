import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Download the pinned public source separately, inspect it, then pass its path.
// This maintenance command never downloads anything or reads account data.
const source = process.argv[2];
assert.ok(source, "Pass the reviewed SecLists source file");
const bytes = readFileSync(source);
const digest = (value) => createHash("sha256").update(value).digest("hex");
const sourceSha256 =
  "1472aafa2561df5e3293aee252aee3ca660c12b399a283cf808bb01b39be388b";
assert.equal(
  digest(bytes),
  sourceSha256,
  "Review a source change before updating"
);
const entries = new Set();
let inspectedLines = 0;
for (const password of bytes.toString("utf8").split(/\r?\n/)) {
  inspectedLines++;
  if (password.length < 8 || password.length > 128) continue;
  entries.add(digest(password.normalize("NFKC").toLowerCase().trim()));
  if (entries.size === 10000) break;
}
assert.equal(entries.size, 10000);
const output = {
  source:
    "https://raw.githubusercontent.com/danielmiessler/SecLists/c5a05259b61cc60dee828ad1bf92c288c7e97ea0/Passwords/Common-Credentials/xato-net-10-million-passwords-100000.txt",
  sourceSha256,
  license: "MIT; third-party/seclists-passwords-LICENSE.txt",
  inspectedLines,
  count: entries.size,
  comparison:
    "SHA-256 of NFKC, lowercase, trimmed whole password; UTF-16 length 8 to 128",
  hashes: [...entries].sort()
};
writeFileSync(
  fileURLToPath(
    new URL("../lib/platform/password-blocklist.json", import.meta.url)
  ),
  JSON.stringify(output, null, 2) + "\n"
);
console.log(
  `Wrote ${entries.size} distinct local checks from ${inspectedLines} ranked source entries.`
);
