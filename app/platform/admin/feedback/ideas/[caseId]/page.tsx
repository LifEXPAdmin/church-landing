import type { Metadata } from "next";
import { AdminPage } from "@/components/platform/admin-page";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Review public idea",
  robots: { index: false, follow: false }
};
export default async function Page({
  params,
  searchParams
}: {
  params: Promise<{ caseId: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { caseId } = await params,
    { q } = await searchParams;
  return (
    <AdminPage
      section="feedback"
      query={new URLSearchParams({
        view: "feedback-idea",
        caseId,
        ...(typeof q === "string" ? { q } : {})
      }).toString()}
    />
  );
}
