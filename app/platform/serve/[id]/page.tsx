import type { Metadata } from "next";
import {
  VolunteerPage,
  type VolunteerPageQuery
} from "@/components/platform/volunteer-page";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Volunteer opportunity",
  robots: { index: false, follow: false }
};
export default async function Page({
  searchParams,
  params
}: {
  searchParams: Promise<VolunteerPageQuery>;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <VolunteerPage
      view="opportunity"
      id={id}
      path={`/platform/serve/${id}`}
      query={await searchParams}
    />
  );
}
