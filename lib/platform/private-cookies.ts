import "server-only";
import { cookies, headers } from "next/headers";
import {
  ACCOUNT_SESSION_COOKIE,
  accountSessionCookie,
  isAccountSessionCookieName
} from "./account-cookies";

// Next's development RSC diagnostics can serialize resolved request stores.
// Redact both stores before any component awaits the result. This does
// not change HTTP cookie serialization. Ambiguous session reads fail closed.
// Account readers must still return only their explicitly selected public DTO.
export function privateCookies() {
  return Promise.all([cookies(), headers()]).then(([store, requestHeaders]) => {
    Object.defineProperty(requestHeaders, "toJSON", {
      configurable: true,
      value: () => "[private request headers]"
    });
    Object.defineProperty(store, "toJSON", {
      configurable: true,
      value: () => "[private request cookies]"
    });
    const token = accountSessionCookie(requestHeaders.get("cookie"));
    const selected = token
      ? { name: ACCOUNT_SESSION_COOKIE, value: token }
      : undefined;
    // Keep all current server readers consistent with the HTTP boundary. Do not
    // mutate the framework's store or revoke either account's valid sessions.
    return new Proxy(store, {
      get(target, property) {
        if (property === "get")
          return (name: string | { name: string }) =>
            (typeof name === "string" ? name : name.name) ===
            ACCOUNT_SESSION_COOKIE
              ? selected
              : isAccountSessionCookieName(
                    typeof name === "string" ? name : name.name
                  )
                ? undefined
                : target.get(typeof name === "string" ? name : name.name);
        if (property === "getAll")
          return (name?: string | { name: string }) =>
            name === undefined
              ? [
                  ...target
                    .getAll()
                    .filter(
                      (cookie) => !isAccountSessionCookieName(cookie.name)
                    ),
                  ...(selected ? [selected] : [])
                ]
              : (typeof name === "string" ? name : name.name) ===
                  ACCOUNT_SESSION_COOKIE
                ? selected
                  ? [selected]
                  : []
                : isAccountSessionCookieName(
                      typeof name === "string" ? name : name.name
                    )
                  ? []
                  : target.getAll(typeof name === "string" ? name : name.name);
        if (property === "has")
          return (name: string) =>
            name === ACCOUNT_SESSION_COOKIE
              ? Boolean(selected)
              : !isAccountSessionCookieName(name) && target.has(name);
        if (property === Symbol.iterator)
          return function* () {
            for (const entry of target)
              if (!isAccountSessionCookieName(entry[0])) yield entry;
            if (selected) yield [ACCOUNT_SESSION_COOKIE, selected];
          };
        const value = Reflect.get(target, property, target);
        return typeof value === "function" ? value.bind(target) : value;
      }
    });
  });
}
