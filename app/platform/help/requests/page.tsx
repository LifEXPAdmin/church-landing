import type { Metadata } from "next";
import { SupportPage } from "@/components/platform/support-page";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Private support | Godschurches" };
export default async function Page({
  searchParams
}: {
  searchParams: Promise<{ page?: string; churchId?: string }>;
}) {
  const { page, churchId } = await searchParams;
  return <SupportPage view="requests" page={page} churchId={churchId} />;
}
