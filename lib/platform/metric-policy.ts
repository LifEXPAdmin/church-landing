/** Platform totals and optional foreground use; never post-reading analytics. */
export const METRIC_POLICY = "platform-measurement-v1";
export const METRIC_ZONE = "America/Chicago";
export const METRIC_RAW_DAYS = 90;
export const METRIC_MINIMUM_GROUP = 5;
export const METRIC_SESSION_GAP_MS = 30 * 60 * 1000;
export const METRIC_SIGNAL_INTERVAL_MS = 60 * 1000;

export const metricReferrals = {
  UNKNOWN: "Not provided",
  PERSONAL_INVITATION: "Personal invitation",
  CHURCH: "A church",
  SEARCH: "Search",
  SOCIAL: "Social media",
  OTHER: "Another source"
} as const;
export const metricDevices = {
  UNKNOWN: "Not shared",
  PHONE: "Phone",
  TABLET: "Tablet",
  COMPUTER: "Computer"
} as const;
export const metricBrowsers = {
  UNKNOWN: "Not shared",
  SAFARI: "Safari",
  CHROME: "Chrome",
  EDGE: "Edge",
  FIREFOX: "Firefox",
  OTHER: "Another browser"
} as const;
export const metricActions = {
  FOLLOW: "Following",
  POST: "Publishing ordinary posts",
  REPLY: "Replying to ordinary posts",
  RSVP: "Event responses",
  VOLUNTEER: "Volunteer signups"
} as const;
export type MetricAction = keyof typeof metricActions;
export type MetricAccountState =
  | "ENABLED"
  | "DEACTIVATED"
  | "SUSPENDED"
  | "DELETED"
  | "EXCLUDED"
  | "ABSENT";
export type MetricStateCounts = Record<
  "ENABLED" | "DEACTIVATED" | "SUSPENDED",
  number
>;

export const metricDefinitions = {
  registrations:
    "Distinct eligible accounts successfully created in the period. Original signup method is recorded at creation; later sign-ins or linked credentials add no registration. Legacy methods are Unknown.",
  population:
    "Existing accounts excluding erased and explicitly classified test/automation accounts. Suspended takes precedence over deactivated so each account appears in one state. This does not imply verified email or completed onboarding.",
  lifecycle:
    "Recorded state transitions since the lifecycle ledger began, including changes in eligibility. Each transition leaves one state and enters another; deleting an already deactivated account does not subtract it from enabled accounts again.",
  activity:
    "Distinct currently eligible, opted-in accounts with a valid foreground use signal. Seven- and thirty-day totals are unique accounts across their whole windows, not sums of daily counts. Background requests and operational staff are excluded. Use is not proof of attention.",
  firstValue:
    "The first currently retained, server-confirmed ordinary follow, published post, reply, positive RSVP or volunteer signup after measurement consent. Prayer posts, prayer replies and prayer acknowledgments are excluded. Removing the source can restate the result.",
  funnel:
    "Signup-calendar-day opt-in accounts with full measurement coverage: registration, measured foreground use and first value within seven calendar days. Church joining is a separate optional funnel.",
  returns:
    "Exact reporting-calendar-day 7 or 30 use among eligible measured signup-cohort accounts. The complete observation day must have ended; later use is not an exact-day return. Withdrawal, deletion and retention expiry can restate measured cohorts.",
  adoption:
    "Distinct eligible measured actors with current successful ordinary source records in the window, divided by the named measured population. Action totals are separate; retries, failures and withdrawn sources do not add actions.",
  organizations:
    "Church listings, pending claims, approved managed churches and active topic spaces are distinct sources. Approval of an existing listing is not a new listing. Active organizations have a permitted publication, event or serving action within thirty days; membership or attendance is not inferred.",
  support:
    "Unique canonical cases and distinct requesters, separated by source type. First response begins at receipt and ends at the first substantive authorized human reply. Resolution includes waiting intervals; automatic acknowledgments and extra messages do not create cases.",
  feedback:
    "Valid submitted ratings from 1 to 5: distribution, arithmetic mean and rating count. Rating-free submissions count as feedback but not ratings. Prompt response rate uses distinct persisted responses over displayed exposures; voluntary Menu feedback is separate. This is not NPS or a representative survey.",
  breakdowns:
    "Optional declared referral and coarse shared device/browser categories only. No free-form referrer, URL, contact list, exact location, faith, prayer or health category is collected. Small categories and their complementary breakdown are suppressed.",
  coverage:
    "Optional collection begins only after a disclosed, versioned choice and enabled configuration. Raw foreground/session facts last at most ninety days. Opting out removes them and starts no new collection; turning it back on begins a new coverage interval. Historical use is never backfilled."
} as const;
