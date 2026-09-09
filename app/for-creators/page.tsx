import { SegmentPage } from "@/components/layout/segment-page";
import { publicMetadata } from "@/lib/site-metadata";

export const metadata = publicMetadata(
  "For creators and preachers",
  "Share written teaching, testimony, and encouragement on Godschurches.",
  "/for-creators"
);

export default function ForCreatorsPage() {
  return (
    <SegmentPage
      title="For creators and preachers"
      intro="Use your words to encourage people, share testimony, and point a conversation back to Scripture."
      bullets={[
        "Share written teaching and testimony through public posts.",
        "Add Scripture references to your posts.",
        "Take part in conversations through comments and reactions.",
        "Maintain a public profile and follow other people."
      ]}
      note="Video hosting, image uploads, monetization, and creator analytics remain planned. Selecting a Creator profile category does not unlock unpublished tools."
    />
  );
}
