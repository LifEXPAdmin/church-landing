import type { Metadata } from "next";
import {
  VolunteerPage,
  type VolunteerPageQuery
} from "@/components/platform/volunteer-page";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Volunteer opportunities",
  robots: { index: false, follow: false }
};
export default async function Page({
  searchParams
}: {
  searchParams: Promise<VolunteerPageQuery>;
}) {
  return (
    <VolunteerPage
      view="list"
      path={`/platform/serve`}
      query={await searchParams}
    />
  );
}
