import HomeFeedPage, {
  type FeedParams
} from "@/components/platform/home-feed-page";
import { publicMetadata } from "@/lib/site-metadata";
import {
  indexingEnvironment,
  publicPageIdentity,
  type PublicQuery
} from "@/lib/indexing-policy";
import { serializeStructuredData } from "@/lib/platform/public-structured-data";

export async function generateMetadata({
  searchParams
}: {
  searchParams: Promise<PublicQuery>;
}) {
  const identity = publicPageIdentity("/platform", await searchParams);
  return {
    ...publicMetadata(
      "Home",
      "Grow in faith, connect with your community, and share everyday life on God’s Churches.",
      "/platform"
    ),
    robots: {
      index: indexingEnvironment().index && !identity.filtered,
      follow: true
    }
  };
}
export const dynamic = "force-dynamic";

export default function PlatformPage({
  searchParams
}: {
  searchParams: Promise<FeedParams>;
}) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeStructuredData({
            "@context": "https://schema.org",
            "@type": "WebSite",
            name: "God’s Churches",
            url: indexingEnvironment().origin + "/platform",
            inLanguage: "en"
          })
        }}
      />
      <HomeFeedPage searchParams={searchParams} />
    </>
  );
}
