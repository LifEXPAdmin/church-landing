export const PANTRY_SCHEMA = 1;
export const PANTRY_PAGE = 20;
export const PANTRY_CATEGORY_LIMIT = 12;
export const PANTRY_LIMIT = 10000;
export const pantryAvailability = {
  EXACT: "Counted stock",
  APPROXIMATE: "Approximate availability",
  UNAVAILABLE: "Currently unavailable"
} as const;
export const pantryStates = {
  REQUESTED: "Request received",
  ASSIGNED: "Pickup offered",
  COLLECTED: "Collected",
  CANCELED: "Canceled",
  DECLINED: "Declined",
  MISSED: "Missed pickup",
  REVOKED: "Access ended"
} as const;
export const pantryActive = ["REQUESTED", "ASSIGNED"];
export const pantryOccupied = ["ASSIGNED", "COLLECTED", "MISSED"];
