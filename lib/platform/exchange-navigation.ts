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
      !["/platform/exchange", "/platform/exchange/mine"].includes(
        url.pathname
      ) ||
      value.includes("\\")
    )
      return fallback;
    if (
      [...url.searchParams.keys()].some(
        (key) => url.searchParams.getAll(key).length !== 1
      )
    )
      return fallback;
    const query = parseExchangeListQuery(
      Object.fromEntries(url.searchParams),
      url.pathname.endsWith("/mine")
    );
    const params = exchangeSearchParams(query, true);
    return url.pathname + (params.size ? "?" + params : "");
  } catch {
    return fallback;
  }
}
