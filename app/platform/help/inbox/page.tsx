import type { Metadata } from "next";
import { SupportPage } from "@/components/platform/support-page";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: { absolute: "Private support | Godschurches" } };
export default async function Page({
  searchParams
}: {
  searchParams: Promise<{ page?: string; churchId?: string }>;
}) {
  const { page, churchId } = await searchParams;
  return <SupportPage view="inbox" page={page} churchId={churchId} />;
}
