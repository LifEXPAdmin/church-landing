import type { Metadata } from "next";
import { ChurchStructurePage } from "@/components/platform/church-structure-page";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: { absolute: "Chart change history | Godschurches" },
  robots: { index: false, follow: false }
};
export default async function Page({
  params,
  searchParams
}: {
  params: Promise<{ churchId: string }>;
  searchParams: Promise<{ cursor?: string }>;
}) {
  const { churchId } = await params;
  const { cursor } = await searchParams;
  return (
    <ChurchStructurePage churchId={churchId} view="history" cursor={cursor} />
  );
}
