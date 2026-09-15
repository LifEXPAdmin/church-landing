import type { Metadata } from "next";
import { AdminPage } from "@/components/platform/admin-page";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Review published ideas",
  robots: { index: false, follow: false }
};
export default async function Page({
  searchParams
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { q, page } = await searchParams;
  return (
    <AdminPage
      section="feedback"
      query={new URLSearchParams({
        view: "feedback-idea-moderation",
        ...(typeof q === "string" ? { q } : {}),
        ...(typeof page === "string" ? { page } : {})
      }).toString()}
    />
  );
}
