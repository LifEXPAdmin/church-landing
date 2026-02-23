import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Church, Handshake, MicVocal, Users } from "lucide-react";

import { CtaGrid } from "@/components/landing/cta-grid";
import { FaithTraceGame } from "@/components/landing/faith-trace-game";
import { HowItWorksGrid } from "@/components/landing/how-it-works-grid";

const audienceCards = [
  {
    title: "For Believers",
    body: "Build a daily rhythm of prayer, Scripture, fellowship, and trusted Christian connection.",
    href: "/for-users"
  },
  {
    title: "For Churches",
    body: "Help your local church stay visible, supported, and connected all week long.",
    href: "/for-churches"
  },
  {
    title: "For Creators",
    body: "Share teaching, testimony, and messages with people seeking real spiritual growth.",
    href: "/for-creators"
  },
  {
    title: "For Businesses",
    body: "Partner with confidence in meaningful projects that serve churches and communities.",
    href: "/for-businesses"
  }
];

const visionCards = [
  {
    icon: Users,
    title: "Christian-First Connection",
    body: "A digital home for believers to connect in truth, prayer, discipleship, and real community."
  },
  {
    icon: Church,
    title: "Local Church Strength",
    body: "Designed to help local churches be discovered, supported, and connected beyond Sunday gatherings."
  },
  {
    icon: MicVocal,
    title: "Voices With Purpose",
    body: "Creators and preachers can share Gospel-centered messages without chasing empty engagement."
  },
  {
    icon: Handshake,
    title: "Kingdom Collaboration",
    body: "Businesses, builders, and volunteers can support Kingdom work through practical partnership."
  }
] as const;

const commitments = [
  "Christ-centered direction and language",
  "No spam, no noisy growth hacks",
  "Segmented communication by calling and role",
  "Real support for churches of all sizes"
];

const faqItems = [
  {
    question: "Is Church replacing local churches?",
    answer:
      "No. Church exists to strengthen local churches, not replace them. Our goal is to help churches be discovered, supported, and connected with people who are seeking Christ."
  },
  {
    question: "What kind of platform is this?",
    answer:
      "Church is a Christian-first connection platform. It combines community, teaching, church visibility, and practical partnership in one place centered on Christ."
  },
  {
    question: "Why do I need to choose a role?",
    answer:
      "Role-based signup helps us send you updates that match your calling, whether you are a believer, church leader, creator, business owner, or builder."
  },
  {
    question: "When will full access launch?",
    answer:
      "Access is rolling out in phases. Waitlist members receive updates, invitations, and opportunities first based on their role segment."
  },
  {
    question: "How will my information be used?",
    answer:
      "We only use your information for launch communication, role-specific updates, and relevant partnership messages. We do not sell your data."
  }
];

export const metadata: Metadata = {
  title: "Revival Isn’t Coming. It’s Here.",
  description:
    "Church is alive every second of every day. Join the Christian-first connection platform for believers, churches, creators, businesses, and builders."
};

export default function HomePage() {
  return (
    <div className="bg-[#150f09]">
      <section className="relative min-h-[86svh] overflow-hidden border-b border-white/20">
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

        <div className="container-shell relative flex min-h-[86svh] items-end pb-12 pt-20 sm:items-center sm:pb-16 sm:pt-24">
          <div className="w-full max-w-4xl text-white">
            <p className="mb-3 text-xs uppercase tracking-[0.24em] text-[#f4d8ab] sm:text-sm">The Revival Movement</p>
            <h1 className="text-balance text-[2.65rem] leading-[0.95] sm:text-6xl md:text-7xl">Revival Isn’t Coming. It’s Here.</h1>
            <p className="mt-4 max-w-2xl text-lg text-[#f4ede1] sm:mt-5 sm:text-2xl">
              Church is alive every second of every day.
            </p>
            <p className="mt-3 max-w-3xl text-base text-[#f5debc] sm:text-lg">
              A Christian-first connection platform where believers grow in faith, churches are strengthened, creators
              share the Gospel, and businesses support Kingdom work.
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
              <span className="hidden sm:inline">•</span>
              <FaithTraceGame />
            </div>

            <HowItWorksGrid />
          </div>
        </div>
      </section>

      <section className="container-shell py-14 sm:py-20">
        <div className="mb-8 max-w-3xl">
          <h2 className="text-4xl text-[#f7ead5] sm:text-5xl">What Church Is Building</h2>
          <p className="mt-3 text-[#e8d3b2] sm:text-lg">
            We are building a stable front door today and a full platform in the background. These are the core
            outcomes we are focused on from day one.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {visionCards.map((card) => {
            const Icon = card.icon;

            return (
              <article
                key={card.title}
                className="rounded-2xl border border-[#f0d3a7]/30 bg-[linear-gradient(150deg,rgba(43,30,20,0.88),rgba(29,20,13,0.88))] p-6 text-[#f7ead5]"
              >
                <div className="mb-3 inline-flex rounded-xl border border-[#f2d8af]/35 bg-black/25 p-2.5">
                  <Icon className="h-5 w-5 text-[#f5ce94]" />
                </div>
                <h3 className="mb-2 text-3xl">{card.title}</h3>
                <p className="text-[#e8d3b2]">{card.body}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="container-shell pb-16">
        <div className="mb-7 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-4xl text-[#f7ead5] sm:text-5xl">Built for Every Calling</h2>
            <p className="mt-2 max-w-2xl text-[#e8d3b2]">
              Every part of Church is designed with role-specific needs in mind.
            </p>
          </div>
          <Link href="/join?source=audience-section" className="hidden items-center gap-1 text-[#f4c98c] hover:text-[#ffe7c3] sm:inline-flex">
            Join the waitlist
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {audienceCards.map((card) => (
            <article key={card.title} className="rounded-2xl border border-[#f0d3a7]/30 bg-[#23180f]/80 p-6 text-[#f7ead5]">
              <h3 className="mb-3 text-3xl">{card.title}</h3>
              <p className="mb-6 text-[#e8d3b2]">{card.body}</p>
              <Link href={card.href} className="font-semibold text-[#f4c98c] hover:text-[#ffe7c3]">
                Learn more
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section className="container-shell pb-16">
        <div className="rounded-3xl border border-[#f0d3a7]/25 bg-[#1f1510]/85 p-7 text-[#f7ead5] sm:p-12">
          <h2 className="mb-5 text-4xl sm:text-5xl">Questions People Ask First</h2>
          <div className="space-y-3">
            {faqItems.map((item) => (
              <details key={item.question} className="group rounded-xl border border-[#f2d8af]/30 bg-black/25 px-5 py-4">
                <summary className="cursor-pointer list-none text-lg text-[#ffe8c5]">{item.question}</summary>
                <p className="mt-3 text-[#e8d3b2]">{item.answer}</p>
              </details>
            ))}
          </div>
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
          <div className="mt-7">
            <Link
              href="/join?source=final-section"
              className="inline-flex items-center gap-2 rounded-full bg-[#c38a45] px-6 py-3 font-semibold text-white transition-colors hover:bg-[#aa7537]"
            >
              Join the Founding Waitlist
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
