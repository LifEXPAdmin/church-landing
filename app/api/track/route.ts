import { NextRequest, NextResponse } from "next/server";
import { AnalyticsEventType, WaitlistRole } from "@prisma/client";

import { trackEvent } from "@/lib/analytics";

const EVENT_TYPES = new Set<AnalyticsEventType>([
  "PAGE_VIEW",
  "CTA_CLICK",
  "JOIN_SUBMIT",
  "JOIN_SUCCESS"
]);

const ROLES = new Set<WaitlistRole>([
  "BELIEVER",
  "CHURCH",
  "CREATOR",
  "BUSINESS",
  "BUILDER"
]);

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      eventType?: AnalyticsEventType;
      path?: string;
      role?: WaitlistRole;
      label?: string;
    };

    if (
      !body.eventType ||
      !EVENT_TYPES.has(body.eventType) ||
      typeof body.path !== "string" ||
      body.path.length > 300
    ) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    if (
      body.path.includes("/platform") ||
      request.headers.get("referer")?.includes("/platform")
    ) {
      return NextResponse.json({ ok: true });
    }

    // General analytics never accepts arbitrary paths, labels, or referrers.
    if (
      !/^\/(?:manifesto|for-users|for-churches|for-creators|for-businesses|join|thanks|privacy|terms)?$/.test(
        body.path
      )
    )
      return NextResponse.json({ ok: true });

    await trackEvent({
      eventType: body.eventType,
      path: body.path,
      role: body.role && ROLES.has(body.role) ? body.role : undefined,
      label: undefined,
      referrer: null,
      userAgent: request.headers.get("user-agent"),
      ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
