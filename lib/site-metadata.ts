import type { Metadata } from "next";
import { indexingEnvironment } from "./indexing-policy";

export function publicMetadata(
  title: string,
  description: string,
  path: string
): Metadata {
  const fullTitle = `${title} | God’s Churches`;
  return {
    title: { absolute: fullTitle },
    description,
    alternates: { canonical: path },
    robots: { index: indexingEnvironment().index, follow: true },
    openGraph: {
      title: fullTitle,
      description,
      url: path,
      siteName: "God’s Churches",
      type: "website",
      images: [
        {
          url: "/brand/share-card.png",
          width: 1200,
          height: 630,
          alt: "God’s Churches: faith and community"
        }
      ]
    },
    twitter: {
      card: "summary_large_image",
      title: fullTitle,
      description,
      images: ["/brand/share-card.png"]
    }
  };
}
