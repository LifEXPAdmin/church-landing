import Link from "next/link";

export const portalLinkClass =
  "inline-flex min-h-11 items-center rounded-lg py-2 text-sm font-semibold text-[#f4c98c] underline decoration-[#f4c98c]/40 underline-offset-4 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f4c98c]";

export function PortalCard({
  title,
  children
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="min-w-0 rounded-2xl border border-[#f2d8af]/20 bg-[#1a120c] p-5 sm:p-6">
      <h2 className="mb-4 text-3xl leading-tight text-white">{title}</h2>
      <div className="space-y-4 break-words">{children}</div>
    </section>
  );
}

export function PortalHeading({
  title,
  description
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="mb-7 border-l-2 border-[#f4c98c] pl-4">
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#f4c98c]">
        Godschurches
      </p>
      <h1 className="text-4xl leading-tight text-white sm:text-5xl">{title}</h1>
      <p className="mt-3 max-w-2xl leading-relaxed text-[#d8c4a8]">
        {description}
      </p>
    </div>
  );
}

export function PortalEmpty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-[#f2d8af]/25 p-5 leading-relaxed text-[#d8c4a8]">
      {children}
    </p>
  );
}

export function PortalStatus({ state }: { state: string }) {
  const labels: Record<string, string> = {
    PENDING: "Awaiting review",
    APPROVED: "Approved",
    DECLINED: "Declined",
    WITHDRAWN: "Withdrawn",
    LEFT: "Left church",
    REMOVED: "Removed"
  };
  return (
    <span
      className={`inline-flex rounded-full border px-3 py-1 text-sm ${state === "APPROVED" ? "border-emerald-300/30 bg-emerald-950/40 text-emerald-100" : "border-[#f4c98c]/30 bg-[#f4c98c]/10 text-[#f4c98c]"}`}
    >
      {labels[state] ?? "Status unavailable"}
    </span>
  );
}

export function PortalHelpContact() {
  return (
    <PortalCard title="Contact Godschurches directly">
      <p className="leading-relaxed text-[#d8c4a8]">
        You can use the website&apos;s published contact email independently of
        church approval or a coordinator assignment.
      </p>
      <a
        className={`${portalLinkClass} break-all`}
        href="mailto:mcdrew169@yahoo.com"
      >
        mcdrew169@yahoo.com
      </a>
      <p className="text-sm text-[#d8c4a8]">
        This opens your email app. Nothing is submitted through this page. Never
        send your password or sign-in codes.
      </p>
      <Link href="/platform/account/recover" className={portalLinkClass}>
        Account recovery and email verification
      </Link>
    </PortalCard>
  );
}

export function PortalContactDetails({
  email,
  phone
}: {
  email?: string;
  phone?: string;
}) {
  return (
    <div className="flex flex-col items-start">
      {email && (
        <a
          href={`mailto:${encodeURIComponent(email)}`}
          className={`${portalLinkClass} break-all`}
        >
          {email}
        </a>
      )}
      {phone && (
        <a
          href={`tel:${phone.replace(/[^+\d]/g, "")}`}
          className={portalLinkClass}
        >
          {phone}
        </a>
      )}
      {!email && !phone && (
        <p className="text-sm text-[#d8c4a8]">No contact details shared.</p>
      )}
    </div>
  );
}
