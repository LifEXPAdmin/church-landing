import HomeFeedPage, {
  type FeedParams
} from "@/components/platform/home-feed-page";
import { publicMetadata } from "@/lib/site-metadata";

export const metadata = publicMetadata(
  "My feed",
  "Read public posts one at a time, at your own pace.",
  "/platform/feed"
);
export const dynamic = "force-dynamic";

export default function MyFeedPage({
  searchParams
}: {
  searchParams: Promise<FeedParams>;
}) {
  return <HomeFeedPage searchParams={searchParams} />;
}
