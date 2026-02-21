import Link from "next/link";

import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function AdminAnalyticsPage() {
  const [eventCounts, recent] = await Promise.all([
    prisma.waitlistEvent.groupBy({
      by: ["eventType"],
      _count: true
    }),
    prisma.waitlistEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: 100
    })
  ]);

  return (
    <section className="container-shell py-12 sm:py-16">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl">Landing Analytics</h1>
          <p className="text-muted-foreground">Recent interaction events and conversions</p>
        </div>
        <Link href="/admin/waitlist" className="text-sm font-semibold text-primary hover:underline">
          Back to Waitlist
        </Link>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-4">
        {eventCounts.map((event) => (
          <div key={event.eventType} className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{event.eventType}</p>
            <p className="text-3xl font-semibold">{event._count}</p>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="min-w-full divide-y divide-border text-left text-sm">
          <thead className="bg-muted/60">
            <tr>
              <th className="px-4 py-3 font-semibold">Time</th>
              <th className="px-4 py-3 font-semibold">Event</th>
              <th className="px-4 py-3 font-semibold">Path</th>
              <th className="px-4 py-3 font-semibold">Role</th>
              <th className="px-4 py-3 font-semibold">Label</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {recent.map((event) => (
              <tr key={event.id}>
                <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                  {event.createdAt.toISOString().replace("T", " ").slice(0, 19)}
                </td>
                <td className="px-4 py-3">{event.eventType}</td>
                <td className="px-4 py-3">{event.path}</td>
                <td className="px-4 py-3">{event.role ?? "-"}</td>
                <td className="px-4 py-3">{event.label ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
