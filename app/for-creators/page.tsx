import { SegmentPage } from "@/components/layout/segment-page";

export default function ForCreatorsPage() {
  return (
    <SegmentPage
      title="For Creators & Preachers"
      intro="If you are called to teach, preach, write, or encourage, Church helps your message reach people who are ready to grow in faith."
      bullets={[
        "Publish messages, short teachings, and devotionals with clarity and reverence.",
        "Connect your content to churches and communities actively seeking truth.",
        "Collaborate with Kingdom-minded creators across different giftings.",
        "Serve the Body with consistency, humility, and biblical integrity."
      ]}
      role="CREATOR"
    />
  );
}
