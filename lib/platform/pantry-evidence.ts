import type { PantryRequest } from "@prisma/client";
import { pantryItems } from "./pantry-reads";
// One deliberately selected request, without other recipients, authentication
// identities, pickup contact, private directions or coordinator-only notes.
export function pantryRequestEvidence(row: PantryRequest) {
  return [
    "Selected private assistance request",
    `State: ${row.state}`,
    ...pantryItems(row.items).map((i) => `${i.label}: ${i.quantity} ${i.unit}`),
    row.note,
    row.confirmedAt
      ? "The requester confirmed the offered pickup."
      : "No pickup confirmation recorded."
  ]
    .filter(Boolean)
    .join("\n");
}
