import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "Terms of service for Church (The Revival)."
};

export default function TermsPage() {
  return (
    <section className="container-shell py-16 sm:py-20">
      <article className="mx-auto max-w-3xl rounded-3xl border border-border bg-card/80 p-8 sm:p-12">
        <h1 className="mb-6 text-5xl">Terms of Service</h1>
        <p className="mb-8 text-sm text-muted-foreground">Effective date: February 21, 2026</p>

        <div className="space-y-8 text-base leading-relaxed text-foreground/95">
          <section>
            <h2 className="mb-2 text-3xl">Acceptance</h2>
            <p>
              By using this website, you agree to these Terms and our Privacy Policy. If you do not agree, please do
              not use the site.
            </p>
          </section>
          <section>
            <h2 className="mb-2 text-3xl">Purpose of Site</h2>
            <p>
              Church provides information about The Revival and a waitlist for future access. Features may change,
              pause, or be removed without notice while development continues.
            </p>
          </section>
          <section>
            <h2 className="mb-2 text-3xl">User Submissions</h2>
            <p>
              You agree to provide accurate information and not submit unlawful, abusive, or misleading content. We
              may remove or ignore submissions that violate these terms.
            </p>
          </section>
          <section>
            <h2 className="mb-2 text-3xl">Communications</h2>
            <p>
              You consent to receive operational and promotional emails related to Church and The Revival, with an
              option to unsubscribe.
            </p>
          </section>
          <section>
            <h2 className="mb-2 text-3xl">Intellectual Property</h2>
            <p>
              Site content, branding, and design are owned by Church or its licensors unless noted otherwise. You may
              not copy or republish site content for commercial use without permission.
            </p>
          </section>
          <section>
            <h2 className="mb-2 text-3xl">Third-Party Services</h2>
            <p>
              We may rely on third-party providers for hosting, analytics, forms, and email delivery. Their terms may
              also apply.
            </p>
          </section>
          <section>
            <h2 className="mb-2 text-3xl">Disclaimers</h2>
            <p>
              This site is provided &quot;as is&quot; without warranties of any kind. We do not guarantee
              uninterrupted service or that all content will always be error-free.
            </p>
          </section>
          <section>
            <h2 className="mb-2 text-3xl">Limitation of Liability</h2>
            <p>
              To the maximum extent permitted by law, Church is not liable for indirect, incidental, special, or
              consequential damages arising from site use.
            </p>
          </section>
          <section>
            <h2 className="mb-2 text-3xl">Changes</h2>
            <p>
              We may update these Terms from time to time. Continued use after updates means you accept the revised
              Terms.
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
