import type { Metadata } from "next";
import {
  PantryPage,
  type PantryQuery
} from "@/components/platform/pantry-page";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Church pantry and support hubs",
  robots: { index: false, follow: false }
};
export default async function Page({
  searchParams
}: {
  searchParams: Promise<PantryQuery>;
}) {
  return (
    <PantryPage
      view="list"
      path={`/platform/pantry`}
      query={await searchParams}
    />
  );
}
