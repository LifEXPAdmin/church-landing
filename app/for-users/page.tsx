import { SegmentPage } from "@/components/layout/segment-page";
import { publicMetadata } from "@/lib/site-metadata";

export const metadata = publicMetadata(
  "For believers",
  "Share encouragement and connect with people growing in faith.",
  "/for-users"
);

export default function ForUsersPage() {
  return (
    <SegmentPage
      title="For believers"
      intro="Share everyday faith, find encouragement, and keep a conversation going beyond Sunday."
      bullets={[
        "Read public testimonies, prayer requests, and updates.",
        "Create an account to post, comment, and react.",
        "Follow people whose posts you want to see on Home.",
        "Search public posts and author names; sign in to view member profiles."
      ]}
      note="Posts and comments are public. Member profiles require sign-in. Share with care."
    />
  );
}
