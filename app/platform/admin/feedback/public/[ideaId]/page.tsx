import type { Metadata } from "next";
import { AdminPage } from "@/components/platform/admin-page";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Review public idea withdrawal",
  robots: { index: false, follow: false }
};
export default async function Page({
  params
}: {
  params: Promise<{ ideaId: string }>;
}) {
  return (
    <AdminPage
      section="feedback"
      query={new URLSearchParams({
        view: "feedback-idea-moderation",
        ideaId: (await params).ideaId
      }).toString()}
    />
  );
}
