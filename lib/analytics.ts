import crypto from "node:crypto";

import { WaitlistRole, type AnalyticsEventType } from "@prisma/client";

import { prisma } from "@/lib/prisma";

interface TrackEventInput {
  eventType: AnalyticsEventType;
  path: string;
  role?: WaitlistRole;
  label?: string;
  userAgent?: string | null;
  referrer?: string | null;
  ip?: string | null;
}

export async function trackEvent(input: TrackEventInput) {
  const ipHash = input.ip
    ? crypto.createHash("sha256").update(`${input.ip}:${process.env.ANALYTICS_SALT ?? "church"}`).digest("hex")
    : null;

  await prisma.waitlistEvent.create({
    data: {
      eventType: input.eventType,
      path: input.path,
      role: input.role,
      label: input.label,
      userAgent: input.userAgent ?? null,
      referrer: input.referrer ?? null,
      ipHash
    }
  });
}
