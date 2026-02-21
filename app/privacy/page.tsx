import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "Privacy policy for Church (The Revival)."
};

export default function PrivacyPage() {
  return (
    <section className="container-shell py-16 sm:py-20">
      <article className="mx-auto max-w-3xl rounded-3xl border border-border bg-card/80 p-8 sm:p-12">
        <h1 className="mb-6 text-5xl">Privacy Policy</h1>
        <p className="mb-8 text-sm text-muted-foreground">Effective date: February 21, 2026</p>

        <div className="space-y-8 text-base leading-relaxed text-foreground/95">
          <section>
            <h2 className="mb-2 text-3xl">What We Collect</h2>
            <p>
              We collect information you provide through our waitlist form: name, email address, selected role, and
              optional message. We also collect basic usage data (page views and button clicks) to improve the site.
            </p>
          </section>
          <section>
            <h2 className="mb-2 text-3xl">How We Use Information</h2>
            <p>
              We use your information to manage the waitlist, send product updates, share role-relevant opportunities,
              and respond to requests. We segment communications by role so churches, creators, businesses, believers,
              and builders can receive relevant updates.
            </p>
          </section>
          <section>
            <h2 className="mb-2 text-3xl">Email Communications</h2>
            <p>
              By submitting the waitlist form, you agree to receive emails related to Church and The Revival. You can
              unsubscribe at any time using the link in emails or by emailing mcdrew169@yahoo.com.
            </p>
          </section>
          <section>
            <h2 className="mb-2 text-3xl">Data Sharing</h2>
            <p>
              We do not sell personal information. We may use service providers for hosting, analytics, and email
              delivery who process data on our behalf.
            </p>
          </section>
          <section>
            <h2 className="mb-2 text-3xl">Retention</h2>
            <p>
              We keep waitlist information while preparing product launch and outreach operations, then retain only the
              data necessary for lawful business purposes.
            </p>
          </section>
          <section>
            <h2 className="mb-2 text-3xl">Your Rights</h2>
            <p>
              Depending on your location, you may have rights to access, correct, delete, or limit use of your
              personal data. Contact mcdrew169@yahoo.com to request support.
            </p>
          </section>
          <section>
            <h2 className="mb-2 text-3xl">Security</h2>
            <p>
              We use reasonable administrative and technical safeguards, but no system can guarantee absolute security.
            </p>
          </section>
          <section>
            <h2 className="mb-2 text-3xl">Children</h2>
            <p>
              This website is not directed to children under 13, and we do not knowingly collect their personal
              information.
            </p>
          </section>
          <section>
            <h2 className="mb-2 text-3xl">Changes</h2>
            <p>
              We may update this policy as the platform evolves. The effective date above reflects the latest version.
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
