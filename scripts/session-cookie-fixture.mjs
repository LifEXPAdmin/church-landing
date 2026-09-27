// Fictional fixtures use the current wire name at request time. Production
// readers and explicit legacy/rollback tests do not use this helper.
export function sessionCookieFixtureName(
  origin = process.env.ACCOUNT_ORIGIN ?? process.env.NEXT_PUBLIC_SITE_URL
) {
  if (!origin) throw new Error("Set the inspected fixture account origin");
  const protocol = new URL(origin).protocol;
  if (protocol !== "http:" && protocol !== "https:")
    throw new Error("Invalid fixture account origin");
  return protocol === "https:"
    ? "__Host-church_platform_session"
    : "church_platform_session";
}
