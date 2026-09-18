export const NEED_SCHEMA = 1;
export const NEED_PAGE = 20;
export const NEED_SLOT_LIMIT = 12;
export const NEED_QUANTITY_LIMIT = 10000;
export const needActionLabels = {
  DONATE: "Donate",
  SELL: "Sell to us",
  TRANSPORT: "Transport",
  VOLUNTEER: "Volunteer"
} as const;
export type NeedAction = keyof typeof needActionLabels;
export const needContributionLabels = {
  COMMITTED: "Committed",
  QUOTED: "Quote awaiting a decision",
  WAITLISTED: "Waitlisted, nothing reserved",
  DECLINED: "Declined",
  CANCELED: "Canceled",
  REVOKED: "Access ended"
} as const;
export const activeNeedStates = ["COMMITTED", "QUOTED", "WAITLISTED"];
export function needCommitted(row: {
  state: string;
  quantity: number;
  received: number;
}) {
  return row.state === "COMMITTED" ? row.quantity : row.received;
}
export function needProgress(
  target: number,
  committed: number,
  received: number,
  closed = false
) {
  if (received >= target) return "Received in full";
  if (closed)
    return received ? "Closed partly fulfilled" : "Closed without receipt";
  if (committed >= target) return "Covered, receipt pending";
  return received ? "Partly received" : "Help still needed";
}
