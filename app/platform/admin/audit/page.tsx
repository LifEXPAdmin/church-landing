import type { Metadata } from "next";
import { AdminPage } from "@/components/platform/admin-page";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Admin audit",
  robots: { index: false, follow: false }
};
export default async function Page({
  searchParams
}: {
  searchParams: Promise<{ after?: string }>;
}) {
  const q = await searchParams;
  return (
    <AdminPage
      section="audit"
      query={new URLSearchParams({
        view: "audit",
        ...(typeof q.after === "string" ? { after: q.after } : {})
      }).toString()}
    />
  );
}
