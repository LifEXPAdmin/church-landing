import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;
const PASSWORD_PREFIX = "scrypt";

export function validatePassword(password: string) {
  if (password.length < 8) {
    return "Password must be at least 8 characters.";
  }

  if (password.length > 128) {
    return "Password is too long.";
  }

  return null;
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const key = (await scrypt(password, salt, KEY_LENGTH)) as Buffer;

  return `${PASSWORD_PREFIX}:${salt}:${key.toString("hex")}`;
}

export async function verifyPassword(password: string, storedHash: string | null) {
  if (!storedHash) {
    return false;
  }

  const [prefix, salt, hash] = storedHash.split(":");

  if (prefix !== PASSWORD_PREFIX || !salt || !hash) {
    return false;
  }

  const key = (await scrypt(password, salt, KEY_LENGTH)) as Buffer;
  const saved = Buffer.from(hash, "hex");

  if (key.length !== saved.length) {
    return false;
  }

  return timingSafeEqual(key, saved);
}

export function createSessionToken() {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
