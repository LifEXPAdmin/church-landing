import type { Metadata } from "next";
import { Cormorant_Garamond, Source_Sans_3 } from "next/font/google";

import "./globals.css";
import { AnalyticsTracker } from "@/components/analytics/analytics-tracker";
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
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: {
    default: "Church | The Revival",
    template: "%s | Church"
  },
  description: "Church is alive every second of every day. Join the Christian-first connection platform for The Revival.",
  keywords: [
    "church",
    "revival",
    "christian community",
    "church waitlist",
    "faith creators",
    "church platform"
  ],
  openGraph: {
    title: "Church | The Revival",
    description: "Revival Isn’t Coming. It’s Here.",
    type: "website",
    images: [{ url: "/hero.jpg", width: 1600, height: 1067, alt: "Church sunrise hero" }]
  },
  twitter: {
    card: "summary_large_image",
    title: "Church | The Revival",
    description: "Church is alive every second of every day.",
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
        <AnalyticsTracker />
        <div className="flex min-h-screen flex-col">
          <SiteHeader />
          <main className="flex-1">{children}</main>
          <SiteFooter />
        </div>
      </body>
    </html>
  );
}
