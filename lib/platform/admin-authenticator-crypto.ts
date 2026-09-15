import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  hkdfSync,
  randomBytes,
  timingSafeEqual
} from "node:crypto";
import { accountConfig } from "./account-config";
import { PortalError } from "./portal-policy";
const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export function authenticatorSecret() {
  return randomBytes(20);
}
export function authenticatorBase32(value: Buffer) {
  let bits = 0,
    pending = 0,
    result = "";
  for (const byte of value) {
    pending = (pending << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      result += alphabet[(pending >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits) result += alphabet[(pending << (5 - bits)) & 31];
  return result;
}
const encryptionKey = (userId: string) =>
  Buffer.from(
    hkdfSync(
      "sha256",
      accountConfig().rateSecret,
      userId,
      "godschurches-admin-authenticator-v1",
      32
    )
  );
export function sealAuthenticator(userId: string, secret: Buffer) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", encryptionKey(userId), iv);
  cipher.setAAD(Buffer.from(userId));
  const encrypted = Buffer.concat([cipher.update(secret), cipher.final()]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url")
  ].join(".");
}
export function openAuthenticator(userId: string, value: string) {
  const [version, iv, tag, encrypted, ...extra] = value.split(".");
  if (version !== "v1" || extra.length || !iv || !tag || !encrypted)
    throw Error("Authenticator protection unavailable");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(userId),
    Buffer.from(iv, "base64url")
  );
  decipher.setAAD(Buffer.from(userId));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted, "base64url")),
    decipher.final()
  ]);
}
// RFC 6238 dynamic truncation. Eight-digit mode is used only by the published
// standard vectors; account enrollment always advertises six digits/30 seconds.
export function authenticatorTotp(secret: Buffer, counter: bigint, digits = 6) {
  const value = Buffer.alloc(8);
  value.writeBigUInt64BE(counter);
  const mac = createHmac("sha1", secret).update(value).digest(),
    offset = mac[mac.length - 1] & 15;
  return String(
    (mac.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits
  ).padStart(digits, "0");
}
export function verifyAuthenticatorCode(
  secret: Buffer,
  code: unknown,
  lastCounter: bigint,
  now = Date.now()
) {
  if (typeof code !== "string" || !/^\d{6}$/.test(code))
    throw new PortalError(
      400,
      "Enter the six-digit code from your authenticator."
    );
  const current = BigInt(Math.floor(now / 30000));
  let match: bigint | null = null;
  for (const delta of [BigInt(-1), BigInt(0), BigInt(1)]) {
    const candidate = current + delta;
    if (
      candidate > lastCounter &&
      candidate >= BigInt(0) &&
      timingSafeEqual(
        Buffer.from(code),
        Buffer.from(authenticatorTotp(secret, candidate))
      )
    )
      match = candidate;
  }
  if (match === null)
    throw new PortalError(
      400,
      "That authenticator code is invalid or already used. Wait for the next code and try again."
    );
  return match;
}
export function authenticatorRecoveryCodes(secret: Buffer, requestKey: string) {
  return Array.from({ length: 8 }, (_, i) =>
    createHmac("sha256", secret)
      .update(`recovery:${requestKey}:${i}`)
      .digest("hex")
      .slice(0, 20)
      .match(/.{1,5}/g)!
      .join("-")
  );
}
export function authenticatorRecoveryHash(userId: string, code: unknown) {
  if (
    typeof code !== "string" ||
    !/^[a-f0-9-]{20,23}$/i.test(code) ||
    code.replaceAll("-", "").length !== 20
  )
    throw new PortalError(403, "Enter one unused recovery code.");
  return createHmac("sha256", accountConfig().rateSecret + ":admin-recovery")
    .update(userId + ":" + code.replaceAll("-", "").toLowerCase())
    .digest("hex");
}
