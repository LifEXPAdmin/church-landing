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
          September 15, 2026.
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
            <h2 className="mb-2 text-3xl">Optional Platform Measurement</h2>
            <p>Settings → Privacy and interactions → Optional platform measurement lets you choose limited first-party measurement. It is off by default. When enabled, trusted foreground navigation on Home, Menu and discovery pages records your account and reporting day, and the service measures getting-started choices and successful ordinary follows, posts, replies, event responses and volunteering from current records. This is limited measured use, not reading time or proof of attention. It excludes private messages, prayer content and prayer acknowledgments, page addresses, advertising identifiers and faith scores.</p>
            <p className="mt-3">You can separately choose a declared referral category and coarse device/browser family. Full user-agent strings, arbitrary referrer addresses and precise locations are not stored for this measurement. Optional raw use and session facts are retained for up to 90 days. Turning measurement off removes them and optional dimensions; re-enabling starts new coverage. Your account export includes your current choice and retained facts. Deactivation, suspension and deletion remove optional use records. Restoring a backup disables restored choices before traffic can resume.</p>
            <p className="mt-3">Restricted administrators receive aggregate reports and need a separate permission for aggregate exports. Small complementary breakdowns are suppressed. Operational account creation method, current account states, church sources and unique support cases remain available from service records independently of optional use measurement. Anonymous daily lifecycle totals contain no account or content identifiers and remain as historical counts; personal-source reports can change after withdrawal or deletion. Metrics never grant access to an individual’s private case or content.</p>
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
            <h2 className="mb-2 text-3xl">Private Messages and Reports</h2>
            <p>
              Adult private messaging uses current account eligibility, contact
              preferences, explicit acceptance and blocking controls. We store
              conversation history and each participant&apos;s inbox choices.
              Clear for me removes messages from your view; the other
              participant may still retain their copy. Archive and temporary
              deactivation do not delete conversation history.
            </p>
            <p className="mt-3">
              Reports disclose only the selected item and necessary context to
              authorized review. Andrew, the founder, is the sole initial report
              reviewer, including reports involving himself. Reconsideration is
              founder review, not independent review. Reasons and review history
              remain restricted. Reporting and new messaging stay paused where
              current reviewer coverage is unavailable.
            </p>
            <p className="mt-3">
              Authors can receive a private explanation of a decision about
              their post or comment without the reporter&apos;s identity or
              private review notes. If you request reconsideration, your
              explanation and later replies are shared with the named assigned
              reviewer through a linked help case. The reviewer may be the
              original decision maker. This does not provide independent review
              or automatically restore restricted content.
            </p>
          </section>
          <section>
            <h2 className="mb-2 text-3xl">
              Welcomes and Optional Notifications
            </h2>
            <p>
              When founder welcomes are available, an eligible new account
              receives one clearly labeled automatic welcome after setup and
              verification. Choosing to reply opens the conversation with
              Andrew; it does not change your ordinary contact preferences or
              make you friends. Optional founder announcements have a separate
              preference from personal replies.
            </p>
            <p className="mt-3">
              Phone notifications require your deliberate Enable notifications
              action and browser permission. We store a private device
              subscription associated with your current sign-in. Delivery uses
              your browser&apos;s push service with a generic preview and an
              opaque reference; message bodies and report evidence are excluded.
              Opening a notification requires sign-in and current access. Quiet
              hours, category choices and conversation muting apply. Logging out
              or switching accounts revokes the old device association.
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
              for hosting, private storage, email and optional push delivery who
              process data on our behalf.
            </p>
          </section>
          <section>
            <h2 className="mb-2 text-3xl">Retention</h2>
            <p>
              A verified permanent account-deletion request immediately ends
              account access. Non-exempt personal data is removed from active
              systems within 30 calendar days. Permanent deletion is distinct
              from reversible deactivation. Settings explains availability,
              confirmation and any church or support duty handoff.
            </p>
            <p className="mt-3">
              Another participant may retain shared messages under Deleted
              member. Personal information you wrote in those messages may
              remain; contact us about a specific removal request. Once neither
              participant retains a message, its body and unnecessary linked
              data are removed within 30 days unless that selected item is
              needed for a report or documented preservation hold. Church-owned
              shared records retain their own ownership and access controls.
            </p>
            <p className="mt-3">
              Selected report evidence and necessary linked reconsideration
              records are reviewed while a case is open and removed within 180
              days after final closure, including after account closure.
              Removing your post or comment keeps it out of ordinary views;
              selected text needed for a report follows this same period. A
              documented hold preserves only the necessary records and is
              reviewed at least every 30 days. Ordinary recovery copies expire
              within 30 days of their original creation, so older backups may
              take up to 30 additional days after active deletion. Restoration
              must reapply deletion and current access controls before the
              service reopens.
            </p>
            <p className="mt-3">
              Minimal deletion receipts contain references, dates and outcomes
              without message bodies or credentials and are retained for 90 days
              after completed removal. Content-free push diagnostics are
              retained for 14 days after the final attempt. Revoked device
              associations stop sending immediately; endpoint and key material
              is removed within 24 hours of detection. We cannot remove copies
              someone has independently saved, such as screenshots.
            </p>
            <p className="mt-3">
              Closing the waitlist does not change the original consent context
              of historical records. Contact us about access, correction or
              deletion requests concerning those records.
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
