import { NextResponse } from "next/server";
import { WaitlistRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";

function escapeCsvCell(value: string) {
  if (/^[=+\-@]/.test(value)) {
    return `'${value}`;
  }

  if (value.includes(",") || value.includes("\n") || value.includes('"')) {
    return `"${value.replace(/"/g, '""')}"`;
  }

  return value;
}

const ROLES = new Set<WaitlistRole>(["BELIEVER", "CHURCH", "CREATOR", "BUSINESS", "BUILDER"]);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const roleParam = searchParams.get("role");
  const role = roleParam && ROLES.has(roleParam as WaitlistRole) ? (roleParam as WaitlistRole) : undefined;

  const signups = await prisma.waitlistSignup.findMany({
    where: role ? { role } : undefined,
    orderBy: {
      createdAt: "desc"
    }
  });

  const headers = ["id", "createdAt", "role", "name", "email", "source", "message"];

  const rows = signups.map((signup) =>
    [
      signup.id,
      signup.createdAt.toISOString(),
      signup.role,
      signup.name,
      signup.email,
      signup.source ?? "",
      signup.message ?? ""
    ]
      .map((cell) => escapeCsvCell(String(cell)))
      .join(",")
  );

  const csv = [headers.join(","), ...rows].join("\n");

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename=waitlist-signups${role ? `-${role.toLowerCase()}` : ""}.csv`
    }
  });
}
