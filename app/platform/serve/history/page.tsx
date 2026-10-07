import type { Metadata } from "next";
import {
  VolunteerPage,
  type VolunteerPageQuery
} from "@/components/platform/volunteer-page";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "My volunteer service history",
  robots: { index: false, follow: false }
};
export default async function Page({
  searchParams
}: {
  searchParams: Promise<VolunteerPageQuery>;
}) {
  return (
    <VolunteerPage
      view="history"
      path="/platform/serve/history"
      query={await searchParams}
    />
  );
}
