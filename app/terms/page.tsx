import { publicMetadata } from "@/lib/site-metadata";

export const metadata = publicMetadata(
  "Terms of Service",
  "Terms for using Godschurches.",
  "/terms"
);

export default function TermsPage() {
  return (
    <section className="container-shell py-16 sm:py-20">
      <article className="gc-info-article">
        <h1 className="mb-6 text-5xl">Terms of Service</h1>
        <p className="mb-8 text-sm">
          Original terms: February 21, 2026. Service information updated
          September 9, 2026.
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
              Godschurches provides public conversations, personal accounts, and
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
              Site content, branding, and design are owned by Godschurches or
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
              To the maximum extent permitted by law, Godschurches is not liable
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
