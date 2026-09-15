import type { NextConfig } from "next";
import { indexingEnvironment } from "./lib/indexing-policy";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  webpack(config) {
    // Next excludes its own package files from cache dependencies. A restored
    // cache can otherwise retain the old renderer after the verified backport.
    if (config.cache && typeof config.cache === "object")
      config.cache.version = `${config.cache.version ?? ""}|gc-react-c18662405cc4`;
    return config;
  },
  // Private/withdrawable media must never enter the shared image optimizer cache.
  images: { localPatterns: [{ pathname: "/images/**", search: "" }] },
  outputFileTracingExcludes: { "/*": ["./.account-test/**/*"] },
  outputFileTracingIncludes: {
    "/api/platform/share-preview": [
      "./assets/share-card/NotoSans.ttf",
      "./assets/share-card/OFL.txt",
      "./assets/share-card/fonts.conf",
      "./public/brand/share-card.png"
    ],
    ...Object.fromEntries(
      [
        "/platform",
        "/platform/feed",
        "/api/platform/discovery",
        "/api/platform/posts",
        "/api/platform/post-workspace"
      ].map((route) => [route, ["./data/discovery/countries/*.json.gz"]])
    )
  },
  async headers() {
    const privacy = ["/platform/:path*", "/api/platform/:path*"].map(
      (source) => ({
        source,
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Cache-Control", value: "private, no-store, max-age=0" }
        ]
      })
    );
    // Candidate public pages make a current, anonymous metadata decision. Every
    // other platform route keeps its header, including future private children.
    const sources = indexingEnvironment().index
      ? [
          "/api/:path*",
          "/admin/:path*",
          "/platform/:path((?!$|churches$|churches/[^/]+$|posts/[^/]+$|events/[^/]+$|topics$|topics/[^/]+$).*)",
          "/platform/topics/new",
          "/platform/topics/following"
        ]
      : ["/:path*"];
    return [
      ...privacy,
      ...sources.map((source) => ({
        source,
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }]
      }))
    ];
  }
};

export default nextConfig;
