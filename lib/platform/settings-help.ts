/** Presentation of existing capabilities; each destination retains its authority. */
export const settingsHelpTopics = [
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
    body: "After confirmation, reset restores only this browser’s five reading choices: theme, text size, layout, reduced motion and photo data use. It does not reset your profile, church sharing, mention permissions, account credentials or browser camera/location permissions.",
    href: "/platform/settings/display/reading",
    action: "Review display reset"
  },
  {
    id: "alerts",
    title: "Can I set quiet hours for notifications?",
    keywords:
      "quiet hours notifications email push alerts conversations follow",
    body: "Quiet hours, delivery channels and notification categories are unavailable. Current conversation controls let you follow or mute an eligible discussion, without promising email or push delivery. A successful action and a delivered notification are separate results.",
    href: "/platform/settings/notifications/availability",
    action: "Review current notification controls"
  },
  {
    id: "data",
    title: "How do I download my data or take a break?",
    keywords:
      "export download delete deactivate permission camera microphone location",
    body: "Confirm your account to prepare a private data file, then save it within one minute. An expired download needs fresh confirmation. Deactivation is reversible and retains your records; review sharing effects and hand off required duties first. Permanent account deletion is unavailable.",
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
