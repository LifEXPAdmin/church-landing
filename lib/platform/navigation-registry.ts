import { resourceContracts, type ResourceKind } from "./resource-contracts";

// Destinations name working screens, never authority to read or change a source.
// Private pages still resolve the current account and their own permissions.
type Destination = {
  href: string;
  title: string;
  description: string;
  icon: string;
  prefetch?: false;
  resource?: ResourceKind;
};
export const navigationRegistry = {
  home: {
    href: "/platform",
    title: "Home",
    description: "Read community posts.",
    icon: "home"
  },
  churches: {
    href: "/platform/churches",
    title: "Find a church",
    description: "Explore public church pages.",
    icon: "church"
  },
  myChurch: {
    href: "/platform/my-church",
    title: "My church",
    description: "Your church connection and available church tools.",
    icon: "church"
  },
  explore: {
    href: "/platform/search",
    title: "Explore",
    description:
      "Search the community's currently available posts and resources.",
    icon: "search"
  },
  messages: {
    href: "/platform/messages",
    title: "Messages",
    description: "Resume your accepted private conversations.",
    icon: "messages",
    prefetch: false
  },
  menu: {
    href: "/platform/menu",
    title: "Menu",
    description: "Find your way around God’s Churches.",
    icon: "menu"
  },
  exchange: {
    href: "/platform/exchange",
    title: "Exchange",
    description:
      "Find items, requests and skilled help, or manage your own listings.",
    icon: "handHeart",
    resource: "exchangeListing"
  },
  groups: {
    href: "/platform/groups",
    title: "Gather groups",
    description:
      "Find an adult group, read its rules and join private discussions.",
    icon: "handHeart",
    resource: "gatherGroup",
    prefetch: false
  },
  topics: {
    href: "/platform/topics",
    title: "Topic communities",
    description: "Read public discussions, join a topic or start your own.",
    icon: "book"
  },
  followedTopics: {
    href: "/platform/topics/following",
    title: "Topics I follow",
    description: "Read the latest posts from topics you follow.",
    icon: "book"
  },
  features: {
    href: "/platform/features",
    title: "Explore features",
    description: "A guide to current capabilities and how to use them.",
    icon: "book"
  },
  releases: {
    href: "/platform/releases",
    title: "What’s new",
    description: "Read release notes and app changes.",
    icon: "file"
  },
  feed: {
    href: "/platform/feed",
    title: "My feed",
    description:
      "Open a full-screen reader. Swipe left or right between posts.",
    icon: "book"
  },
  profile: {
    href: "/platform/profile/me",
    title: "Your profile",
    description: "The profile you share with other members.",
    icon: "person"
  },
  editProfile: {
    href: "/platform/profile/me",
    title: "Edit your profile",
    description: "Choose your name, bio and profile details.",
    icon: "person"
  },
  activity: {
    href: "/platform/activity",
    title: "Notifications",
    description: "See grouped updates and manage what is unread.",
    icon: "bell",
    prefetch: false
  },
  saved: {
    href: "/platform/saved",
    title: "Bookmarks",
    description: "Organize posts into private collections.",
    icon: "book"
  },
  drafts: {
    href: "/platform/drafts",
    title: "Your drafts",
    description: "Review and discard your private saved drafts.",
    icon: "file"
  },
  prayers: {
    href: "/platform/prayers",
    title: "My private prayer list",
    description: "Return to saved prayers and choose author updates.",
    icon: "handHeart",
    prefetch: false
  },
  calendars: {
    href: "/platform/calendars",
    title: "My calendars",
    description: "Your personal, church and shared calendars.",
    icon: "calendar"
  },
  commitments: {
    href: "/platform/commitments",
    title: "My commitments",
    description: "Your event responses and private conflict hints.",
    icon: "calendarCheck"
  },
  volunteers: {
    href: "/platform/serve",
    title: "Volunteer opportunities",
    description: "Explore church opportunities and your private applications.",
    icon: "handHeart",
    prefetch: false
  },
  settings: {
    href: "/platform/settings",
    title: "Account settings",
    description: "Reading, privacy, sign-in methods and account controls.",
    icon: "settings"
  },
  sharing: {
    href: "/platform/my-church/sharing",
    title: "Directory sharing",
    description: "Choose what to share with your approved church.",
    icon: "shield"
  },
  helpRequests: {
    href: "/platform/help/requests",
    title: "Your help requests",
    description: "Revisit your private requests and replies.",
    icon: "help"
  },
  feedback: {
    href: "/platform/feedback",
    title: "Feedback",
    description: "Share your website experience and revisit My feedback.",
    icon: "help",
    prefetch: false
  },
  reports: {
    href: "/platform/reports",
    title: "Your reports",
    description: "Private receipts for concerns you have submitted.",
    icon: "shield",
    prefetch: false
  },
  contactRequests: {
    href: "/platform/messages/requests",
    title: "Contact requests",
    description: "Review private requests to start an adult conversation.",
    icon: "person",
    prefetch: false
  },
  help: {
    href: "/platform/help",
    title: "Help and contacts",
    description: "Find the right place to ask for help.",
    icon: "circleHelp"
  },
  admin: {
    href: "/platform/admin",
    title: "Admin",
    description: "Open your currently permitted requests and operations.",
    icon: "shield",
    prefetch: false
  },
  mission: {
    href: "/about#our-mission",
    title: "Our mission",
    description: "Christ’s authority. Our shared calling. Your part to play.",
    icon: "church"
  },
  privacy: {
    href: "/privacy",
    title: "Privacy",
    description: "How information is used and shared.",
    icon: "shield"
  },
  terms: {
    href: "/terms",
    title: "Terms",
    description: "The terms for using God’s Churches.",
    icon: "file"
  },
  qr: {
    href: "/platform/share?qr=1",
    title: "Share God’s Churches",
    description: "Open the website QR code. Copy, share or save it.",
    icon: "qr"
  }
} as const satisfies Record<string, Destination>;

export type NavigationId = keyof typeof navigationRegistry;
export type NavigationIcon = (typeof navigationRegistry)[NavigationId]["icon"];
export type NavigationItem = Omit<Destination, "icon"> & {
  id: NavigationId;
  icon: NavigationIcon;
};
export type NavigationContext = {
  username?: string | null;
  // Supplied only by the existing current-permission server navigation read.
  adminAvailable?: boolean;
};

export function primaryNavigation(username?: string | null) {
  const ids = [
    "home",
    username ? "myChurch" : "churches",
    "explore",
    "messages",
    "menu"
  ] as const;
  return ids.map((id) => {
    const item = navigationRegistry[id];
    return {
      id,
      href: item.href,
      icon: item.icon,
      title: id === "churches" ? "Churches" : item.title,
      prefetch: "prefetch" in item ? item.prefetch : undefined
    };
  });
}
export type PrimaryNavigationItem = ReturnType<
  typeof primaryNavigation
>[number];

type Placement = { id: NavigationId; signedIn?: true };
const menuGroups = [
  {
    id: "community",
    title: "Community",
    entries: [
      { id: "exchange" },
      { id: "groups" },
      { id: "topics" },
      { id: "followedTopics", signedIn: true },
      { id: "churches" },
      { id: "myChurch", signedIn: true }
    ]
  },
  {
    id: "discover",
    title: "Discover",
    entries: [
      { id: "explore" },
      { id: "feed" },
      { id: "features" },
      { id: "releases" }
    ]
  },
  {
    id: "activity",
    title: "My activity",
    entries: [
      { id: "activity", signedIn: true },
      { id: "messages", signedIn: true },
      { id: "contactRequests", signedIn: true },
      { id: "saved", signedIn: true },
      { id: "drafts", signedIn: true },
      { id: "prayers", signedIn: true },
      { id: "calendars" },
      { id: "commitments" },
      { id: "volunteers" },
      { id: "helpRequests", signedIn: true },
      { id: "feedback", signedIn: true },
      { id: "reports", signedIn: true }
    ]
  },
  {
    id: "account",
    title: "Account",
    entries: [
      { id: "profile" },
      { id: "editProfile", signedIn: true },
      { id: "settings" },
      { id: "sharing", signedIn: true },
      { id: "help" }
    ]
  }
] as const satisfies readonly {
  id: string;
  title: string;
  entries: readonly Placement[];
}[];

export function navigationItem(
  id: NavigationId,
  context: NavigationContext
): NavigationItem {
  const item: NavigationItem = { ...navigationRegistry[id], id };
  if (id === "profile" && context.username)
    item.href = `/platform/profile/${encodeURIComponent(context.username)}`;
  if (id === "qr" && context.username) {
    item.href = "/platform/invitations";
    item.title = "My QR code";
    item.description = "Invite someone to connect with you.";
  }
  return item;
}

export function menuNavigation(context: NavigationContext) {
  return menuGroups.map((group) => ({
    id: group.id,
    title: group.title,
    items: group.entries
      .filter(
        (placement: Placement) => !placement.signedIn || !!context.username
      )
      .map(({ id }) => navigationItem(id, context))
      // Future modules need a real route and implemented adapter before entry.
      // The owning page still enforces runtime availability and current access.
      .filter(
        (item) =>
          !item.resource ||
          resourceContracts[item.resource].state === "implemented"
      )
  }));
}

export function administrationNavigation(context: NavigationContext) {
  return context.username && context.adminAvailable
    ? [navigationItem("admin", context)]
    : [];
}

export const aboutNavigation = (["mission", "privacy", "terms"] as const).map(
  (id) => navigationItem(id, {})
);
