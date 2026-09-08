import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
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
