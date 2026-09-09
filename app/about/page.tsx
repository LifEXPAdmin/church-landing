import Link from "next/link";
import { publicMetadata } from "@/lib/site-metadata";

export const metadata = publicMetadata(
  "About",
  "Why Godschurches exists, what you can use today, and how to get started.",
  "/about"
);

export default function AboutPage() {
  return (
    <section className="container-shell py-10 sm:py-16">
      <article className="gc-info-article">
        <p className="gc-eyebrow">The Revival</p>
        <h1>Faith that carries into everyday life.</h1>
        <p className="gc-info-intro">
          Godschurches is a place to share encouragement, grow in faith, and
          stay connected to people. Local churches remain at the heart of that
          life together.
        </p>
        <section>
          <h2>Start with a conversation</h2>
          <p>
            Read public posts, or create an email account to share a testimony,
            prayer request, or update. You can comment, react, follow people,
            search public posts and profiles, and edit your own profile.
          </p>
          <p>
            Posts, comments, and profile details are public. Keep private prayer
            details and personal contact information out of those spaces.
          </p>
          <div className="gc-info-actions">
            <Link href="/platform" className="gc-button">
              Open Home
            </Link>
            <Link href="/platform/signup" className="gc-button gc-button-quiet">
              Create an account
            </Link>
          </div>
        </section>
        <section>
          <h2>Your local church matters</h2>
          <p>
            Godschurches exists to support fellowship, not replace gathering
            with a local church. Church tools have separate account, membership,
            and permission requirements. Creating a personal account does not
            make you a church representative.
          </p>
          <p>
            <Link href="/platform/my-church">Open My church</Link> to see the
            access available to your account. The{" "}
            <Link href="/platform/demo">read-only tour</Link> uses fictional
            information and does not create membership or save changes.
          </p>
        </section>
        <section>
          <h2>A shared direction</h2>
          <p>
            Our longer-term vision connects believers, churches, creators,
            businesses, and people who want to serve. Event calendars, media
            uploads, sponsorships, and funding tools are still planned; they are
            not available through these information pages.
          </p>
          <ul className="gc-info-list">
            <li>
              <Link href="/for-users">For believers</Link>
            </li>
            <li>
              <Link href="/for-churches">For churches and pastors</Link>
            </li>
            <li>
              <Link href="/for-creators">For creators and preachers</Link>
            </li>
            <li>
              <Link href="/for-businesses">For businesses</Link>
            </li>
          </ul>
          <p>
            <Link href="/manifesto">Read the manifesto</Link> for the
            convictions behind Godschurches.
          </p>
        </section>
        <section>
          <h2>Find your next step</h2>
          <p>
            For sign-in, account recovery, or church access questions, start
            with <Link href="/help">Help</Link>. The{" "}
            <Link href="/privacy">Privacy Policy</Link> and{" "}
            <Link href="/terms">Terms</Link> are available without an account.
          </p>
        </section>
      </article>
    </section>
  );
}
