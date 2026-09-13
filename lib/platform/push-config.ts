import { createECDH } from "node:crypto";

export function pushServerConfig() {
  if (process.env.PUSH_ENABLED !== "true") return null;
  const publicKey = process.env.PUSH_VAPID_PUBLIC_KEY ?? "";
  const privateKey = process.env.PUSH_VAPID_PRIVATE_KEY ?? "";
  const subject = process.env.PUSH_VAPID_SUBJECT ?? "";
  if (
    !/^[\w-]{87}$/.test(publicKey) ||
    !/^[\w-]{43}$/.test(privateKey) ||
    !/^(https:\/\/[^\s]+|mailto:[^\s@]+@[^\s@]+)$/.test(subject)
  )
    return null;
  try {
    const pair = createECDH("prime256v1");
    pair.setPrivateKey(Buffer.from(privateKey, "base64url"));
    if (pair.getPublicKey().toString("base64url") !== publicKey) return null;
    return { publicKey, privateKey, subject };
  } catch {
    return null;
  }
}
export const pushAvailable = () => !!pushServerConfig();
