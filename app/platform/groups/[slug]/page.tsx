import type { Metadata } from "next";
import { GroupPage, type GroupSearch } from "@/components/platform/group-page";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Gather group",
  robots: { index: false, follow: false }
};
export default async function Page({
  params,
  searchParams
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<GroupSearch>;
}) {
  const { slug } = await params;
  return (
    <GroupPage
      view="about"
      slug={slug}
      path={`/platform/groups/${slug}`}
      query={await searchParams}
    />
  );
}
