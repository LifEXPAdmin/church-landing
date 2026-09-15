import type { Metadata } from "next";
import { adminSelection } from "@/lib/platform/admin-links";
import { AdminPage } from "@/components/platform/admin-page";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Admin requests",
  robots: { index: false, follow: false }
};
export default async function Page({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams,
    q = new URLSearchParams({ view: "queue" });
  for (const [key, value] of Object.entries(raw))
    if (key === "selected") continue;
    else if (typeof value === "string") q.set(key, value);
    else if (value) for (const item of value) q.append(key, item);
  return (
    <AdminPage
      section="requests"
      query={q.toString()}
      selection={adminSelection(raw.selected)}
    />
  );
}
