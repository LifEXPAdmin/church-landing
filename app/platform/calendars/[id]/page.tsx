import type { Metadata } from "next";
import { CalendarPage } from "@/components/platform/calendar-page";
import type { CalendarQuery } from "@/lib/platform/calendar-view";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: { absolute: "Calendars | Godschurches" },
  robots: { index: false, follow: false }
};
export default async function Page({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<CalendarQuery>;
}) {
  return (
    <CalendarPage
      view="calendar"
      id={(await params).id}
      query={await searchParams}
    />
  );
}
