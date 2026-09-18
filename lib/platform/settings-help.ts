/** Presentation of existing capabilities; each destination retains its authority. */
export const settingsHelpTopics = [
  {
    id: "church-needs",
    title: "When does a Church Needs promise count as received?",
    keywords: "exchange church needs donate sell transport volunteer quantity quote receipt return waitlist deadline coordinator",
    body: "A commitment is promised help. Only the current responsible organizer can confirm an actual receipt. Paid quotes reserve nothing until the coordinator accepts them, and the website does not collect payments. A full slot offers a separate waitlist that never reserves or automatically promotes you. Equipment loans keep their return obligations after receipt or closing. Notes and quotes stay with you and the current coordinator; displaying your name is optional. Open My Needs contributions to review or withdraw your remaining promise. Timed volunteers use the linked event role and its existing signup. Needs phone alerts require their own notification choice and device.",
    href: "/platform/exchange/needs",
    action: "Open My Needs contributions"
  },
  {
    id: "language-location",
    title: "Does choosing a discovery city share my location?",
    keywords: "language English translation city town region location radius device permission private profile",
    body: "No. Your discovery area and reading languages are private account choices in Feed Settings. Choose a country and town manually without device permission. Eligible adults can optionally request approximate town suggestions once, then choose and save an area. Device coordinates are not saved; denial or cancellation leaves manual entry available. Your profile location has its own Only me or permitted-member audience. Reading languages filter discovery posts; they do not translate content. Date and time formats stay separate from event instants, all-day dates, source zones and quiet hours.",
    href: "/platform/settings/language/interface",
    action: "Review language and location choices"
  },
  {
    id: "feedback",
    title: "How can I share feedback and find my receipt?",
    keywords: "feedback suggestion problem rating diagnostics screenshot receipt private support",
    body: "Share feedback is optional and available when support intake is open. Review the details and any selected screenshot before sending; diagnostics are optional. Your receipt and contact choices stay in My feedback. Submitting feedback does not publish it or sign you up for updates.",
    href: "/platform/feedback",
    action: "Open feedback and private receipts"
  },
  {
    id: "product-progress",
    title: "Where can I see what's being built and released?",
    keywords: "roadmap building ideas planned released suggestion credit recognition updates",
    body: "Reviewed ideas is the public place for suggestions and their current status when the board is available. Considering, Planned, Building and Testing do not mean a change is live. Released ideas link to their release notes. A public summary requires contributor permission and human review; showing a contributor's name is a separate optional choice. Private submissions and screenshots stay private. Votes express interest, not a delivery promise.",
    href: "/platform/feedback/ideas",
    action: "Open reviewed ideas"
  },
  {
    id: "measurement",
    title: "Can I turn off optional platform measurement?",
    keywords: "analytics measurement privacy opt out referral device",
    body: "Yes. Optional measurement starts off and is available under Privacy and interactions. Turning it off removes optional foreground/session facts and referral/device choices. Raw use facts last up to 90 days. Operational account, church and support totals remain separate; measurement never grants private account or case access.",
    href: "/platform/settings/privacy/measurement",
    action: "Review measurement choices"
  },
  {
    id: "discovery",
    title: "How do discovery feeds and hidden choices work?",
    keywords:
      "feed for you following friends favorites church local public ranking preferences preset topics language denomination hidden words reset",
    body: "Feed Settings saves explicit reading choices. Following is separate from accepted Friends; Your Church needs a current approved connection. Public and Local remain public-only. Geographic expansion is off until you choose it. More/Less affects recommendations; resetting that feedback keeps filters and follows. Hidden words and topics filter all Home feeds, while direct links retain their existing permissions. Refresh starts a new reading set.",
    href: "/platform/settings/feed/discovery",
    action: "Review Feed Settings"
  },
  {
    id: "audiences",
    title: "Who can see my profile and posts?",
    keywords:
      "privacy audience public members church replies mentions account email",
    body: "Your sign-in email stays private. Name and username identify public contributions; member profiles require sign-in. Each post has its own audience and reply choice, preserved in saved drafts. Optional church directory contacts use separate sharing choices and current church access.",
    href: "/platform/settings/privacy",
    action: "Review privacy choices"
  },
  {
    id: "calendar",
    title: "What does calendar sharing reveal?",
    keywords: "calendar event schedule busy details revoke",
    body: "Personal calendars start private. Share with approved members of your church as busy-only availability or full details. Whole-calendar sharing includes current and future events. Calendar and event-series shares are separate: ending one does not end the other. Leaving a church ends its dependent sharing; rejoining does not restore it.",
    href: "/platform/calendars",
    action: "Open calendar"
  },
  {
    id: "appearance",
    title: "Is my reading theme also my profile theme?",
    keywords:
      "theme appearance dark light text accessibility profile color reading",
    body: "Display controls theme, text size, motion and reading layout on this browser. Preview before saving. Your member profile has its own presentation in the profile editor; changing Display does not change how others see your profile. Device appearance follows your system’s light or dark choice.",
    href: "/platform/settings/display/reading",
    action: "Preview display choices"
  },
  {
    id: "reset",
    title: "What does resetting Display change?",
    keywords: "reset restore defaults browser cookie data",
    body: "After confirmation, reset restores only this browser’s reading choices: theme, text size, layout, reduced motion, photo data use and hidden Like counts. It does not reset your profile, church sharing, mention permissions, account credentials or browser camera/location permissions.",
    href: "/platform/settings/display/reading",
    action: "Review display reset"
  },
  {
    id: "alerts",
    title: "Can I set quiet hours for notifications?",
    keywords:
      "quiet hours notifications email push alerts conversations follow",
    body: "In Notification preferences, choose available channels and categories, manage devices, and set quiet hours in your time zone. Quiet hours pause phone alerts and selected feedback email. Choose follow-up separately on each feedback case or reviewed idea. Account verification and recovery emails remain separate.",
    href: "/platform/settings/notifications/availability",
    action: "Review current notification controls"
  },
  {
    id: "data",
    title: "How do I download my data or take a break?",
    keywords:
      "export download delete deactivate permission camera microphone location",
    body: "Confirm your account to prepare a private data file, then save it within one minute. An expired download needs fresh confirmation. Deactivation is reversible and retains your records; review sharing effects and hand off required duties first. Permanent deletion has its own confirmation, immediately hides the account and shows cleanup progress. Retained shared records and expiring backups follow the stated retention policy.",
    href: "/platform/settings/data",
    action: "Review your data"
  },
  {
    id: "access",
    title: "Where can I get sign-in or church access help?",
    keywords:
      "help support password recovery verification email church approval claim contacts",
    body: "Help provides password recovery, email verification and the published contact route. Approved church members may also see their appointed contacts. Following a church or having a position title does not grant management permissions. Church management follows the existing claim and authorization workflow.",
    href: "/platform/help",
    action: "Open Help and contacts"
  }
] as const;

export function searchSettingsHelp(query: string) {
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return settingsHelpTopics.filter((topic) => {
    const text =
      `${topic.title} ${topic.keywords} ${topic.body}`.toLocaleLowerCase();
    return words.every((word) => text.includes(word));
  });
}
