import type { ExchangeInquiry } from "@prisma/client";
// Exactly one deliberate source, never another inquiry or a general transcript.
export function exchangeHandoffEvidence(row: ExchangeInquiry, plan: boolean) {
  if (!plan) return row.purpose;
  return [
    "Agreed pickup plan",
    `Window begins: ${row.windowStart?.toISOString() ?? "Unavailable"}`,
    `Window ends: ${row.windowEnd?.toISOString() ?? "Unavailable"}`,
    `Time zone: ${row.timeZone ?? "Unavailable"}`,
    `Confirmed: ${row.confirmedAt?.toISOString() ?? "Unavailable"}`,
    row.pickupDetails
  ].join("\n");
}
