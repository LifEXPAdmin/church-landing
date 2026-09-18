import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GroupPage, type GroupSearch } from "@/components/platform/group-page";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Private group workspace",
  robots: { index: false, follow: false }
};
export default async function Page({
  params,
  searchParams
}: {
  params: Promise<{ slug: string; view: string }>;
  searchParams: Promise<GroupSearch>;
}) {
  const { slug, view } = await params;
  if (!["discussion", "events", "members", "manage", "history"].includes(view))
    notFound();
  return (
    <GroupPage
      view={view}
      slug={slug}
      path={`/platform/groups/${slug}/${view}`}
      query={await searchParams}
    />
  );
}
