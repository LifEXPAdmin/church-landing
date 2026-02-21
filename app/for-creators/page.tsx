import { SegmentPage } from "@/components/layout/segment-page";

export default function ForCreatorsPage() {
  return (
    <SegmentPage
      title="For Creators & Preachers"
      intro="If you are called to teach, preach, write, or encourage, Church helps your voice reach people ready to grow."
      bullets={[
        "Publish messages and devotionals with clarity and reverence.",
        "Connect your content to churches and communities that need it.",
        "Collaborate with other Kingdom-minded creators.",
        "Serve the Body with consistency and integrity."
      ]}
      role="CREATOR"
    />
  );
}
