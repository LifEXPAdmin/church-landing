"use client";
import Link from "next/link";
import type { AdminOverviewSnapshot } from "@/lib/platform/admin-overview";

export function AdminOverview({ data }: { data: AdminOverviewSnapshot }) {
  const cards = data.requests
    ? [
        { label: "Open requests", count: data.requests.open, query: "" },
        {
          label: "Unassigned open requests",
          count: data.requests.unassigned,
          query: "owner=UNASSIGNED"
        },
        {
          label: "Urgent open requests",
          count: data.requests.urgent,
          query: "priority=URGENT"
        },
        {
          label: "Open requests with a reminder due",
          count: data.requests.due,
          query: "due=1"
        },
        {
          label: "Open requests at least a week old",
          count: data.requests.aged,
          query: "age=7"
        },
        ...(data.navigation.canReviewClaims
          ? [
              {
                label: "Open church requests",
                count: data.requests.claims,
                query: "type=CLAIM"
              }
            ]
          : [])
      ]
    : [];
  return (
    <div className="space-y-5">
      <h1 className="text-3xl font-semibold">Admin overview</h1>
      {cards.length > 0 && (
        <>
          <h2 className="text-xl font-semibold">
            Current work needing attention
          </h2>
          <p className="text-sm text-gc-muted">
            Open records within your current permissions, checked{" "}
            {new Date(data.checkedAt).toLocaleString()}. Each count links to
            those exact filters. Native source states remain separate.
          </p>
          <ul className="grid gap-4 sm:grid-cols-2">
            {cards.map((card) => (
              <li key={card.label}>
                <Link
                  className="block rounded-xl border border-gc-divider p-5 text-gc-accent"
                  href={
                    "/platform/admin/requests" +
                    (card.query ? "?" + card.query : "")
                  }
                >
                  <span className="block text-3xl font-semibold">
                    {card.count}
                  </span>
                  <span className="underline">{card.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
      <h2 className="text-xl font-semibold">Your permitted sections</h2>
      <ul className="grid gap-4 sm:grid-cols-2">
        {data.navigation.sections
          .filter((s) => s.key !== "overview")
          .map((s) => (
            <li key={s.key}>
              <Link
                className="block rounded-xl border border-gc-divider p-5 text-lg font-semibold text-gc-accent underline"
                href={s.href}
              >
                {s.label}
              </Link>
            </li>
          ))}
      </ul>
      {data.navigation.sections.length === 1 && (
        <p>Your assigned capability has no connected view available yet.</p>
      )}
    </div>
  );
}
