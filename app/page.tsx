import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";

import { CtaGrid } from "@/components/landing/cta-grid";
import { HowItWorksGrid } from "@/components/landing/how-it-works-grid";

const trustCards = [
  {
    title: "For Believers",
    body: "Connect with believers, discover churches, and grow in daily faith.",
    href: "/for-users"
  },
  {
    title: "For Churches",
    body: "Be discovered, supported, and connected to believers beyond Sunday.",
    href: "/for-churches"
  },
  {
    title: "For Creators",
    body: "Publish messages and testimony that help people grow in Christ.",
    href: "/for-creators"
  },
  {
    title: "For Businesses",
    body: "Fund and partner with Kingdom-focused work in practical ways.",
    href: "/for-businesses"
  }
];

const commitments = [
  "Christ-centered direction and language",
  "No spam, no noisy growth hacks",
  "Segmented communication by calling and role",
  "Real support for churches of all sizes"
];

export const metadata: Metadata = {
  title: "Revival Isn’t Coming. It’s Here.",
  description:
    "Church is alive every second of every day. Join the segmented waitlist for believers, churches, creators, businesses, and builders."
};

export default function HomePage() {
  return (
    <div className="bg-[#150f09]">
      <section className="relative min-h-[84svh] overflow-hidden border-b border-white/20">
        <Image
          src="/hero-desktop.jpg"
          alt="Sunrise over mountains and clouds"
          fill
          priority
          className="hidden object-cover object-center md:block"
          sizes="100vw"
        />
        <Image
          src="/hero-mobile.jpg"
          alt="Sunrise over mountains and clouds"
          fill
          priority
          className="object-cover object-center md:hidden"
          sizes="100vw"
        />

        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(240,194,129,0.58)_0%,rgba(16,13,10,0.46)_55%,rgba(10,8,6,0.64)_100%)] md:bg-[radial-gradient(circle_at_center,rgba(240,194,129,0.48)_0%,rgba(16,13,10,0.52)_55%,rgba(10,8,6,0.72)_100%)]" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/28 via-black/8 to-black/52 md:from-black/35 md:via-black/15 md:to-black/60" />

        <div className="container-shell relative flex min-h-[84svh] items-end pb-14 pt-24 sm:items-center sm:pb-16">
          <div className="w-full max-w-4xl text-white">
            <p className="mb-3 text-xs uppercase tracking-[0.24em] text-[#f4d8ab] sm:text-sm">The Revival Movement</p>
            <h1 className="text-balance text-5xl leading-[0.95] sm:text-6xl md:text-7xl">Revival Isn’t Coming. It’s Here.</h1>
            <p className="mt-5 max-w-2xl text-lg text-[#f4ede1] sm:text-2xl">
              Church is alive every second of every day.
            </p>
            <p className="mt-3 max-w-3xl text-base text-[#f5debc] sm:text-lg">
              A Christ-centered social platform where believers connect, churches grow, creators share the Gospel, and
              businesses fund Kingdom work.
            </p>
            <div className="mt-7">
              <CtaGrid />
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-3 text-sm text-[#f8e8d2]">
              <span>Launching with segmented access.</span>
              <span>•</span>
              <a href="mailto:mcdrew169@yahoo.com" className="underline decoration-[#f6d39f]/60 underline-offset-4">
                Contact directly
              </a>
            </div>

            <HowItWorksGrid />
          </div>
        </div>
      </section>

      <section className="container-shell py-14 sm:py-20">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {trustCards.map((card) => (
            <article key={card.title} className="rounded-2xl border border-[#f0d3a7]/30 bg-[#23180f]/80 p-6 text-[#f7ead5]">
              <h2 className="mb-3 text-3xl">{card.title}</h2>
              <p className="mb-6 text-[#e8d3b2]">{card.body}</p>
              <Link href={card.href} className="font-semibold text-[#f4c98c] hover:text-[#ffe7c3]">
                Learn more
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section className="container-shell pb-16 sm:pb-24">
        <div className="rounded-3xl border border-[#f0d3a7]/25 bg-[#1f1510]/85 p-7 text-[#f7ead5] sm:p-12">
          <h2 className="mb-4 text-4xl sm:text-5xl">Built to Be Stable While We Build the Full Platform</h2>
          <p className="mb-8 max-w-3xl text-[#e8d3b2] sm:text-lg">
            This landing site is designed to stay live, convert, and segment signups while core product work happens in
            the background.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {commitments.map((item) => (
              <div key={item} className="flex items-center gap-3 rounded-xl bg-black/25 px-4 py-3">
                <CheckCircle2 className="h-5 w-5 text-[#f4c98c]" />
                <p>{item}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
