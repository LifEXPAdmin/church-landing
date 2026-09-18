import type { ExchangeNeedContribution } from "@prisma/client";
// Only the deliberately selected contribution, with no other donor, recipient
// contact, authentication email or unrelated church operations.
export function needContributionEvidence(row: ExchangeNeedContribution) {
  return [
    "Selected Church Needs contribution",
    `State: ${row.state}`,
    `Promised quantity: ${row.quantity}`,
    `Received quantity: ${row.received}`,
    `Equipment returned: ${row.returned}`,
    row.quoteMinor !== null &&
      `Proposed amount in minor units: ${row.quoteMinor} ${row.quoteCurrency}`,
    row.loanReturnAt &&
      `Equipment return deadline: ${row.loanReturnAt.toISOString()}`,
    row.loanResponsibility,
    row.note,
    row.disputeNote
  ]
    .filter(Boolean)
    .join("\n");
}
