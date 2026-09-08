import type { Metadata } from "next";
import { SupportPage } from "@/components/platform/support-page";
export const dynamic = "force-dynamic";
// Private subjects never become page titles, social metadata or analytics labels.
export const metadata: Metadata = { title: "Private request | Godschurches" };
export default async function Page({
  params,
  searchParams
}: {
  params: Promise<{ caseId: string }>;
  searchParams: Promise<{ page?: string; received?: string }>;
}) {
  const { caseId } = await params;
  const { page, received } = await searchParams;
  return (
    <SupportPage
      view="detail"
      caseId={caseId}
      page={page}
      received={received === "1"}
    />
  );
}
