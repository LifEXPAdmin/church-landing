import { SegmentPage } from "@/components/layout/segment-page";
import { publicMetadata } from "@/lib/site-metadata";

export const metadata = publicMetadata(
  "For businesses",
  "The Godschurches vision for practical service and community relationships.",
  "/for-businesses"
);

export default function ForBusinessesPage() {
  return (
    <SegmentPage
      title="For businesses"
      intro="Our vision includes people who want to support local churches through practical service and lasting relationships."
      bullets={[
        "Participate in public conversations through a personal account.",
        "Share encouragement and get to know people in the community.",
        "Use public profile information thoughtfully; avoid posting private contact details.",
        "Read the manifesto to understand the convictions behind the project."
      ]}
      note="Sponsorship, payments, investments, and business partnership services are not available through Godschurches. A profile category creates no financial agreement or church authority."
    />
  );
}
