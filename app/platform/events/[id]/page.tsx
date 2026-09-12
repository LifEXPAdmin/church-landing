import { publicResourceMetadata } from "@/lib/platform/share-metadata";
import type { Metadata } from "next";
import { CalendarEventPage } from "@/components/platform/calendar-event-page";
export const dynamic = "force-dynamic";
export async function generateMetadata({
  params
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  return publicResourceMetadata("event", (await params).id);
}
export default async function Page({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ timeZone?: string }>;
}) {
  return (
    <CalendarEventPage
      id={(await params).id}
      timeZone={(await searchParams).timeZone}
    />
  );
}
