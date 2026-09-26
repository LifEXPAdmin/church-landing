import "server-only";
import { cookies, headers } from "next/headers";
import {
  ACCOUNT_SESSION_COOKIE,
  accountSessionCookie
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
    if (
      accountSessionCookie(requestHeaders.get("cookie")) ===
      store.get(ACCOUNT_SESSION_COOKIE)?.value
    )
      return store;
    // Keep all current server readers consistent with the HTTP boundary. Do not
    // mutate the framework's store or revoke either account's valid sessions.
    return new Proxy(store, {
      get(target, property) {
        if (property === "get")
          return (name: string | { name: string }) =>
            (typeof name === "string" ? name : name.name) ===
            ACCOUNT_SESSION_COOKIE
              ? undefined
              : target.get(typeof name === "string" ? name : name.name);
        if (property === "getAll")
          return (name?: string | { name: string }) =>
            (name === undefined
              ? target.getAll()
              : target.getAll(typeof name === "string" ? name : name.name)
            ).filter((cookie) => cookie.name !== ACCOUNT_SESSION_COOKIE);
        if (property === "has")
          return (name: string) =>
            name !== ACCOUNT_SESSION_COOKIE && target.has(name);
        if (property === Symbol.iterator)
          return function* () {
            for (const entry of target)
              if (entry[0] !== ACCOUNT_SESSION_COOKIE) yield entry;
          };
        const value = Reflect.get(target, property, target);
        return typeof value === "function" ? value.bind(target) : value;
      }
    });
  });
}
