import Link from "next/link";
import { WaitlistRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const roleLabels: Record<WaitlistRole, string> = {
  BELIEVER: "Believers",
  CHURCH: "Churches",
  CREATOR: "Creators",
  BUSINESS: "Businesses",
  BUILDER: "Builders"
};

const roles = Object.keys(roleLabels) as WaitlistRole[];

export default async function AdminWaitlistPage({
  searchParams
}: {
  searchParams: Promise<{ role?: WaitlistRole }>;
}) {
  const params = await searchParams;
  const activeRole = roles.includes(params.role as WaitlistRole) ? (params.role as WaitlistRole) : null;

  const [signups, grouped] = await Promise.all([
    prisma.waitlistSignup.findMany({
      where: activeRole ? { role: activeRole } : undefined,
      orderBy: {
        createdAt: "desc"
      }
    }),
    prisma.waitlistSignup.groupBy({
      by: ["role"],
      _count: true
    })
  ]);

  const counts = Object.fromEntries(roles.map((r) => [r, grouped.find((g) => g.role === r)?._count ?? 0])) as Record<
    WaitlistRole,
    number
  >;

  return (
    <section className="container-shell py-12 sm:py-16">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl">Waitlist Admin</h1>
          <p className="text-muted-foreground">{signups.length} signup(s) shown</p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href={activeRole ? `/admin/waitlist/export?role=${activeRole}` : "/admin/waitlist/export"}
            className="inline-flex h-11 items-center rounded-full bg-primary px-5 font-semibold text-primary-foreground"
          >
            Download CSV
          </Link>
          <Link href="/admin/analytics" className="text-sm font-semibold text-primary hover:underline">
            View Analytics
          </Link>
        </div>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        <Link
          href="/admin/waitlist"
          className={`rounded-full px-4 py-2 text-sm ${activeRole === null ? "bg-primary text-white" : "bg-muted"}`}
        >
          All ({Object.values(counts).reduce((sum, v) => sum + v, 0)})
        </Link>
        {roles.map((role) => (
          <Link
            key={role}
            href={`/admin/waitlist?role=${role}`}
            className={`rounded-full px-4 py-2 text-sm ${activeRole === role ? "bg-primary text-white" : "bg-muted"}`}
          >
            {roleLabels[role]} ({counts[role]})
          </Link>
        ))}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="min-w-full divide-y divide-border text-left text-sm">
          <thead className="bg-muted/60">
            <tr>
              <th className="px-4 py-3 font-semibold">Created</th>
              <th className="px-4 py-3 font-semibold">Role</th>
              <th className="px-4 py-3 font-semibold">Name</th>
              <th className="px-4 py-3 font-semibold">Email</th>
              <th className="px-4 py-3 font-semibold">Source</th>
              <th className="px-4 py-3 font-semibold">Message</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {signups.map((signup) => (
              <tr key={signup.id}>
                <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                  {signup.createdAt.toISOString().replace("T", " ").slice(0, 19)}
                </td>
                <td className="px-4 py-3">{signup.role}</td>
                <td className="px-4 py-3">{signup.name}</td>
                <td className="px-4 py-3">{signup.email}</td>
                <td className="px-4 py-3">{signup.source ?? "-"}</td>
                <td className="px-4 py-3 text-muted-foreground">{signup.message ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
