import type { Metadata } from "next";
import {
  PantryPage,
  type PantryQuery
} from "@/components/platform/pantry-page";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "My private assistance requests",
  robots: { index: false, follow: false }
};
export default async function Page({
  searchParams
}: {
  searchParams: Promise<PantryQuery>;
}) {
  return (
    <PantryPage
      view="mine"
      path={`/platform/pantry/mine`}
      query={await searchParams}
    />
  );
}
