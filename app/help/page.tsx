import Link from "next/link";
import { publicMetadata } from "@/lib/site-metadata";

export const metadata = publicMetadata(
  "Help",
  "Get started, sign in, and understand public content and church access on Godschurches.",
  "/help"
);

export default function HelpPage() {
  return (
    <section className="container-shell py-10 sm:py-16">
      <article className="gc-info-article">
        <p className="gc-eyebrow">A little guidance</p>
        <h1>How can we help?</h1>
        <p className="gc-info-intro">
          Start here for account access and the difference between public
          conversations and private church tools.
        </p>
        <section>
          <h2>Create an account or sign in</h2>
          <p>
            <Link href="/platform/signup">Create an account</Link> with your
            email and an available public username. If you already have an
            account, <Link href="/platform/login">sign in</Link> with your email
            and password. Your public username is not your sign-in email.
          </p>
          <p>
            A previous waitlist entry is not an account. Registering again does
            not replace an existing password or recover an older account.
          </p>
        </section>
        <section>
          <h2>Trouble with your password?</h2>
          <p>
            The{" "}
            <Link href="/platform/account/recover">account recovery page</Link>{" "}
            shows whether email recovery is available and the next steps.
            Signing up again will not restore access to an existing account.
          </p>
          <p>
            If a request fails, keep the visible error or reference code and
            approximate time. Never share a password, recovery link, session
            cookie, or private church information.
          </p>
        </section>
        <section>
          <h2>What can other people see?</h2>
          <p>
            Public posts, comments and church pages are open to visitors. Member
            profiles and participation require an account. Your sign-in email
            and password stay private. Use care when writing a bio or prayer
            request.
          </p>
          <p>
            Church directories, shared contact details, and support requests
            have separate server-enforced access rules. Access depends on your
            account and church permissions.
          </p>
        </section>
        <section>
          <h2>Connect with your church</h2>
          <p>
            Start with <Link href="/platform/my-church">My church</Link>.
            Creating an account or selecting a profile category does not grant
            church authority. Some tools require verified email, an adult
            acknowledgment, and an approved connection.
          </p>
          <p>
            When you have access,{" "}
            <Link href="/platform/help">church help and contacts</Link> shows
            the options available to you. New private support requests are
            currently unavailable. For immediate danger, contact local emergency
            services.
          </p>
        </section>
        <section>
          <h2>Website questions</h2>
          <p>
            For general website questions, email{" "}
            <a href="mailto:mcdrew169@yahoo.com">mcdrew169@yahoo.com</a>. Please
            keep the message free of passwords and sensitive personal or
            pastoral information. This is not a private church support inbox.
          </p>
          <p>
            <Link href="/privacy">Privacy Policy</Link> ·{" "}
            <Link href="/terms">Terms of Service</Link>
          </p>
        </section>
      </article>
    </section>
  );
}
