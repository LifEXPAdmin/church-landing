import type { Metadata } from "next";
import { ChurchStructurePage } from "@/components/platform/church-structure-page";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: { absolute: "Assignment privileges | Godschurches" },
  robots: { index: false, follow: false }
};
export default async function Page({
  params,
  searchParams
}: {
  params: Promise<{ churchId: string }>;
  searchParams: Promise<{
    positionId?: string;
    connectionId?: string;
    assignmentId?: string;
    q?: string;
    candidateCursor?: string;
  }>;
}) {
  const route = await params;
  const query = await searchParams;
  return (
    <ChurchStructurePage
      churchId={route.churchId}
      view="assign"
      positionId={query.positionId}
      connectionId={query.connectionId}
      assignmentId={query.assignmentId}
      query={query.q}
      candidateCursor={query.candidateCursor}
    />
  );
}
