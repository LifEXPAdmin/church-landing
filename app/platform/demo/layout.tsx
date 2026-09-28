import type { Metadata } from "next";

import { DemoShell } from "@/components/platform/demo-shell";

// The fictional, read-only content stays independent of accounts and databases.
// Its document now renders per request to carry the root script policy nonce.
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
