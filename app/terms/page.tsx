import { publicMetadata } from "@/lib/site-metadata";

export const metadata = publicMetadata(
  "Terms of Service",
  "Terms for using God’s Churches.",
  "/terms"
);

export default function TermsPage() {
  return (
    <section className="container-shell py-16 sm:py-20">
      <article className="gc-info-article">
        <h1 className="mb-6 text-5xl">Terms of Service</h1>
        <p className="mb-8 text-sm">
          Original terms: February 21, 2026. Service information updated
          September 16, 2026.
        </p>

        <div className="space-y-8 text-base leading-relaxed">
          <section>
            <h2 className="mb-2 text-3xl">Acceptance</h2>
            <p>
              By using this website, you agree to these Terms and our Privacy
              Policy. If you do not agree, please do not use the site.
            </p>
          </section>
          <section>
            <h2 className="mb-2 text-3xl">Purpose of Site</h2>
            <p>
              God’s Churches provides public conversations, personal accounts, and
              church tools with separate access requirements. Features may
              change, pause, or be removed without notice while development
              continues.
            </p>
          </section>
          <section>
            <h2 className="mb-2 text-3xl">User Submissions</h2>
            <p>
              You agree to provide accurate information and not submit unlawful,
              abusive, or misleading content. We may remove or ignore
              submissions that violate these terms.
            </p>
          </section>
          <section>
            <h2 className="mb-2 text-3xl">Community Exchange</h2>
            <p>
              Exchange listings describe permitted ordinary items, item requests
              or lawful skilled help. Follow the listing guidance and describe
              items and qualifications accurately. Service qualifications are
              stated by the person offering help; God’s Churches does not verify
              professional licenses, training, insurance or suitability. A
              displayed price, needed-by date or reserved status does not create
              a payment, booking, employment or fulfillment agreement by itself.
              God’s Churches does not take payments or deposits or provide escrow.
              Account verification does not guarantee another person&apos;s
              safety. Existing contact preferences, consent and reporting
              controls apply.
            </p>
            <p className="mt-3">
              Private Exchange handoffs record a proposed window and the
              participants’ agreement to that plan. Either participant may
              cancel. A completion or missed-pickup record is that participant’s
              statement, not independent proof of fulfillment or a public
              misconduct finding. Expired and canceled holds leave the listing
              closed for owner review. Reminders do not guarantee delivery,
              exact timing or attendance.
            </p>
            <p className="mt-3">
              Church Needs separates promises, paid quotes and organizer-confirmed
              receipts. Accepting a quote does not take payment, and recording a
              receipt does not provide independent evidence or a tax receipt.
              Ordinary equipment loans require explicit return terms; receipt,
              cancellation and closing do not erase an outstanding return.
              Financial loans and medical transport are unavailable. Organizers
              and contributors remain responsible for arranging appropriate help.
            </p>
          </section>
          <section>
            <h2 className="mb-2 text-3xl">Communications</h2>
            <p>
              Creating an account does not enroll you in promotional email or
              convert an earlier waitlist entry into an account. Historical
              communication preferences retain their original context and
              unsubscribe options. Account recovery and verification email
              availability is stated on the relevant account page.
            </p>
          </section>
          <section>
            <h2 className="mb-2 text-3xl">Intellectual Property</h2>
            <p>
              Site content, branding, and design are owned by God’s Churches or
              its licensors unless noted otherwise. You may not copy or
              republish site content for commercial use without permission.
            </p>
          </section>
          <section>
            <h2 className="mb-2 text-3xl">Third-Party Services</h2>
            <p>
              We may rely on third-party providers for hosting, analytics,
              forms, and email delivery. Their terms may also apply.
            </p>
          </section>
          <section>
            <h2 className="mb-2 text-3xl">Disclaimers</h2>
            <p>
              This site is provided &quot;as is&quot; without warranties of any
              kind. We do not guarantee uninterrupted service or that all
              content will always be error-free.
            </p>
          </section>
          <section>
            <h2 className="mb-2 text-3xl">Limitation of Liability</h2>
            <p>
              To the maximum extent permitted by law, God’s Churches is not liable
              for indirect, incidental, special, or consequential damages
              arising from site use.
            </p>
          </section>
          <section>
            <h2 className="mb-2 text-3xl">Changes</h2>
            <p>
              We may update these Terms from time to time. Continued use after
              updates means you accept the revised Terms.
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
