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
import { headers } from "next/headers";
import { CSP_NONCE_HEADER } from "@/lib/security/content-security-policy";

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

export default async function PlatformPage({
  searchParams
}: {
  searchParams: Promise<FeedParams>;
}) {
  const nonce = (await headers()).get(CSP_NONCE_HEADER) ?? undefined;
  return (
    <>
      <script
        nonce={nonce}
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
