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
        <p className="gc-eyebrow">Our mission</p>
        <h1 id="our-mission" className="scroll-mt-6">
          His authority. Our shared calling.
        </h1>
        <p className="gc-info-intro">
          Jesus Christ holds all authority in heaven and on earth. Under His
          authority, He commissions His followers to go and make
          disciples—baptizing them and teaching them to obey His commands.
        </p>
        <p>
          Godschurches exists to help believers put that calling into practice.
          We’re building connections and tools that strengthen local churches,
          support service, and help people share their faith and grow together.
        </p>
        <p>
          The mission comes from Christ. Our part is to help you take yours.
        </p>
        <p className="text-sm text-gc-muted">Rooted in Matthew 28:18–20.</p>
        <section>
          <h2>Start with a conversation</h2>
          <p>
            Read public posts and comments or explore church pages without an
            account. Join when you want to share a testimony, prayer request or
            update, comment, react, follow people, or view member profiles.
          </p>
          <p>
            Public posts, comments and their author names are readable without
            an account. Church-only content retains its current audience. Other
            profile details are available to permitted signed-in members. Keep
            private prayer details and personal contact information out of
            shared spaces.
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
            businesses, and people who want to serve. Calendars, events and
            personal photo tools are available with their current account and
            church permissions. Sponsorships and funding tools remain planned.
            <Link href="/platform/features"> Explore current features.</Link>
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
      <nav aria-label="App guide" className="mt-8 flex flex-wrap gap-4">
        <Link className="underline" href="/platform/features">
          Explore features
        </Link>
        <Link className="underline" href="/platform/releases">
          App version and what’s new
        </Link>
      </nav>
    </section>
  );
}
