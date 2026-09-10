import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Private/withdrawable media must never enter the shared image optimizer cache.
  images: { localPatterns: [{ pathname: "/images/**", search: "" }] },
  outputFileTracingExcludes: { "/*": ["./.account-test/**/*"] },
  async headers() {
    return ["/platform/:path*", "/api/platform/:path*"].map((source) => ({
      source,
      headers: [
        { key: "Referrer-Policy", value: "no-referrer" },
        { key: "Cache-Control", value: "private, no-store, max-age=0" },
        { key: "X-Robots-Tag", value: "noindex, nofollow" }
      ]
    }));
  }
};

export default nextConfig;
