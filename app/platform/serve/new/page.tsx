import type { Metadata } from "next";
import {
  VolunteerPage,
  type VolunteerPageQuery
} from "@/components/platform/volunteer-page";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Create volunteer opportunity",
  robots: { index: false, follow: false }
};
export default async function Page({
  searchParams
}: {
  searchParams: Promise<VolunteerPageQuery>;
}) {
  return (
    <VolunteerPage
      view="new"
      path={`/platform/serve/new`}
      query={await searchParams}
    />
  );
}
