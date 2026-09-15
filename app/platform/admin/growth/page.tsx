import type { Metadata } from "next";
import { AdminPage } from "@/components/platform/admin-page";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Platform growth",
  robots: { index: false, follow: false }
};
export default async function Page({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const input = await searchParams,
    q = new URLSearchParams({ view: "metrics" });
  for (const [key, value] of Object.entries(input))
    if (value !== undefined) {
      if (Array.isArray(value)) for (const item of value) q.append(key, item);
      else q.append(key, value);
    }
  return <AdminPage section="growth" query={q.toString()} />;
}
