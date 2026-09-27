import { createHash } from "node:crypto";
import blocklist from "./password-blocklist.json" with { type: "json" };
import { AccountError } from "./account-error";
import { validatePassword } from "./auth";

// Server-only, bounded and offline. These are public corpus hashes, never user
// credentials. Comparison normalization does not alter the password being hashed.
const commonPasswords = new Set(blocklist.hashes);
const productTerms = [
  "godschurches",
  "godschurchescom",
  "godschurchesplatform",
  "churchplatform",
  "churchlanding"
];
type PasswordContext = { name: string; username: string; email: string };
const fold = (value: string) => value.normalize("NFKC").toLowerCase().trim();
const compact = (value: string) => fold(value).replace(/[^\p{L}\p{N}]/gu, "");
const withoutNumbers = (value: string) =>
  value.replace(/^\p{N}+|\p{N}+$/gu, "");
const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");

export function validateNewPassword(
  password: unknown,
  context: PasswordContext
): "invalid" | "password-unsafe" | null {
  if (validatePassword(password)) return "invalid";
  const proposed = password as string;
  const normalized = fold(proposed);
  const compressed = compact(proposed);
  if (
    commonPasswords.has(digest(normalized)) ||
    (compressed && commonPasswords.has(digest(compressed)))
  )
    return "password-unsafe";

  // Match the whole candidate or its numeric wrappers, not words inside a long
  // passphrase. Use only the current account's values, never other people's data.
  const terms = [
    ...productTerms,
    context.name,
    context.username,
    context.email,
    context.email.split("@")[0]
  ];
  for (const term of terms) {
    const complete = compact(term);
    for (const value of [complete, withoutNumbers(complete)]) {
      if (value.length < 2) continue;
      const at = compressed.indexOf(value);
      if (
        at >= 0 &&
        /^\p{N}*$/u.test(compressed.slice(0, at)) &&
        /^\p{N}*$/u.test(compressed.slice(at + value.length))
      )
        return "password-unsafe";
    }
  }
  return null;
}

// Call only for a newly chosen password. Legacy authentication and credential
// confirmation deliberately retain exact verification of the existing password.
export function requireNewPassword(
  password: unknown,
  context: PasswordContext
) {
  const problem = validateNewPassword(password, context);
  if (problem) throw new AccountError(problem);
}
