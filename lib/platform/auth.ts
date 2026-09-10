import { randomBytes, scrypt, timingSafeEqual, createHash } from "node:crypto";

// Preserve the original 8..128 UTF-16 character policy, including Unicode.
export function validatePassword(password: unknown): string | null {
  if (
    typeof password !== "string" ||
    password.length < 8 ||
    password.length > 128
  ) {
    return "Use a password between 8 and 128 characters.";
  }
  return null;
}

const LEGACY = { N: 16384, r: 8, p: 1, maxmem: 32 * 1024 * 1024 };
const CURRENT = { N: 131072, r: 8, p: 1, maxmem: 160 * 1024 * 1024 };
function derive(password: string, salt: string, legacy: boolean) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, 64, legacy ? LEGACY : CURRENT, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

export async function hashPassword(password: string) {
  if (validatePassword(password)) throw new Error("Invalid password input");
  const salt = randomBytes(16).toString("hex");
  return `scrypt-v2:${salt}:${(await derive(password, salt, false)).toString("hex")}`;
}

export function usablePasswordHash(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^scrypt(?:-v2)?:[a-f0-9]{32}:[a-f0-9]{128}$/.test(value)
  );
}

export async function verifyPassword(
  password: unknown,
  storedHash: string | null
) {
  if (validatePassword(password)) return false;
  const parts = storedHash?.split(":") ?? [];
  const [prefix, salt, hash] = parts;
  const valid = usablePasswordHash(storedHash);
  // Unknown accounts still perform bounded password work, with the same public result.
  const key = await derive(
    password as string,
    valid ? salt : "0".repeat(32),
    valid && prefix === "scrypt"
  );
  return Boolean(valid && timingSafeEqual(key, Buffer.from(hash, "hex")));
}

export function createSessionToken() {
  return randomBytes(32).toString("base64url");
}
export function validToken(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);
}
export function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
