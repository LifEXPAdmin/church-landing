import type { Metadata } from "next";
import { ChurchStructurePage } from "@/components/platform/church-structure-page";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: { absolute: "Church role library | Godschurches" },
  robots: { index: false, follow: false }
};
export default async function Page({
  params
}: {
  params: Promise<{ churchId: string }>;
}) {
  return (
    <ChurchStructurePage churchId={(await params).churchId} view="roles" />
  );
}
