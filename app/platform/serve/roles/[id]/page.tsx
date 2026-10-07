import type { Metadata } from "next";
import {
  VolunteerPage,
  type VolunteerPageQuery
} from "@/components/platform/volunteer-page";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Confirm volunteer service",
  robots: { index: false, follow: false }
};
export default async function Page({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<VolunteerPageQuery>;
}) {
  const { id } = await params;
  return (
    <VolunteerPage
      view="service-roster"
      id={id}
      path={`/platform/serve/roles/${encodeURIComponent(id)}`}
      query={await searchParams}
    />
  );
}
