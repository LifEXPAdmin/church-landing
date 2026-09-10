import "server-only";
import { cookies } from "next/headers";

// Next's development RSC diagnostics can serialize the resolved cookie store.
// Redact JSON serialization before any component awaits its result. This does
// not change cookie reads, writes, iteration, or HTTP cookie serialization.
// Account readers must still return only their explicitly selected public DTO.
export function privateCookies() {
  return cookies().then((store) => {
    Object.defineProperty(store, "toJSON", {
      configurable: true,
      value: () => "[private request cookies]"
    });
    return store;
  });
}
