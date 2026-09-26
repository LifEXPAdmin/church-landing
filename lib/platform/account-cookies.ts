import { validToken } from "./auth";

export const ACCOUNT_SESSION_COOKIE = "church_platform_session";

// Read the original header: cookie stores can collapse duplicate names before
// readers agree on which account is acting. Ambiguity must never choose one.
export function accountSessionCookie(header: string | null) {
  const values = header
    ?.split(";")
    .map((entry) => entry.trim())
    .filter(
      (entry) => entry.split("=", 1)[0].trim() === ACCOUNT_SESSION_COOKIE
    );
  if (
    values?.length !== 1 ||
    !values[0].startsWith(ACCOUNT_SESSION_COOKIE + "=")
  )
    return undefined;
  const token = values[0].slice(ACCOUNT_SESSION_COOKIE.length + 1);
  return validToken(token) ? token : undefined;
}
