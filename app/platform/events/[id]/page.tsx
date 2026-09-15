import { publicResourceMetadata } from "@/lib/platform/share-metadata";
import type { Metadata } from "next";
import type { PublicQuery } from "@/lib/indexing-policy";
import { PublicStructuredData } from "@/components/platform/public-structured-data";
import { CalendarEventPage } from "@/components/platform/calendar-event-page";
export const dynamic = "force-dynamic";
export async function generateMetadata({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<PublicQuery>;
}): Promise<Metadata> {
  return publicResourceMetadata("event", (await params).id, await searchParams);
}
export default async function Page({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ timeZone?: string }>;
}) {
  const { id } = await params;
  return (
    <>
      <PublicStructuredData kind="event" id={id} />
      <CalendarEventPage id={id} timeZone={(await searchParams).timeZone} />
    </>
  );
}
