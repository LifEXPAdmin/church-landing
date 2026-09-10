import Link from "next/link";
import {
  accountEntryHref,
  accountReason,
  accountReasons
} from "@/lib/platform/account-entry";

export function GuestAccountPrompt({
  next,
  reason
}: {
  next: string;
  reason: unknown;
}) {
  return (
    <section className="container-shell py-8 sm:py-10">
      <div className="mx-auto max-w-xl rounded-xl border border-gc-divider bg-gc-surface p-6 sm:p-8">
        <p className="gc-eyebrow mb-3">You are welcome here</p>
        <h1 className="text-4xl text-gc-text">
          {accountReasons[accountReason(reason)]}
        </h1>
        <p className="my-5 text-gc-muted">
          Public posts, comments and church pages are open to everyone. An
          account lets you connect and participate. After signing in, you’ll
          return to where you left off.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            className="gc-button"
            href={accountEntryHref("signup", next, reason)}
          >
            Join Godschurches
          </Link>
          <Link
            className="gc-button gc-button-quiet"
            href={accountEntryHref("login", next, reason)}
          >
            Sign in
          </Link>
        </div>
        <div className="mt-6 flex flex-wrap gap-5 text-gc-accent">
          <Link
            className="inline-flex min-h-11 items-center underline"
            href="/platform"
          >
            Keep browsing posts
          </Link>
          <Link
            className="inline-flex min-h-11 items-center underline"
            href="/platform/churches"
          >
            Explore churches
          </Link>
        </div>
      </div>
    </section>
  );
}
