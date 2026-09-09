import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://godschurches.com";

  // Retain the existing platform noindex boundary; list canonical public information only.
  return [
    "/about",
    "/help",
    "/manifesto",
    "/for-users",
    "/for-churches",
    "/for-creators",
    "/for-businesses",
    "/privacy",
    "/terms"
  ].map((path) => ({
    url: `${baseUrl}${path}`,
    lastModified: new Date(),
    changeFrequency: "weekly",
    priority: path === "/about" ? 1 : 0.7
  }));
}
