import { validToken } from "./auth";
import { accountOrigin } from "./account-config";

// A logical name retained for existing server readers and local HTTP fixtures.
export const ACCOUNT_SESSION_COOKIE = "church_platform_session";
export const ACCOUNT_SECURE_SESSION_COOKIE = "__Host-church_platform_session";
// New HTTPS issuance must be deployed before 29 September 2026 UTC. Existing
// sessions have an absolute 30-day expiry; accepting their old name neither
// extends that expiry nor promotes a cookie from a delayed background response.
export const LEGACY_SECURE_SESSION_ENDS_AT = "2026-10-29T00:00:00.000Z";

type SessionCookiePolicy = { secure: boolean; now?: number };

export function sessionCookieName(secure: boolean) {
  return secure ? ACCOUNT_SECURE_SESSION_COOKIE : ACCOUNT_SESSION_COOKIE;
}

export function isAccountSessionCookieName(name: string) {
  return (
    name === ACCOUNT_SESSION_COOKIE || name === ACCOUNT_SECURE_SESSION_COOKIE
  );
}

// Read the original header: cookie stores can collapse duplicate names before
// readers agree on which account is acting. Ambiguity must never choose one.
function selectSessionCookie(
  header: string | null,
  policy?: SessionCookiePolicy
) {
  const secure = policy?.secure ?? accountOrigin().protocol === "https:";
  const legacy =
    !secure ||
    (policy?.now ?? Date.now()) < Date.parse(LEGACY_SECURE_SESSION_ENDS_AT);
  const entries = (header?.split(";") ?? [])
    .map((entry) => entry.trim())
    .map((entry) => {
      const name = entry.split("=", 1)[0].trim();
      return {
        name,
        token: entry.startsWith(name + "=")
          ? entry.slice(name.length + 1)
          : undefined
      };
    })
    .filter(
      ({ name }) =>
        (secure && name === ACCOUNT_SECURE_SESSION_COOKIE) ||
        (legacy && name === ACCOUNT_SESSION_COOKIE)
    );
  const names = new Set(entries.map((entry) => entry.name));
  const duplicate = names.size !== entries.length;
  const conflicting =
    entries.length > 1 &&
    entries.some(
      (entry) => !validToken(entry.token) || entry.token !== entries[0].token
    );
  const ambiguous = duplicate || conflicting;
  return {
    ambiguous,
    token:
      !ambiguous && entries.length > 0 && validToken(entries[0].token)
        ? entries[0].token
        : undefined
  };
}

export function ambiguousAccountSessionCookie(
  header: string | null,
  policy?: SessionCookiePolicy
) {
  return selectSessionCookie(header, policy).ambiguous;
}

export function accountSessionCookie(
  header: string | null,
  policy?: SessionCookiePolicy
) {
  return selectSessionCookie(header, policy).token;
}
