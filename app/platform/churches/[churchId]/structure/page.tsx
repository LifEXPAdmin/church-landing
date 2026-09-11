import type { Metadata } from "next";
import { ChurchStructurePage } from "@/components/platform/church-structure-page";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: { absolute: "Church space | Godschurches" },
  robots: { index: false, follow: false }
};
export default async function Page({
  params,
  searchParams
}: {
  params: Promise<{ churchId: string }>;
  searchParams: Promise<{
    q?: string;
    mode?: string;
    cursor?: string;
    candidateCursor?: string;
    from?: string;
    focus?: string;
  }>;
}) {
  const route = await params;
  const query = await searchParams;
  return (
    <ChurchStructurePage
      churchId={route.churchId}
      view="structure"
      outline={query.mode === "outline"}
      query={query.q}
      cursor={query.cursor}
      candidateCursor={query.candidateCursor}
      returnFrom={query.from}
      focus={query.focus}
    />
  );
}
