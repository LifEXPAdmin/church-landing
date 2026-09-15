import type { Metadata } from "next";
import { AdminPage } from "@/components/platform/admin-page";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Admin access",
  robots: { index: false, follow: false }
};
export default async function Page({
  searchParams
}: {
  searchParams: Promise<{ username?: string }>;
}) {
  const q = await searchParams;
  return (
    <AdminPage
      section="access"
      query={new URLSearchParams({
        view: "access",
        ...(typeof q.username === "string" ? { username: q.username } : {})
      }).toString()}
    />
  );
}
