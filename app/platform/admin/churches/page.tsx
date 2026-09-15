import type { Metadata } from "next";
import { AdminPage } from "@/components/platform/admin-page";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Admin churches",
  robots: { index: false, follow: false }
};
export default function Page() {
  return <AdminPage section="churches" />;
}
