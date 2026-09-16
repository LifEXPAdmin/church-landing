import { postId } from "./post-input";
import { parseExchangeListQuery } from "./exchange-input";
import { exchangeSearchParams } from "./exchange-options";

/** Only normalized Exchange result pages may be used as a return destination. */
export function exchangeReturnHref(
  value: unknown,
  fallback = "/platform/exchange"
) {
  if (
    typeof value !== "string" ||
    value.length > 3500 ||
    !value.startsWith("/platform/exchange")
  )
    return fallback;
  try {
    const url = new URL(value, "https://exchange.invalid");
    if (
      url.origin !== "https://exchange.invalid" ||
      url.hash ||
      ![
        "/platform/exchange",
        "/platform/exchange/mine",
        "/platform/exchange/saved"
      ].includes(url.pathname) ||
      value.includes("\\")
    )
      return fallback;
    if (
      [...url.searchParams.keys()].some(
        (key) => url.searchParams.getAll(key).length !== 1
      )
    )
      return fallback;
    if (url.pathname === "/platform/exchange/saved") {
      if (
        [...url.searchParams.keys()].some(
          (key) => !["view", "after"].includes(key)
        ) ||
        (url.searchParams.has("view") &&
          !["favorites", "searches"].includes(url.searchParams.get("view")!))
      )
        return fallback;
      if (url.searchParams.has("after")) postId(url.searchParams.get("after"));
      return (
        url.pathname + (url.searchParams.size ? "?" + url.searchParams : "")
      );
    }
    const savedSearch = url.searchParams.get("savedSearch");
    if (savedSearch) postId(savedSearch);
    url.searchParams.delete("savedSearch");
    const query = parseExchangeListQuery(
      Object.fromEntries(url.searchParams),
      url.pathname.endsWith("/mine")
    );
    const params = exchangeSearchParams(query, true);
    if (savedSearch && !url.pathname.endsWith("/mine"))
      params.set("savedSearch", savedSearch);
    return url.pathname + (params.size ? "?" + params : "");
  } catch {
    return fallback;
  }
}
