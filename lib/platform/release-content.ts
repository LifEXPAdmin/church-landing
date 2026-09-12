/** Public product content. Build identity is supplied separately by the serving deployment. */
export type Feature = {
  id: string;
  category: string;
  name: string;
  description: string;
  steps: string;
  href: string;
  eligibility: string;
  availability: "available" | "conditional";
};
export const features: Feature[] = [
  {
    id: "friend-invitations",
    category: "People and churches",
    name: "Personal friend invitations",
    description:
      "Invite someone to join Godschurches and become friends with you.",
    steps:
      "Open Menu, then My QR code. Enable your invitation, then copy, share or download it. Your guest chooses whether to connect and finishes account verification and adult eligibility. Either person can remove the friendship in profile relationship controls.",
    href: "/platform/invitations",
    eligibility:
      "Verified adult accounts. Codes expire after 30 days and can be replaced or revoked. Friendship grants no extra private or church access.",
    availability: "available"
  },
  {
    id: "profile",
    category: "Profiles",
    name: "Your profile",
    description: "Introduce yourself and choose how your profile looks.",
    steps:
      "Open your profile, choose Edit profile, then save your details or appearance.",
    href: "/platform/profile/me",
    eligibility: "Signed-in account; visibility follows your profile settings.",
    availability: "available"
  },
  {
    id: "profile-photos",
    category: "Profiles",
    name: "Profile photos",
    description: "Choose, crop, replace or remove a personal photo.",
    steps:
      "Open Edit profile, then Profile photo. Choose a file, adjust the crop and save. Cancel keeps your saved photo.",
    href: "/platform/profile/me",
    eligibility:
      "Photo uploads are currently unavailable while image maintenance is prepared. Existing photos require sign-in; initials appear when unavailable.",
    availability: "conditional"
  },
  {
    id: "posts",
    category: "Posts and conversations",
    name: "Share a post",
    description:
      "Share a thought, prayer, testimony, Scripture reference or link.",
    steps:
      "Open the community, choose a post type and audience, review who can reply, then publish.",
    href: "/platform",
    eligibility:
      "Sign in to publish. Church publishing requires current authorization.",
    availability: "available"
  },
  {
    id: "drafts",
    category: "Posts and conversations",
    name: "Private drafts",
    description: "Save work and resume it in the shared composer.",
    steps:
      "Save a draft, open Drafts and resume. Resolve conflicts or retry the unchanged request before continuing.",
    href: "/platform/drafts",
    eligibility:
      "Only your account can read its drafts. Publishing rechecks current access and reply permissions.",
    availability: "available"
  },
  {
    id: "comments",
    category: "Posts and conversations",
    name: "Comments and replies",
    description: "Join a conversation, react and reply to someone.",
    steps:
      "Open a post's comments. Choose Reply, write your response and send when ready.",
    href: "/platform",
    eligibility:
      "Sign in; the post's current reply permissions apply. Authors can edit or remove their own comments.",
    availability: "available"
  },
  {
    id: "comment-drafts",
    category: "Posts and conversations",
    name: "Unsent comments",
    description:
      "Return to saved comment work with clear save and retry status.",
    steps: "Open Comment drafts and resume the target conversation.",
    href: "/platform/comment-drafts",
    eligibility:
      "Private to your account; unavailable conversations cannot be posted to.",
    availability: "available"
  },
  {
    id: "reader",
    category: "Posts and conversations",
    name: "Focused reading",
    description: "Read one post at a time with adjustable reading preferences.",
    steps:
      "Open My feed. Swipe or use navigation controls; use reading controls for text and appearance.",
    href: "/platform/feed",
    eligibility:
      "Public posts are available to guests; private posts require access.",
    availability: "available"
  },
  {
    id: "search",
    category: "Posts and conversations",
    name: "Search and filters",
    description: "Find posts, people, churches, events and topics.",
    steps:
      "Choose a search category, enter a phrase and narrow the available filters.",
    href: "/platform/search",
    eligibility:
      "Results respect current visibility. Personal search history requires sign-in.",
    availability: "available"
  },
  {
    id: "saved",
    category: "Posts and conversations",
    name: "Saved posts and collections",
    description: "Keep posts in a private library and organize collections.",
    steps: "Choose Save on a post, then open Saved to organize or remove it.",
    href: "/platform/saved",
    eligibility:
      "Signed-in account. Saving never grants access to a withdrawn or restricted post.",
    availability: "available"
  },
  {
    id: "churches",
    category: "Churches and community",
    name: "Find your church",
    description: "Explore listed churches, their posts and upcoming events.",
    steps:
      "Find a church, open its overview and follow it or request it as your Home Church.",
    href: "/platform/churches",
    eligibility:
      "Public listings are open to guests. Home Church requests follow the church's approval process.",
    availability: "available"
  },
  {
    id: "membership",
    category: "Churches and community",
    name: "Home Church and directory",
    description:
      "See your church connection and authorized member information.",
    steps:
      "Open My church to review your connection, sharing and available church tools.",
    href: "/platform/my-church",
    eligibility:
      "Approved membership and role checks control directory and management access.",
    availability: "available"
  },
  {
    id: "relationships",
    category: "Churches and community",
    name: "Follow, favorite, mute and block",
    description:
      "Choose the people and churches you follow and manage relationship preferences.",
    steps:
      "Use the controls on a person or church, or open Relationships to review and change them.",
    href: "/platform/relationships",
    eligibility:
      "Signed-in account. Private preferences are visible only to you.",
    availability: "available"
  },
  {
    id: "church-setup",
    category: "Churches and community",
    name: "Church listing and setup",
    description:
      "Prepare a listing or request recognition as a church representative.",
    steps:
      "Open church setup, prepare the requested information and submit through the review flow.",
    href: "/platform/church-claims",
    eligibility:
      "Sign in. Submission does not grant a role or verified status; authorized review is required.",
    availability: "available"
  },
  {
    id: "calendar",
    category: "Events and calendars",
    name: "Calendars and events",
    description: "Browse events and manage calendars you are allowed to edit.",
    steps:
      "Open Calendars or a church calendar, then open an event for details.",
    href: "/platform/calendars",
    eligibility:
      "Public church events are public. Private calendars and editing require current access.",
    availability: "available"
  },
  {
    id: "rsvp",
    category: "Events and calendars",
    name: "RSVP and commitments",
    description: "Respond to events and review your volunteer commitments.",
    steps:
      "Open an event to respond, then use My commitments to review or change your response.",
    href: "/platform/commitments",
    eligibility:
      "Sign in and retain access to the event. Canceled events remain clearly marked.",
    availability: "available"
  },
  {
    id: "sharing",
    category: "Sharing and installation",
    name: "Links and QR codes",
    description:
      "Share the website or an eligible public post, church or event.",
    steps:
      "Open Menu and tap Share Godschurches near the top to see the website QR immediately. Copy, share or download its PNG. Use Share publicly on individual pages.",
    href: "/platform/share?qr=1",
    eligibility:
      "Only eligible public pages have public share links. A QR code grants no account or church permissions.",
    availability: "available"
  },
  {
    id: "installation",
    category: "Sharing and installation",
    name: "Installation help",
    description:
      "Add Godschurches to your device when your browser supports it.",
    steps:
      "Open Menu and Installation help for instructions appropriate to your device.",
    href: "/platform/menu",
    eligibility:
      "Browser and device support vary; the website works without installation.",
    availability: "available"
  },
  {
    id: "updates",
    category: "Sharing and installation",
    name: "Safe updates",
    description: "Check for a new release while protecting unsent work.",
    steps:
      "Choose Check for updates. Read What's new, finish saving and refresh only when ready.",
    href: "/platform/releases",
    eligibility:
      "A connection is required to check. Reading notes does not update the loaded tab.",
    availability: "available"
  },
  {
    id: "account",
    category: "Privacy and account",
    name: "Account and privacy",
    description:
      "Manage account security, privacy and available data controls.",
    steps: "Open Settings and select the account or privacy control you need.",
    href: "/platform/settings",
    eligibility:
      "Your signed-in account; sensitive changes may require verification.",
    availability: "available"
  },
  {
    id: "support",
    category: "Privacy and account",
    name: "Help and support",
    description:
      "Find help and contact the support team through the available intake.",
    steps: "Open Help and choose the relevant contact or support option.",
    href: "/platform/help",
    eligibility:
      "Church-only contacts require approved access. Delivery and response are separate from submitting a request.",
    availability: "available"
  }
];
export type ReleaseEntry = {
  id: string;
  version: string;
  date: string;
  summary: string;
  added: string[];
  improved: string[];
  fixed: string[];
  featureIds: string[];
};
export const releases: ReleaseEntry[] = [
  {
    id: "personal-friend-invitations",
    version: "2026.09.12.3",
    date: "2026-09-12",
    summary: "Invite someone to join and connect with you.",
    added: [
      "My QR code in Menu creates a personal invitation after you agree to automatic connections.",
      "New members can choose to connect during signup. Verified eligible accounts become friends on both sides."
    ],
    improved: [
      "Copy, Share and downloaded QR codes use the same personal invitation. General website sharing remains available.",
      "Invitations expire after 30 days and can be replaced or revoked. Removed friendships stay removed."
    ],
    fixed: [],
    featureIds: ["friend-invitations", "sharing"]
  },
  {
    id: "menu-qr-shortcut",
    version: "2026.09.12.2",
    date: "2026-09-12",
    summary: "Open the website QR straight from Menu.",
    added: [],
    improved: [
      "Share Godschurches is near the top of Menu and opens the website QR in one tap.",
      "The QR page keeps Copy, Share and PNG download available alongside the code."
    ],
    fixed: [],
    featureIds: ["sharing"]
  },
  {
    id: "community-demo",
    version: "2026.09.12.1",
    date: "2026-09-12",
    summary: "Find your way into the community and see what the app can do.",
    added: [
      "Share Godschurches from Menu with a downloadable QR code.",
      "Browse release notes and a searchable guide to current features."
    ],
    improved: [
      "Church overviews bring upcoming events alongside recent posts.",
      "Conversations can display authorized personal avatars. New photo uploads remain unavailable pending image maintenance.",
      "The update notice can show release notes while your current work stays open."
    ],
    fixed: [
      "Public share previews use eligible public content and safe generic fallbacks."
    ],
    featureIds: ["sharing", "churches", "profile-photos", "updates"]
  },
  {
    id: "community-baseline",
    version: "2026.09.12.0",
    date: "2026-09-12",
    summary:
      "A documented baseline for the community features already released. Earlier releases were not individually versioned here.",
    added: [
      "Private Saved collections, typed search and filters.",
      "Relationship controls, recoverable comments and installation help."
    ],
    improved: [
      "Private draft recovery and reply permissions remain protected through publication."
    ],
    fixed: [],
    featureIds: [
      "saved",
      "search",
      "relationships",
      "comments",
      "drafts",
      "installation"
    ]
  }
];
export const currentRelease = releases[0];
/** Baseline application verified before this product-version scheme began. */
export const baselineBuild = "5502f7dbd1dcfd8d563bc0b23c20e7ca976751d3";
export function releaseEntry(id: unknown) {
  return typeof id === "string"
    ? (releases.find((r) => r.id === id) ?? null)
    : null;
}
export function releaseMetadata(build: string | null) {
  return build
    ? { id: currentRelease.id, version: currentRelease.version, build }
    : null;
}

export function parseReleaseNotes(value: unknown): ReleaseEntry | null {
  if (!value || typeof value !== "object") return null;
  const r = value as Record<string, unknown>;
  if (
    !["id", "version", "date", "summary"].every(
      (k) => typeof r[k] === "string" && (r[k] as string).length <= 500
    )
  )
    return null;
  if (
    !/^[a-z0-9-]{1,80}$/.test(r.id as string) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(r.date as string)
  )
    return null;
  if (
    !["added", "improved", "fixed", "featureIds"].every(
      (k) =>
        Array.isArray(r[k]) &&
        r[k].length <= 30 &&
        r[k].every((v: unknown) => typeof v === "string" && v.length <= 500)
    )
  )
    return null;
  if (!(r.featureIds as string[]).every((id) => /^[a-z0-9-]{1,80}$/.test(id)))
    return null;
  return r as ReleaseEntry;
}
