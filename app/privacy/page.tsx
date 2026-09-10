import { publicMetadata } from "@/lib/site-metadata";

export const metadata = publicMetadata(
  "Privacy Policy",
  "Privacy information for Godschurches accounts, public content, and historical waitlist records.",
  "/privacy"
);

export default function PrivacyPage() {
  return (
    <section className="container-shell py-16 sm:py-20">
      <article className="gc-info-article">
        <h1 className="mb-6 text-5xl">Privacy Policy</h1>
        <p className="mb-8 text-sm">
          Original policy: February 21, 2026. Service information updated
          September 10, 2026.
        </p>

        <div className="space-y-8 text-base leading-relaxed">
          <section>
            <h2 className="mb-2 text-3xl">What We Collect</h2>
            <p>
              Account registration collects your name, email address, public
              username, profile category, and password. Passwords are stored as
              salted hashes. We store the posts, comments, reactions, follows,
              and profile details you choose to provide. Church connections,
              shared directory details, and support records have separate access
              requirements.
            </p>
          </section>
          <section>
            <h2 className="mb-2 text-3xl">How We Use Information</h2>
            <p>
              We use account and session information to provide sign-in and
              account controls, display your public contributions, and enforce
              access to church tools. Visitors can read public posts, comments,
              church pages and basic author information such as names and
              usernames. Viewing member profiles requires sign-in. Your account
              email and password are excluded from profile and public content.
            </p>
          </section>
          <section>
            <h2 className="mb-2 text-3xl">Calendars, Events and Responses</h2>
            <p>
              Personal calendars start private. You may share a chosen calendar
              or event series with approved members of your church as busy-only
              availability or full event details. Whole-calendar sharing
              includes current and future events. Calendar and event shares are
              separate; ending one does not end the other. Shared source names
              use your chosen church directory name when listed. Account sign-in
              contacts are not added to event details automatically.
            </p>
            <p className="mt-3">
              Church calendar editors and publishers can view private church
              drafts. Authorized publishers choose whether a church event is
              visible to approved members or everyone, including visitors
              without accounts. We store event details, local dates, time zones,
              recurrence, sharing choices, responses and a restricted change
              history. Your commitments and conflict hints are visible only to
              you; busy-only sharing does not reveal private appointment titles.
            </p>
            <p className="mt-3">
              Leaving a church ends dependent calendar sharing and church
              commitments. Deactivation ends your active sharing and responses
              while retaining private calendar records. Rejoining or
              reactivating does not restore these permissions. Your account
              download includes your own calendars, events, shares and response
              records. Canceling events preserves their history and existing
              response references. Information someone has already seen cannot
              be recalled.
            </p>
          </section>
          <section>
            <h2 className="mb-2 text-3xl">
              Church Structure and Responsibilities
            </h2>
            <p>
              Church positions, reporting lines and assignments are available to
              eligible approved members of that church. An unlisted member may
              hold a position without showing their name or contact details.
              Listed names and contact cards follow the member&apos;s directory
              sharing choices; account sign-in email is not used as a contact
              fallback. Position titles do not grant software permissions.
            </p>
            <p className="mt-3">
              Authorized managers record position changes and explicit access
              assignments. Members can step down from their own positions.
              Leaving or being removed ends position assignments and related
              church access; rejoining does not restore old appointments or
              sharing consent. Historical church operations and audit records
              are retained with restricted access.
            </p>
          </section>
          <section>
            <h2 className="mb-2 text-3xl">Church Representative Setup</h2>
            <p>
              Representative requests store private role and contact
              information, requested permissions, public profile drafts and
              optional preparation notes. Submitted requests are available to
              independently authorized Godschurches reviewers or appropriately
              authorized managers of that church. Reviewers can see the
              claimant’s account name, username and verified sign-in email for
              the review. Independent review references and staff notes stay in
              the restricted review record; they are never public church
              contacts.
            </p>
            <p className="mt-3">
              You can download your own setup information through account
              settings. Withdrawing or ending access preserves the request and
              decision history. Activation grants only approved permissions
              after current eligibility and authority checks. Verification
              describes representative authority, and does not guarantee a
              church’s teachings, safety or legitimacy. Deactivation preserves
              setup records; active duties must be removed first.
            </p>
          </section>
          <section>
            <h2 className="mb-2 text-3xl">Church Listings and Drafts</h2>
            <p>
              We store church listing drafts, proposed corrections, and review
              responses. Unsubmitted drafts are available to their contributor;
              submitted information is also available to authorized listing
              reviewers. Publishing requires confirmation of the public preview.
              Published church names, descriptions, areas, meeting information,
              sources, and optional public church contacts can be read by
              anyone. Your sign-in email is not copied into a public church
              contact field. Adding a listing does not grant church management
              or member access.
            </p>
            <p className="mt-3">
              You can download your own listing drafts and submissions through
              account settings. Withdrawing a submission ends that submission;
              it does not delete its history or a published church page. Account
              deactivation preserves these records and does not remove public
              church information. Use the correction or help route for changes.
            </p>
          </section>
          <section>
            <h2 className="mb-2 text-3xl">Historical Waitlist and Email</h2>
            <p>
              The former waitlist collected name, email, selected role, and an
              optional message. New submissions are closed. Existing records
              retain their original consent context; they are not converted into
              accounts, church roles, or new subscriptions. Creating an account
              does not subscribe you to promotional email. You can unsubscribe
              from earlier communications using the email link or by emailing
              mcdrew169@yahoo.com.
            </p>
          </section>
          <section>
            <h2 className="mb-2 text-3xl">Cookies and Collection</h2>
            <p>
              A session cookie keeps you signed in. A separate
              reading-preference cookie can save appearance, text size, feed
              mode, and motion choices. These are not advertising cookies. The
              former page-view, button-click, and waitlist collection hooks are
              retired. Historical analytics records are retained; new reading
              analytics are not enabled by this change. Hosting and security
              services may retain operational logs.
            </p>
          </section>
          <section>
            <h2 className="mb-2 text-3xl">Data Sharing</h2>
            <p>
              We do not sell personal information. We may use service providers
              for hosting, analytics, and email delivery who process data on our
              behalf.
            </p>
          </section>
          <section>
            <h2 className="mb-2 text-3xl">Retention</h2>
            <p>
              Closing the waitlist does not delete historical records or change
              the consent under which they were collected. Account,
              contribution, and church records remain subject to their existing
              access controls. Contact us about access, correction, or deletion
              requests.
            </p>
          </section>
          <section>
            <h2 className="mb-2 text-3xl">Your Rights</h2>
            <p>
              Depending on your location, you may have rights to access,
              correct, delete, or limit use of your personal data. Contact
              mcdrew169@yahoo.com to request support.
            </p>
          </section>
          <section>
            <h2 className="mb-2 text-3xl">Security</h2>
            <p>
              We use reasonable administrative and technical safeguards, but no
              system can guarantee absolute security.
            </p>
          </section>
          <section>
            <h2 className="mb-2 text-3xl">Children</h2>
            <p>
              This website is not directed to children under 13, and we do not
              knowingly collect their personal information.
            </p>
          </section>
          <section>
            <h2 className="mb-2 text-3xl">Changes</h2>
            <p>
              We may update this policy as the platform evolves. The effective
              date above reflects the latest version.
            </p>
          </section>
          <section>
            <h2 className="mb-2 text-3xl">Contact</h2>
            <p>Questions: mcdrew169@yahoo.com</p>
          </section>
        </div>
      </article>
    </section>
  );
}
