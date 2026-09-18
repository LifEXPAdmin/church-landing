import type { Metadata } from "next";
import { GroupPage, type GroupSearch } from "@/components/platform/group-page";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Gather groups",
  robots: { index: false, follow: false }
};
export default async function Page({
  searchParams
}: {
  searchParams: Promise<GroupSearch>;
}) {
  return (
    <GroupPage view="list" path="/platform/groups" query={await searchParams} />
  );
}
