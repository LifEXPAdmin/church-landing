import type { PrismaClient } from "@prisma/client";
import { publicChurchWhere, publicEventWhere } from "./public-discovery-policy";
import { indexingEnvironment } from "../indexing-policy";

export function serializeStructuredData(value: unknown) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
export async function publicStructuredData(
  db: PrismaClient,
  kind: "church" | "event",
  id: string
) {
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) return null;
  const origin = indexingEnvironment().origin;
  if (kind === "church") {
    const row = await db.church.findFirst({
      where: { ...publicChurchWhere, id },
      select: {
        name: true,
        summary: true,
        city: true,
        region: true,
        country: true
      }
    });
    if (!row) return null;
    // Organization describes the congregation without inventing a building or
    // asserting verified authority. Supplied locality is not a street address.
    return {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: row.name,
      url: origin + "/platform/churches/" + id,
      ...(row.summary ? { description: row.summary } : {}),
      ...([row.city, row.region, row.country].some(Boolean)
        ? {
            location: {
              "@type": "Place",
              name: [row.city, row.region, row.country]
                .filter(Boolean)
                .join(", ")
            }
          }
        : {})
    };
  }
  const row = await db.calendarOccurrence.findFirst({
    where: { ...publicEventWhere, id },
    select: {
      title: true,
      description: true,
      location: true,
      onlineUrl: true,
      organizer: true,
      allDay: true,
      startLocal: true,
      endLocal: true,
      startAt: true,
      endAt: true
    }
  });
  if (!row) return null;
  // An omitted location is truthful and can make the event ineligible for a
  // Google event rich result. It must never become a fabricated venue/address.
  const locations = [
    ...(row.location ? [{ "@type": "Place", name: row.location }] : []),
    ...(row.onlineUrl
      ? [{ "@type": "VirtualLocation", url: row.onlineUrl }]
      : [])
  ];
  return {
    "@context": "https://schema.org",
    "@type": "Event",
    name: row.title,
    url: origin + "/platform/events/" + id,
    ...(row.description ? { description: row.description } : {}),
    startDate: row.allDay ? row.startLocal : row.startAt.toISOString(),
    endDate: row.allDay
      ? new Date(Date.parse(row.endLocal + "T00:00:00Z") - 86400000)
          .toISOString()
          .slice(0, 10)
      : row.endAt.toISOString(),
    eventStatus: "https://schema.org/EventScheduled",
    ...(locations.length
      ? { location: locations.length === 1 ? locations[0] : locations }
      : {}),
    ...(row.organizer ? { organizer: { name: row.organizer } } : {})
  };
}
