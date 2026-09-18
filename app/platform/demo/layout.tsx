import type { Metadata } from "next";

import { DemoShell } from "@/components/platform/demo-shell";

export const dynamic = "error";
export const metadata: Metadata = {
  title: {
    absolute: "Church portal demo | God’s Churches",
    template: "%s | God’s Churches demo"
  },
  description:
    "Demo: fictional church and member information. A read-only tour of the God’s Churches portal; no account required.",
  robots: {
    index: false,
    follow: false,
    googleBot: { index: false, follow: false }
  }
};

export default function DemoLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return <DemoShell>{children}</DemoShell>;
}
