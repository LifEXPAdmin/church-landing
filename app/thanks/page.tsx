import type { Metadata } from "next";
import { CheckCircle2 } from "lucide-react";

import { ThanksActions } from "@/components/thanks/thanks-actions";

const roleLabels: Record<string, string> = {
  BELIEVER: "Believer / Community",
  CHURCH: "Church / Pastor",
  CREATOR: "Creator / Preacher",
  BUSINESS: "Business",
  BUILDER: "Builder / Volunteer"
};

const roleNextSteps: Record<string, string[]> = {
  BELIEVER: [
    "We will send launch updates and community access details for believers.",
    "You will hear about local church discovery and daily faith features first.",
    "When invites open for your segment, we will contact you directly."
  ],
  CHURCH: [
    "We will send updates on church profiles, visibility tools, and outreach support.",
    "You will receive church-focused launch guidance and onboarding details.",
    "Partnership and funding pathway updates will go to your segment first."
  ],
  CREATOR: [
    "We will send creator access updates for teaching, testimony, and Gospel content.",
    "You will get launch notes for publishing tools and reach opportunities.",
    "Collaboration opportunities with churches and believers will be shared by email."
  ],
  BUSINESS: [
    "We will send business partnership opportunities tied to real ministry needs.",
    "You will receive updates on sponsorship lanes, hiring, and launch support work.",
    "Early invitations for Kingdom-focused collaboration will be role specific."
  ],
  BUILDER: [
    "We will send builder and volunteer updates for product, design, and operations needs.",
    "You will receive role-based opportunities to contribute during rollout phases.",
    "When technical and launch support roles open, your segment will hear first."
  ]
};

export const metadata: Metadata = {
  title: "Thanks for Joining",
  description: "Your waitlist request has been received."
};

export default async function ThanksPage({
  searchParams
}: {
  searchParams: Promise<{ role?: string }>;
}) {
  const params = await searchParams;
  const rawRole = params.role ?? "";
  const role = rawRole ? roleLabels[rawRole] : null;
  const nextSteps = rawRole ? roleNextSteps[rawRole] : [];

  return (
    <section className="container-shell py-24">
      <div className="mx-auto max-w-3xl rounded-3xl border border-border bg-card/80 p-8 sm:p-10">
        <h1 className="mb-4 text-center text-5xl">Thank you.</h1>
        <p className="mb-3 text-center text-lg text-muted-foreground">
          Your waitlist request has been received. We will follow up as early access opens.
        </p>
        {role ? <p className="mb-8 text-center text-sm text-muted-foreground">Segment: {role}</p> : <div className="mb-8" />}

        <div className="rounded-2xl border border-border/80 bg-muted/50 p-5">
          <p className="mb-3 text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">What happens next</p>
          <div className="space-y-2">
            {(nextSteps.length > 0
              ? nextSteps
              : [
                  "We will send updates as new features launch.",
                  "You will receive communication relevant to your selected role.",
                  "Early access invitations are sent in phases."
                ]
            ).map((step) => (
              <div key={step} className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-primary" />
                <p className="text-sm text-foreground/85">{step}</p>
              </div>
            ))}
          </div>
        </div>

        <ThanksActions role={rawRole || null} />
      </div>
    </section>
  );
}
