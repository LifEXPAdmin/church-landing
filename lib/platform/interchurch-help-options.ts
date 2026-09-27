export const HELP_PURPOSE = "INTERCHURCH_V1";
export const HELP_SCHEMA = 1;
export const helpCategories = {
  PREACHING: "Preaching",
  WORSHIP: "Worship",
  AV: "AV support",
  CHILDREN: "Children's support",
  EQUIPMENT: "Equipment",
  TRANSPORT: "Transport",
  OTHER: "Other ministry help"
} as const;
export const helpDutyClasses = {
  ADULT_LOGISTICS:
    "Adult work only, excluding child contact, records and supervision",
  CHILD_FACING: "Child-facing duties (offers unavailable)"
} as const;
export const helpEquipmentModes = {
  NONE: "No equipment transfer",
  WITH_OPERATOR: "Equipment provided with its operator",
  GIFT: "An outright equipment gift"
} as const;
export const helpOutcomes = {
  OPEN: "Open to offers",
  CLOSED: "Closed to new offers",
  CANCELED: "Canceled",
  PARTIAL: "Partly fulfilled",
  FULFILLED: "Fulfilled"
} as const;
export const helpOfferStates = {
  OFFERED: "Offer awaiting review",
  SELECTED: "Selected for agreement",
  WITHDRAWN: "Withdrawn",
  DECLINED: "Declined",
  REVOKED: "Access ended"
} as const;
export const helpAgreementStates = {
  NEEDS_REVIEW: "Needs both participants' review",
  CONFIRMED: "Confirmed",
  COMPLETED: "Completed",
  CANCELED: "Canceled",
  REVOKED: "Access ended"
} as const;
export const HELP_PAGE_SIZE = 20;
export type HelpTermsFields = {
  duties: string;
  dutyClass: string;
  equipmentMode: string;
  startLocal: string;
  endLocal: string;
  timeZone: string;
  compensation: string;
  price: string;
  currency: string;
  rateUnit: string;
  reimbursement: string;
};
export const emptyHelpTerms: HelpTermsFields = {
  duties: "",
  dutyClass: "",
  equipmentMode: "NONE",
  startLocal: "",
  endLocal: "",
  timeZone: "UTC",
  compensation: "",
  price: "",
  currency: "",
  rateUnit: "",
  reimbursement: ""
};
