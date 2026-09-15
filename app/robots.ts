import type { MetadataRoute } from "next";
import { indexingEnvironment } from "@/lib/indexing-policy";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = indexingEnvironment().origin;

  return {
    rules: {
      userAgent: "*",
      allow: "/"
    },
    sitemap: `${baseUrl}/sitemap.xml`
  };
}
