import type { Metadata } from "next";
import { CalendarEventPage } from "@/components/platform/calendar-event-page";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: { absolute: "Event | Godschurches" },
  robots: { index: false, follow: false }
};
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
