import { validToken } from "./auth";
import type { GoogleCredential } from "./account-credential";

export const googleCookieKinds = [
  "browser",
  "signup",
  "reactivate",
  "recent",
  "email"
] as const;
export type GoogleCookieKind = (typeof googleCookieKinds)[number];
export function googleCookieName(kind: GoogleCookieKind, secure: boolean) {
  return `${secure ? "__Host-" : ""}gc_google_${kind}`;
}
export function googleCookie(
  kind: GoogleCookieKind,
  token: string,
  secure: boolean,
  seconds = 600
) {
  if (token && !validToken(token)) throw new Error("Invalid account cookie");
  return `${googleCookieName(kind, secure)}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${token ? seconds : 0}${secure ? "; Secure" : ""}`;
}
export function googleRequestToken(
  request: Request,
  kind: GoogleCookieKind,
  secure: boolean
) {
  const prefix = googleCookieName(kind, secure) + "=";
  const entries = request.headers
    .get("cookie")
    ?.split(";")
    .map((entry) => entry.trim())
    .filter((entry) => entry.startsWith(prefix));
  if (entries?.length !== 1) return undefined;
  const token = entries[0].slice(prefix.length);
  return validToken(token) ? token : undefined;
}
export function clearGoogleCookies(
  response: Response,
  secure: boolean,
  replacing: GoogleCookieKind[] = []
) {
  for (const kind of googleCookieKinds)
    if (!replacing.includes(kind))
      response.headers.append("Set-Cookie", googleCookie(kind, "", secure));
}
// Explicitly selected Google confirmation comes only from an HttpOnly cookie.
// The account service still checks owner, session, action, expiry and one-use.
export function requestAccountCredential(
  request: Request,
  body: Record<string, unknown>,
  secure: boolean
): unknown {
  if (body.credentialMethod !== "google") return body.currentPassword;
  const token = googleRequestToken(request, "recent", secure);
  return {
    kind: "google-reauth",
    token: token ?? ""
  } satisfies GoogleCredential;
}
