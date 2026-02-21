import { SegmentPage } from "@/components/layout/segment-page";

export default function ForUsersPage() {
  return (
    <SegmentPage
      title="For Believers"
      intro="Church is a social platform for believers to connect daily, grow in faith, and build real Christ-centered community."
      bullets={[
        "Find churches, groups, messages, and events in one place.",
        "Build meaningful relationships with believers near you and beyond.",
        "Stay connected to prayer, testimony, and spiritual growth all week.",
        "Join a community centered on Christ, not algorithm noise."
      ]}
      role="BELIEVER"
    />
  );
}
