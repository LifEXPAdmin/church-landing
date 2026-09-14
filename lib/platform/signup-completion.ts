import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const SECONDS = 24 * 60 * 60;
export function signupCompletionCookieName(secure: boolean) {
  return `${secure ? "__Host-" : ""}gc_signup_completion`;
}
function signature(secret: string, accountId: string, time: string) {
  return createHmac("sha256", secret)
    .update(`signup-completion-v1:${accountId}:${time}`)
    .digest("base64url");
}

// Presentation proof only: never a session, verification grant or consent.
// Both new and duplicate registrations set the same-shaped opaque cookie.
// Nothing in the anonymous response discloses whether an email already exists.
export function signupCompletionCookie(
  accountId: string | undefined,
  secret: string,
  secure: boolean,
  now = Date.now()
) {
  const time = String(now);
  const proof = signature(
    secret,
    accountId ?? randomBytes(32).toString("base64url"),
    time
  );
  return `${signupCompletionCookieName(secure)}=${time}.${proof}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SECONDS}${secure ? "; Secure" : ""}`;
}

export function confirmedSignup(
  value: unknown,
  accountId: string,
  secret: string,
  now = Date.now()
) {
  if (typeof value !== "string" || !/^\d{13}\.[A-Za-z0-9_-]{43}$/.test(value))
    return false;
  const [time, actual] = value.split(".");
  const age = now - Number(time);
  return (
    age >= 0 &&
    age < SECONDS * 1000 &&
    timingSafeEqual(
      Buffer.from(actual),
      Buffer.from(signature(secret, accountId, time))
    )
  );
}
