import type { PrismaClient } from "@prisma/client";
import { accountConfig } from "./account-config";
import { allowAccountAttempt } from "./account-limits";
import { requestSessionToken, readBody } from "./account-boundary";
import { readAccountSession } from "./accounts";
import { PortalError } from "./portal";
import { calendarCommand } from "./calendar-commands";
import {
  getCalendars,
  getCalendarDetails,
  getCalendarAgenda,
  getCalendarEvent,
  getPublicChurchAgenda,
  getPublicCalendarEvent,
  getCalendarCommitments
} from "./calendar-reads";

const headers = {
  "Cache-Control": "private, no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow",
  Vary: "Cookie"
};
export async function handleCalendarRequest(
  db: PrismaClient,
  request: Request
) {
  try {
    const token = requestSessionToken(request);
    if (request.method === "GET") {
      const url = new URL(request.url);
      const view = url.searchParams.get("view") ?? "calendars";
      const p = (key: string) => url.searchParams.get(key) ?? "";
      const range = {
        from: p("from"),
        until: p("until"),
        timeZone: p("timeZone")
      };
      let result: unknown;
      if (view === "public-agenda")
        result = await getPublicChurchAgenda(db, {
          churchId: p("churchId"),
          ...range
        });
      else if (view === "public-event")
        result = await getPublicCalendarEvent(db, p("occurrenceId"));
      else if (view === "calendars")
        result = await getCalendars(db, token, {
          churchId: p("churchId") || undefined,
          cursor: p("cursor") || undefined
        });
      else if (view === "calendar")
        result = await getCalendarDetails(db, token, p("calendarId"));
      else if (view === "agenda")
        result = await getCalendarAgenda(db, token, {
          calendarIds: url.searchParams.getAll("calendarId"),
          ...range
        });
      else if (view === "event")
        result = await getCalendarEvent(db, token, p("occurrenceId"));
      else if (view === "commitments")
        result = await getCalendarCommitments(db, token, range);
      else throw new PortalError(400, "Choose a calendar view.");
      return Response.json(result, { headers });
    }
    if (request.method !== "POST")
      return Response.json(
        { message: "Use the calendar form." },
        { status: 405, headers }
      );
    const config = accountConfig();
    if (
      request.headers.get("origin") !== config.origin ||
      request.headers.get("sec-fetch-site") === "cross-site"
    )
      throw new PortalError(
        403,
        "Open the calendar form on this website and try again."
      );
    let input: Record<string, unknown>;
    try {
      // Event notes may contain 5,000 Unicode characters plus bounded metadata.
      // Keep a byte limit while allowing the complete advertised form sizes.
      input = await readBody(request, 32768);
    } catch {
      throw new PortalError(400, "Check the calendar fields.");
    }
    if (typeof input.operation !== "string" || input.operation.length > 30)
      throw new PortalError(400, "Choose a calendar action.");
    const actor = await readAccountSession(db, token);
    if (!actor) throw new PortalError(401, "Sign in to continue.");
    const ip = process.env.VERCEL
      ? (request.headers.get("x-real-ip") ?? "unknown").slice(0, 64)
      : "local";
    if (
      !(await allowAccountAttempt(
        db,
        config.rateSecret + ":calendars",
        input.operation,
        ip,
        actor.id
      ))
    )
      throw new PortalError(
        429,
        "Too many changes. Wait 15 minutes and try again."
      );
    return Response.json(await calendarCommand(db, token, input), {
      headers
    });
  } catch (error) {
    if (error instanceof PortalError)
      return Response.json(
        { message: error.message },
        { status: error.status, headers }
      );
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "P2002"
    )
      return Response.json(
        {
          message:
            "This submission conflicts with a saved change. Refresh and check its status."
        },
        { status: 409, headers }
      );
    return Response.json(
      {
        message:
          "The calendar service could not load or save this information. Please try again."
      },
      { status: 503, headers }
    );
  }
}
