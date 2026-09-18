import type { Metadata } from "next";
import {
  PantryPage,
  type PantryQuery
} from "@/components/platform/pantry-page";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Private assistance queue",
  robots: { index: false, follow: false }
};
export default async function Page({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<PantryQuery>;
}) {
  const { id } = await params;
  return (
    <PantryPage
      view="queue"
      id={id}
      path={`/platform/pantry/${id}/queue`}
      query={await searchParams}
    />
  );
}
