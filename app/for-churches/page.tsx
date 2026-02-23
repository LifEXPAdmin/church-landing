import { SegmentPage } from "@/components/layout/segment-page";

export default function ForChurchesPage() {
  return (
    <SegmentPage
      title="For Churches & Pastors"
      intro="Church exists to strengthen local churches and pastors with practical visibility, communication tools, and long-term community support."
      bullets={[
        "Be discovered by believers in your city and beyond your existing network.",
        "Share sermons, events, prayer needs, and updates in one consistent place.",
        "Open pathways for volunteers, encouragement, and practical support.",
        "Stay connected to The Revival every day while honoring local church leadership."
      ]}
      role="CHURCH"
    />
  );
}
