import { SegmentPage } from "@/components/layout/segment-page";
import { publicMetadata } from "@/lib/site-metadata";

export const metadata = publicMetadata(
  "For churches and pastors",
  "Understand church connections and the vision for local church tools.",
  "/for-churches"
);

export default function ForChurchesPage() {
  return (
    <SegmentPage
      title="For churches and pastors"
      intro="Godschurches supports life with your local church. Personal accounts and church authority are separate."
      bullets={[
        "Use a personal account to share public encouragement and updates.",
        "Open My church to see your connection and available church tools.",
        "Church connections and shared directory information require the appropriate account and membership checks.",
        "Explore the fictional, read-only tour to understand the current church experience."
      ]}
      note="Selecting a Church profile category does not appoint a representative or grant permissions. Church calendars, event publishing, and funding tools remain planned."
    />
  );
}
