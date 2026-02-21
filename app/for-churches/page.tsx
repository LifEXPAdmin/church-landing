import { SegmentPage } from "@/components/layout/segment-page";

export default function ForChurchesPage() {
  return (
    <SegmentPage
      title="For Churches & Pastors"
      intro="Church exists to strengthen local churches and pastors with consistent visibility, practical tools, and community support."
      bullets={[
        "Be discovered by believers in your city and beyond.",
        "Share your sermons, events, prayer needs, and updates in one place.",
        "Open pathways for ongoing support, volunteers, and partnership.",
        "Stay connected to The Revival every day, not just Sundays."
      ]}
      role="CHURCH"
    />
  );
}
