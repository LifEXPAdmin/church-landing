import type { Metadata } from "next";

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
    openGraph: {
      title: fullTitle,
      description,
      url: path,
      siteName: "God’s Churches",
      type: "website",
      images: [
        {
          url: "/hero.jpg",
          width: 1600,
          height: 1067,
          alt: "Sunrise over mountains and clouds"
        }
      ]
    },
    twitter: {
      card: "summary_large_image",
      title: fullTitle,
      description,
      images: ["/hero.jpg"]
    }
  };
}
