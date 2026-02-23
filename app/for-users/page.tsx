import { SegmentPage } from "@/components/layout/segment-page";

export default function ForUsersPage() {
  return (
    <SegmentPage
      title="For Believers"
      intro="Church is a Christian-first connection platform for believers who want daily discipleship, real fellowship, and Christ-centered community."
      bullets={[
        "Discover churches, gatherings, teaching, and prayer opportunities in one place.",
        "Build meaningful relationships with believers near you and across regions.",
        "Stay connected to testimony, accountability, and spiritual growth all week.",
        "Participate in a Christ-centered community designed for depth, not noise."
      ]}
      role="BELIEVER"
    />
  );
}
