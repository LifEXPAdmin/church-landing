export type AccountConfig = {
  origin: string;
  rateSecret: string;
  delivery: "disabled" | "test-sink" | "resend";
  resend?: { apiKey: string; from: string };
  sinkDirectory?: string;
  secureCookie: boolean;
};

export function accountConfig(
  env: NodeJS.ProcessEnv = process.env
): AccountConfig {
  const origin = new URL(
    env.ACCOUNT_ORIGIN ?? env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"
  );
  if (
    origin.username ||
    origin.password ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash ||
    !["http:", "https:"].includes(origin.protocol)
  )
    throw new Error("Invalid account origin configuration");
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname);
  const production = env.NODE_ENV === "production" || Boolean(env.VERCEL);
  if ((!local || production) && origin.protocol !== "https:")
    throw new Error("Account origin requires HTTPS");
  const rateSecret =
    env.AUTH_RATE_LIMIT_SECRET ??
    (!production && local ? "local-development-only-account-limit-key" : "");
  if (rateSecret.length < 32)
    throw new Error("Account rate limiter is not configured");
  const delivery = env.ACCOUNT_DELIVERY_MODE ?? "disabled";
  if (!["disabled", "test-sink", "resend"].includes(delivery))
    throw new Error("Account delivery is not configured");
  if (delivery === "test-sink") {
    const db = new URL(env.DATABASE_URL ?? "http://invalid");
    if (
      production ||
      !local ||
      env.ACCOUNT_TEST_ISOLATED !== "1" ||
      db.hostname !== "127.0.0.1" ||
      !/^\/godschurches_security_test(?:_restore)?$/.test(db.pathname) ||
      !env.ACCOUNT_TEST_SINK_DIR
    )
      throw new Error("Test delivery requires isolated local configuration");
  }
  let resend: AccountConfig["resend"];
  if (delivery === "resend") {
    const apiKey = env.RESEND_API_KEY?.trim() ?? "";
    const from = env.ACCOUNT_EMAIL_FROM?.trim().toLowerCase() ?? "";
    const domain = from.split("@")[1];
    const host = origin.hostname.replace(/^www\./, "");
    if (
      origin.protocol !== "https:" ||
      local ||
      (env.VERCEL && env.VERCEL_ENV !== "production") ||
      !/^re_[A-Za-z0-9_-]+$/.test(apiKey) ||
      !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(from) ||
      !(domain === host || domain?.endsWith(`.${host}`))
    )
      throw new Error("Account email sender is not configured");
    resend = { apiKey, from };
  }
  return {
    origin: origin.origin,
    rateSecret,
    delivery: delivery as AccountConfig["delivery"],
    resend,
    sinkDirectory: env.ACCOUNT_TEST_SINK_DIR,
    secureCookie: origin.protocol === "https:"
  };
}
