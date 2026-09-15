import type { Metadata } from "next";
import { AdminPage } from "@/components/platform/admin-page";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Admin case",
  robots: { index: false, follow: false }
};
export default async function Page({
  params,
  searchParams
}: {
  params: Promise<{ sourceType: string; sourceId: string }>;
  searchParams: Promise<{ returnTo?: string; page?: string }>;
}) {
  const source = await params,
    q = await searchParams;
  return (
    <AdminPage
      section="case"
      query={new URLSearchParams({
        view: "detail",
        ...source,
        ...(q.page ? { page: q.page } : {})
      }).toString()}
      back={q.returnTo}
    />
  );
}
