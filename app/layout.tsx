import type { Metadata } from "next";
import { Cormorant_Garamond, Source_Sans_3 } from "next/font/google";

import "./globals.css";
import "./platform/platform.css";
import { PublicChrome } from "@/components/layout/public-chrome";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { cn } from "@/lib/utils";

const headingFont = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-heading"
});

const bodyFont = Source_Sans_3({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-body"
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://godschurches.com"
  ),
  title: {
    default: "Godschurches | The Revival",
    template: "%s | Godschurches"
  },
  description:
    "Faith, fellowship, and everyday life. Read public posts and connect with people on Godschurches.",
  keywords: [
    "church",
    "revival",
    "christian community",
    "faith creators",
    "church platform"
  ],
  openGraph: {
    title: "Godschurches | The Revival",
    description: "Faith, fellowship, and everyday life.",
    siteName: "Godschurches",
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
    title: "Godschurches | The Revival",
    description: "Faith, fellowship, and everyday life.",
    images: ["/hero.jpg"]
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={cn(headingFont.variable, bodyFont.variable)}>
        <PublicChrome header={<SiteHeader />} footer={<SiteFooter />}>
          {children}
        </PublicChrome>
      </body>
    </html>
  );
}
