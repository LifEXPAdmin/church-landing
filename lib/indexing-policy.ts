/** Canonical content always belongs to the approved site, never a request Host. */
export function indexingEnvironment(
  env: Record<string, string | undefined> = process.env
) {
  const canonical = "https://godschurches.com";
  const configured = env.NEXT_PUBLIC_SITE_URL;
  try {
    const local = new URL(configured ?? canonical);
    const db = new URL(env.DATABASE_URL ?? "https://invalid.test");
    if (
      env.ACCOUNT_TEST_ISOLATED === "1" &&
      !env.VERCEL &&
      local.protocol === "https:" &&
      local.hostname === "127.0.0.1" &&
      local.pathname === "/" &&
      !local.username &&
      !local.password &&
      !local.search &&
      !local.hash &&
      db.hostname === "127.0.0.1" &&
      /^\/godschurches_security_test(?:_restore)?$/.test(db.pathname)
    )
      return { origin: local.origin, index: true };
  } catch {
    /* A malformed or preview environment cannot opt into indexing. */
  }
  return {
    origin: canonical,
    index: env.VERCEL_ENV === "production" && configured === canonical
  };
}

export type PublicQuery = Record<string, string | string[] | undefined>;
/** Invalid display options render an error, so they cannot describe a public event. */
export function validEventDisplayZone(value: unknown) {
  if (value === undefined) return true;
  if (
    typeof value !== "string" ||
    !value ||
    value.length > 100 ||
    /^[+-]/.test(value)
  )
    return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}
const tracking = /^(?:utm_[a-z_]+|gclid|fbclid)$/;
export function publicPageIdentity(
  path: string,
  query: PublicQuery = {},
  pagination: string[] = []
) {
  const kept = new URLSearchParams();
  let filtered = false;
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue;
    if (tracking.test(key)) continue;
    if (
      pagination.includes(key) &&
      typeof value === "string" &&
      (/[Bb]efore$/.test(key)
        ? /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(value) &&
          Number.isFinite(Date.parse(value))
        : /^[A-Za-z0-9_-]{1,100}$/.test(value))
    )
      kept.set(key, value);
    else filtered = true;
  }
  // A partial compound cursor is not a distinct valid discussion page.
  if (pagination.length > 1 && kept.size > 0 && kept.size !== pagination.length)
    filtered = true;
  kept.sort();
  return {
    path: path + (kept.size && !filtered ? "?" + kept : ""),
    filtered,
    paginated: kept.size > 0
  };
}
