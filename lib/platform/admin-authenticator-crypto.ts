import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  hkdfSync,
  randomBytes
} from "node:crypto";
import { generateSync, verifySync } from "@otplib/totp";
import { NodeCryptoPlugin } from "@otplib/plugin-crypto-node";
import { ScureBase32Plugin } from "@otplib/plugin-base32-scure";
import { accountConfig } from "./account-config";
import { PortalError } from "./portal-policy";
const crypto = new NodeCryptoPlugin();
const base32 = new ScureBase32Plugin();
export function authenticatorSecret() {
  return randomBytes(20);
}
export function authenticatorBase32(value: Buffer) {
  return base32.encode(value);
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
// Maintained RFC 6238 implementation. Keep the existing encrypted factor format
// and six-digit/30-second enrollment compatible; no new account provider.
export function authenticatorTotp(secret: Buffer, counter: bigint, digits = 6) {
  if (digits !== 6 && digits !== 8) throw Error("Unsupported authenticator digits");
  return generateSync({ secret, epoch: Number(counter) * 30, digits, crypto });
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
  const current = Math.floor(now / 30000);
  const result = lastCounter >= BigInt(current + 1)
    ? { valid: false as const }
    : verifySync({
        secret, token: code, epoch: now / 1000, epochTolerance: 30, crypto,
        ...(lastCounter >= BigInt(0) ? { afterTimeStep: Number(lastCounter) } : {})
      });
  if (!result.valid)
    throw new PortalError(
      400,
      "That authenticator code is invalid or already used. Wait for the next code and try again."
    );
  return BigInt(result.timeStep);
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
