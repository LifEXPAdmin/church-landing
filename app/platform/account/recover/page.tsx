import type { Metadata } from "next";
import Link from "next/link";
import { RecoveryForm } from "@/components/platform/recovery-form";
import { accountConfig } from "@/lib/platform/account-config";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Account recovery",
  robots: { index: false, follow: false },
  referrer: "no-referrer"
};
export default function RecoveryPage() {
  let available = false;
  try {
    available = accountConfig().delivery !== "disabled";
  } catch {
    /* A missing sender is unavailable, not a successful delivery. */
  }
  return (
    <section className="container-shell py-10">
      <div className="mx-auto max-w-xl rounded-3xl border border-[#f2d8af]/20 bg-[#1a120c] p-6 text-[#f8ead6] sm:p-8">
        <h1 className="mb-6 text-4xl text-white">Account recovery</h1>
        <RecoveryForm available={available} />
        <Link
          href="/platform/login"
          className="mt-8 block text-[#f4c98c] underline"
        >
          Back to sign in
        </Link>
      </div>
    </section>
  );
}
