import { defaultReadingPreferences } from "./reading-preferences";
import type { SettingValue } from "./settings-contract";

export const settingsFolders = [
  {
    id: "account",
    label: "Account",
    description: "Your identity, email and signed-in devices."
  },
  {
    id: "security",
    label: "Security",
    description: "Password and account recovery."
  },
  {
    id: "profile",
    label: "Profile",
    description: "What other members can see about you."
  },
  {
    id: "privacy",
    label: "Privacy and interactions",
    description: "Mentions, relationship visibility and sharing."
  },
  {
    id: "display",
    label: "Appearance and reading",
    description: "Comfortable text, motion and photo data use."
  },
  {
    id: "media",
    label: "Media and data use",
    description: "Playback availability, captions and photo data use."
  },
  {
    id: "notifications",
    label: "Notifications",
    description: "Current conversation controls and alert availability."
  },
  {
    id: "feed",
    label: "Feed and discovery",
    description: "Your saved feed and accounts you have muted."
  },
  {
    id: "language",
    label: "Language and location",
    description: "Interface language, private discovery area and separate profile location."
  },
  {
    id: "church",
    label: "My church",
    description: "Your connection, directory choices and church tools."
  },
  {
    id: "communities",
    label: "Communities and interests",
    description: "Your group invitations, membership and event participation."
  },
  {
    id: "calendar",
    label: "Calendar",
    description: "Personal display, event alerts, calendars and deliberate schedule sharing."
  },
  {
    id: "exchange",
    label: "Exchange",
    description: "Your listings, private saved searches, contact choices and alerts."
  },
  {
    id: "safety",
    label: "Safety",
    description: "Blocked and muted accounts, and where to find help."
  },
  {
    id: "data",
    label: "Your data",
    description: "Browser permissions, account export and taking a break."
  },
  {
    id: "help",
    label: "Help and about",
    description: "Help, policies, new releases and features."
  }
] as const;

export type SettingsFolderId = (typeof settingsFolders)[number]["id"];
/** Curated navigation only; each target retains its canonical service and scope. */
export const relatedSettingIds: Partial<
  Record<SettingsFolderId, readonly string[]>
> = {
  profile: ["privacy.relationships", "calendar.sharing"],
  privacy: ["profile.information", "calendar.sharing"],
  church: ["privacy.directory", "calendar.sharing"],
  communities: ["privacy.messages", "calendar.commitments", "calendar.sharing", "notifications.availability"],
  calendar: ["profile.sections", "privacy.directory"],
  exchange: ["privacy.messages", "notifications.availability"],
  notifications: ["privacy.relationships", "safety.muted"],
  feed: ["safety.muted"],
  safety: ["notifications.availability"]
};
export type SettingsControl =
  | "summary"
  | "email"
  | "verification"
  | "sessions"
  | "methods"
  | "password"
  | "reading"
  | "discovery"
  | "language"
  | "privacy"
  | "measurement"
  | "contact"
  | "notifications"
  | "export"
  | "deactivate"
  | "delete"
  | "organization";
export type SettingCapability =
  | "account"
  | "email"
  | "google"
  | "church-tools"
  | "future";
export type SettingRegistration = {
  readonly id: string;
  readonly folder: SettingsFolderId;
  readonly label: string;
  readonly description: string;
  readonly aliases: readonly string[];
  readonly scope: "browser" | "personal" | "church";
  readonly valueType: "action" | "group" | "information";
  readonly defaultValue: SettingValue;
  readonly persistenceOwner: string;
  readonly read: string;
  readonly write: string | null;
  readonly capability: SettingCapability;
  readonly state: "working" | "explanation" | "future";
  readonly destination: { control: SettingsControl } | { href: string };
};

function entry(
  id: string,
  folder: SettingsFolderId,
  label: string,
  description: string,
  aliases: string[],
  destination: SettingRegistration["destination"],
  owner: { persistenceOwner: string; read: string; write: string | null },
  options: Partial<
    Pick<
      SettingRegistration,
      "scope" | "valueType" | "defaultValue" | "capability" | "state"
    >
  > = {}
): SettingRegistration {
  return Object.freeze({
    id,
    folder,
    label,
    description,
    aliases: Object.freeze(aliases),
    destination: Object.freeze(destination),
    ...owner,
    scope: "personal",
    valueType: "action",
    defaultValue: null,
    capability: "account",
    state: "working",
    ...options
  });
}
const account = (read: string, write: string | null) => ({
  persistenceOwner: "account service",
  read,
  write
});
const linked = (read: string, write: string | null = null) => ({
  persistenceOwner: "linked canonical service",
  read,
  write
});
const help = {
  persistenceOwner: "maintained public content",
  read: "app/platform/help/page.tsx; lib/platform/release-content.ts",
  write: null
};

export const settingsRegistry: readonly SettingRegistration[] = Object.freeze([
  entry(
    "media.playback", "media", "Playback and audio",
    "Video and audio playback settings are not available yet. Opening a link on another website uses that website’s playback controls.",
    ["autoplay", "mute", "sound", "video", "music"],
    { href: "/platform/settings/media" },
    { persistenceOwner: "maintained media availability", read: "settings-media.tsx playback explanation", write: null },
    { valueType: "information", state: "explanation" }
  ),
  entry(
    "media.captions", "media", "Captions",
    "Video captions and caption preferences are not available here yet. On another website, check its player for available captions. Photo descriptions are separate from video captions.",
    ["subtitles", "closed captions", "accessibility"],
    { href: "/platform/settings/media" },
    { persistenceOwner: "maintained media availability", read: "settings-media.tsx captions explanation", write: null },
    { valueType: "information", state: "explanation" }
  ),
  entry(
    "media.quality", "media", "Quality and data use",
    "Data saver loads smaller photos on supported pages until you choose to open them. It applies to this browser. Opening a larger photo can use more data. Video quality choices are not available yet.",
    ["bandwidth", "data saver", "photo quality", "mobile data"],
    { href: "/platform/settings/media" },
    linked("reading-preferences.ts browser-local reduceData"),
    { scope: "browser", valueType: "information", state: "explanation" }
  ),
  entry(
    "communities.groups", "communities", "My group choices",
    "Review your membership and separate group roster choices. Membership does not make your name public.",
    ["gather", "groups", "roster", "leave group", "community preferences"],
    { href: "/platform/groups/mine" },
    { persistenceOwner: "GatherGroupMembership", read: "group-reads.ts readGroupChoices", write: "groupCommand" }
  ),
  entry(
    "communities.invitations", "communities", "My group invitations",
    "Review current named invitations. Joining requires your acceptance of the group's current rules.",
    ["gather", "invite", "invitation", "join group", "community preferences"],
    { href: "/platform/groups/invitations" },
    { persistenceOwner: "GatherGroupMembership", read: "group-reads.ts listGroups invitations=true", write: "groupCommand" }
  ),
  entry("church.groups", "church", "Gather groups", "Find adult groups and manage church groups under your explicit group duty.", ["gather", "groups", "ministry", "discussion"], { href: "/platform/groups" }, { persistenceOwner: "GatherGroup", read: "group-reads.ts listGroups", write: "groupCommand" }),
  entry("privacy.groups", "privacy", "My group choices", "Review your membership, invitations and separate group roster choices.", ["gather", "groups", "roster", "invitations"], { href: "/platform/groups/mine" }, { persistenceOwner: "GatherGroupMembership", read: "group-reads.ts readGroupChoices", write: "groupCommand" }),
  entry("church.assistance", "church", "Church pantry and support hubs", "Browse current hub information or manage a hub under your explicit assistance duty.", ["pantry", "food", "stock", "assistance", "coordinator"], { href: "/platform/pantry" }, { persistenceOwner: "PantryHub", read: "pantry-reads.ts readPantry", write: "pantryCommand" }),
  entry("exchange.assistance", "exchange", "My private assistance requests", "Review requested items, pickup offers and your own assistance history.", ["pantry", "pickup", "food", "assistance"], { href: "/platform/pantry/mine" }, { persistenceOwner: "PantryRequest", read: "pantry-reads.ts readPantry", write: "pantryCommand" }),
  entry(
    "exchange.listings",
    "exchange",
    "Your listings and audiences",
    "Manage your listings and choose Public or One approved church for each one. Review its audience before publishing.",
    ["marketplace", "free items", "for sale", "wanted", "services", "listing audience"],
    { href: "/platform/exchange/mine" },
    linked("exchange-listings.ts listExchangeListings", "exchangeListingCommand")
  ),
  entry(
    "exchange.area",
    "exchange",
    "Listing area and pickup privacy",
    "Choose a general town when creating a listing. Keep exact pickup instructions out of published text.",
    ["pickup", "collection", "marketplace location", "listing town"],
    { href: "/platform/exchange/new" },
    linked("exchange-listings.ts exchangeEditorContext", "exchangeListingCommand")
  ),
  entry(
    "exchange.defaults", "exchange", "Personal listing defaults",
    "Save a personal listing type, audience and general town, plus reusable private pickup instructions. Apply them deliberately to a new personal draft.",
    ["marketplace defaults", "pickup address", "collection instructions", "listing audience"],
    { href: "/platform/exchange/defaults" },
    { persistenceOwner: "ExchangeDefaults", read: "exchange-defaults.ts readExchangeDefaults", write: "exchangeDefaultsCommand" }
  ),
  entry(
    "exchange.needs", "exchange", "My Needs contributions",
    "Review your promises, private quotes, received help and outstanding equipment returns.",
    ["church needs", "donate", "transport", "volunteer", "quantity", "loan", "receipt"],
    { href: "/platform/exchange/needs" },
    { persistenceOwner: "ExchangeNeedContribution and PostVolunteerSignup", read: "exchange-need-reads.ts readExchangeNeeds", write: "exchangeNeedCommand" }
  ),
  entry(
    "exchange.handoffs", "exchange", "Private inquiries and pickup agreements",
    "Review your incoming and outgoing inquiries, agreed pickup windows, completion, cancellation and expiry.",
    ["marketplace", "reservations", "handoff", "no show", "pickup agreement"],
    { href: "/platform/exchange/handoffs" },
    { persistenceOwner: "ExchangeInquiry", read: "exchange-handoffs.ts readExchangeHandoffs", write: "exchangeHandoffCommand" }
  ),
  entry(
    "exchange.saved",
    "exchange",
    "Saved listings and matching alerts",
    "Manage private favorites and named searches. Turn matching alerts on or off for each search without removing it.",
    ["marketplace", "saved search", "favorite items", "wanted matches", "local listings"],
    { href: "/platform/exchange/saved" },
    {
      persistenceOwner: "ExchangeFavorite and ExchangeSavedSearch",
      read: "exchange-saved.ts readExchangeSaved",
      write: "exchangeSavedCommand"
    }
  ),
  entry(
    "privacy.measurement",
    "privacy",
    "Optional platform measurement",
    "Choose limited use measurement and optional source or device sharing. Off by default.",
    ["analytics", "measurement", "data collection", "referral"],
    { control: "measurement" },
    {
      persistenceOwner: "PlatformMeasurementChoice",
      read: "platform-measurement.ts",
      write: "platform-measurement.ts"
    },
    {
      valueType: "group",
      defaultValue: { enabled: false, shareDevice: false, referral: "UNKNOWN" }
    }
  ),
  entry(
    "account.identity",
    "account",
    "Account information",
    "Your name, username and private sign-in information.",
    ["identity", "username", "email"],
    { control: "summary" },
    account("accounts.ts readAccountSession", null),
    { valueType: "information" }
  ),
  entry(
    "account.email",
    "account",
    "Sign-in email",
    "Change your sign-in email through a confirmation sent to the new address.",
    ["email address", "change email"],
    { control: "email" },
    account(
      "account-email-change.ts checkPendingEmailChange",
      "account-boundary.ts request-email-change/confirm-email-change"
    ),
    { capability: "email" }
  ),
  entry(
    "account.verification",
    "account",
    "Email verification",
    "Review whether your account email is verified.",
    ["verified", "confirm email"],
    { control: "verification" },
    account(
      "accounts.ts readAccountSession",
      "account-boundary.ts request-verification"
    )
  ),
  entry(
    "account.sessions",
    "account",
    "Devices and sessions",
    "Review sign-ins and sign out other devices.",
    ["devices", "sessions", "logout", "sign out"],
    { control: "sessions" },
    account(
      "account-sessions.ts listAccountSessions",
      "account-sessions.ts revokeOtherAccountSessions"
    )
  ),
  entry(
    "account.methods",
    "account",
    "Connected sign-in methods",
    "Review your supported password and Google sign-in options.",
    ["google", "connected accounts", "login methods"],
    { control: "methods" },
    account("google-accounts.ts", "google-accounts.ts"),
    { capability: "google" }
  ),
  entry(
    "security.password",
    "security",
    "Password",
    "Use your current sign-in method to protect a password change.",
    ["password", "security", "change password"],
    { control: "password" },
    account(
      "google-accounts.ts authentication options",
      "account-boundary.ts change-password"
    )
  ),
  entry(
    "security.recovery",
    "security",
    "Account recovery",
    "Find the existing password recovery and sign-in help.",
    ["forgot password", "reset password", "recovery"],
    { href: "/platform/account/recover" },
    account(
      "account-boundary.ts request-reset",
      "account-boundary.ts consume-reset"
    )
  ),
  entry(
    "profile.information",
    "profile",
    "Edit member profile",
    "Edit your name, introduction, optional testimony, skills and links, profile photo, cover and safe appearance choices.",
    ["name", "bio", "about me", "testimony", "skills", "links", "photo", "cover", "theme", "section order"],
    { href: "/platform/profile/me" },
    linked(
      "profiles.ts getProfileEditor",
      "account-boundary.ts update-profile; media.ts"
    )
  ),
  entry(
    "profile.appearance",
    "profile",
    "Profile appearance",
    "Preview safe palette and cover presets, or restore appearance defaults before saving your profile.",
    ["theme", "palette", "background", "cover", "reset appearance"],
    { href: "/platform/profile/me?focus=appearance" },
    linked("profiles.ts getProfileEditor", "account-boundary.ts update-profile")
  ),
  entry(
    "profile.sections",
    "profile",
    "Profile sections",
    "Arrange your optional sections and review your introduction and selected event in the shared profile editor.",
    [
      "section order",
      "testimony",
      "skills",
      "links",
      "introduction",
      "calendar"
    ],
    { href: "/platform/profile/me?focus=sections" },
    linked("profiles.ts getProfileEditor", "account-boundary.ts update-profile")
  ),
  entry(
    "profile.contacts",
    "profile",
    "Optional church contact details",
    "Review your separate directory email and phone choices; sign-in email stays private.",
    [
      "phone",
      "contact email",
      "contact details",
      "contact visibility",
      "address"
    ],
    { href: "/platform/my-church/sharing" },
    linked(
      "portal.ts getPortalSnapshot sharing",
      "portal.ts portalCommand operation=share"
    )
  ),
  entry(
    "profile.photos",
    "profile",
    "Your photos and albums",
    "Manage your photo library and each photo's current audience.",
    ["albums", "pictures", "photos", "cover history"],
    { href: "/platform/profile/me?tab=photos" },
    linked(
      "personal-photos.ts; photo-albums.ts",
      "personal-photos.ts; photo-albums.ts"
    )
  ),
  entry(
    "privacy.relationships",
    "privacy",
    "Mentions and relationship visibility",
    "Choose who may mention you and whether members see your follower and following counts.",
    [
      "tags",
      "mentions",
      "hide relationships",
      "following visibility",
      "privacy"
    ],
    { control: "privacy" },
    {
      persistenceOwner: "SocialPreferences",
      read: "relationships.ts readRelationships view=privacy",
      write: "relationships.ts relationshipCommand operation=privacy"
    },
    {
      valueType: "group",
      defaultValue: { mentions: "EVERYONE", showRelationships: true }
    }
  ),
  entry(
    "privacy.photos",
    "privacy",
    "Photo tags and approvals",
    "Choose who may ask to tag you, review requests and remove approved tags without deleting a photo.",
    ["photo tags", "tag approval", "photos of me", "remove tag"],
    { href: "/platform/photo-tags?view=preferences" },
    linked("photo-tag-reads.ts", "photo-tags.ts")
  ),
  entry(
    "privacy.directory",
    "privacy",
    "Church directory sharing",
    "Control directory participation and each optional church contact field.",
    [
      "hide phone",
      "hide email",
      "phone audience",
      "contact privacy",
      "directory"
    ],
    { href: "/platform/my-church/sharing" },
    linked(
      "portal.ts getPortalSnapshot sharing",
      "portal.ts portalCommand operation=share"
    )
  ),
  entry(
    "privacy.connections",
    "privacy",
    "Following and favorites",
    "Manage your current personal and church follows.",
    ["friends", "relationships", "favorites", "unfollow"],
    { href: "/platform/relationships" },
    linked(
      "relationships.ts readRelationships",
      "relationships.ts relationshipCommand"
    )
  ),
  entry(
    "privacy.qr",
    "privacy",
    "Personal QR sharing",
    "Review your personal invitation and sharing choices.",
    ["qr", "invitation", "share code"],
    { href: "/platform/invitations" },
    linked("friend-invitations.ts", "friend-invitations.ts")
  ),
  entry(
    "feed.lists",
    "feed",
    "Private following lists",
    "Organize current follows into private lists and use them in Following.",
    ["people", "churches", "private lists", "following", "named lists"],
    { href: "/platform/relationships/lists" },
    linked(
      "following-lists.ts readFollowingLists",
      "following-lists.ts followingListCommand"
    )
  ),
  entry(
    "feed.default",
    "feed",
    "Default feed",
    "Choose your saved community or discovery feed. Your account remembers your choice.",
    [
      "feed",
      "default feed",
      "latest",
      "friends",
      "top this week",
      "trending",
      "discovery"
    ],
    { href: "/platform#feed-choice" },
    {
      persistenceOwner: "SocialPreferences.feedMode and feedVersion",
      read: "feed-reads.ts readFeed",
      write: "feed-preferences.ts saveFeedPreference"
    },
    { defaultValue: "latest" }
  ),
  entry(
    "feed.discovery",
    "feed",
    "Discovery preferences and hidden choices",
    "Choose your approved church, town or radius, reading languages, self-declared traditions, topics, strict presets and recommendation feedback.",
    [
      "for you",
      "following",
      "your church",
      "churches",
      "local",
      "public",
      "favorites",
      "denomination",
      "language",
      "radius",
      "hidden words",
      "hidden topics",
      "recommendations",
      "more",
      "less",
      "reset feedback",
      "presets"
    ],
    { control: "discovery" },
    {
      persistenceOwner: "SocialPreferences.discovery and discoveryVersion",
      read: "discovery-preferences.ts getDiscoveryPreferences",
      write: "discovery-preferences.ts saveDiscoveryPreferences"
    }
  ),
  entry(
    "language.interface",
    "language",
    "Interface language and date formats",
    "Use the English interface and save your date and time formats. Reading languages and calendar time zones stay separate.",
    ["app language", "translation", "English", "region", "date format", "time format", "timezone"],
    { control: "language" },
    { persistenceOwner: "PlatformUser regional preferences", read: "settings-context.ts; regional-preferences.ts readRegionalPreferences", write: "regional-preferences.ts saveRegionalPreferences" },
    { valueType: "group", state: "working" }
  ),
  entry(
    "language.discovery",
    "language",
    "Private discovery area and reading languages",
    "Choose a country, town, radius and reading languages. Manual entry needs no device permission; eligible adults can optionally request approximate town suggestions.",
    ["city", "town", "location", "country", "radius", "local area", "content language", "manual location"],
    { href: "/platform/settings/feed/discovery" },
    linked("discovery-preferences.ts getDiscoveryPreferences", "discovery-preferences.ts saveDiscoveryPreferences")
  ),
  entry(
    "language.profile",
    "language",
    "Location on your member profile",
    "Choose Only me or permitted signed-in members for your optional profile location. It is separate from your private discovery area.",
    ["shared location", "public location", "profile city", "location visibility"],
    { href: "/platform/profile/me" },
    linked("profiles.ts getProfileEditor", "account-boundary.ts update-profile")
  ),
  entry(
    "language.calendar",
    "language",
    "Calendar and event time zones",
    "Review the source time zone of an event. Discovery location does not change its date or time.",
    ["event time", "calendar timezone", "regional time"],
    { href: "/platform/calendars" },
    linked("calendar-reads.ts; calendar-access.ts", "calendar-commands.ts")
  ),
  entry(
    "display.reading",
    "display",
    "Reading preferences",
    "Choose appearance, text size, feed navigation, motion, photo data use and reaction-count visibility on this browser.",
    [
      "dark mode",
      "light mode",
      "theme",
      "larger text",
      "font",
      "accessibility",
      "motion",
      "data saver",
      "pages",
      "list",
      "reset display",
      "hide counts",
      "prayer counts",
      "like counts"
    ],
    { control: "reading" },
    {
      persistenceOwner: "godschurches_reading browser cookie",
      read: "reading-preferences.ts parseReadingPreferences",
      write: "ReadingProvider.update"
    },
    {
      scope: "browser",
      valueType: "group",
      defaultValue: defaultReadingPreferences
    }
  ),
  entry(
    "notifications.availability",
    "notifications",
    "Notification preferences",
    "Choose Activity and phone categories, and available email for Likes, replies and feedback you selected. Manage devices, quiet hours and feedback follow-up preferences.",
    [
      "alerts",
      "notifications",
      "push",
      "comment replies",
      "mention alerts",
      "email notifications",
      "quiet hours",
      "mute conversation",
      "prayer updates",
      "followed conversations",
      "new post bell",
      "reactions",
      "church roles",
      "event changes",
      "volunteer commitments",
      "feedback email",
      "idea updates",
      "unsubscribe feedback",
      "exchange alerts",
      "marketplace notifications"
    ],
    { control: "notifications" },
    {
      persistenceOwner: "SocialPreferences and PushSubscription",
      read: "notification-preferences.ts and push-subscriptions.ts",
      write: "notificationPreferenceCommand and pushSubscriptionCommand"
    },
    { valueType: "group" }
  ),
  entry(
    "notifications.prayers",
    "notifications",
    "My private prayer list",
    "Return to saved prayers and choose which future author updates to receive.",
    ["pray", "prayer", "praise", "saved prayers", "follow-up"],
    { href: "/platform/prayers" },
    {
      persistenceOwner: "PrayerRecord",
      read: "prayer-reads.ts",
      write: "prayerCommand"
    }
  ),
  entry(
    "church.connection",
    "church",
    "Home church and membership",
    "Review your church connection and pending request.",
    ["home church", "membership", "leave church", "request"],
    { href: "/platform/my-church" },
    linked("portal.ts getPortalSnapshot", "portal.ts portalCommand")
  ),
  entry(
    "church.organization",
    "church",
    "Organization settings",
    "Choose a church and open only the tools your current role permits.",
    [
      "organization",
      "church settings",
      "roles",
      "privileges",
      "church profile",
      "ministries"
    ],
    { control: "organization" },
    linked(
      "church-tools.ts readChurchTools",
      "church-claims.ts; church-structure.ts; calendar-commands.ts"
    ),
    { scope: "church", capability: "church-tools" }
  ),
  entry(
    "calendar.formats", "calendar", "Date and time formats",
    "Save your personal date and time formats in Language and location. Existing event times stay unchanged.",
    ["calendar display", "date format", "time format", "12 hour", "24 hour"],
    { href: "/platform/settings/language/interface" },
    linked("regional-preferences.ts", "regional-preferences.ts")
  ),
  entry(
    "calendar.view", "calendar", "Viewing month and time zone",
    "Open your calendars to choose a month and viewing time zone for the current view. These choices are not saved defaults.",
    ["calendar display", "timezone", "device zone", "month", "week start", "default view"],
    { href: "/platform/calendars" },
    linked("calendar-view.ts; calendar-presentation.tsx")
  ),
  entry(
    "calendar.alerts", "calendar", "Event notification preferences",
    "Review your event Activity and phone choices. Timed calendar reminders are not available yet.",
    ["calendar reminder", "event alerts", "reminders", "notifications"],
    { href: "/platform/settings/notifications/availability" },
    linked("notification-preferences.ts", "notification-preferences.ts")
  ),
  entry(
    "calendar.layers", "calendar", "Calendars in your view",
    "Choose permitted church calendars for the current view without changing membership, RSVP or volunteer commitments.",
    ["calendar layers", "hide calendar", "subscribed calendars", "following calendars"],
    { href: "/platform/calendars" },
    linked("calendar-reads.ts; calendar-view.ts; calendar-presentation.tsx")
  ),
  entry(
    "calendar.sharing",
    "calendar",
    "Busy-only availability",
    "Choose your calendar or event, then review its church audience and Busy only sharing. Busy only reveals time and availability without event details.",
    [
      "calendar",
      "schedule",
      "availability",
      "timezone",
      "busy",
      "event privacy"
    ],
    { href: "/platform/calendars" },
    linked("calendar-reads.ts; calendar-access.ts", "calendar-commands.ts")
  ),
  entry(
    "calendar.details", "calendar", "Event-detail sharing",
    "Choose your calendar or event, then review Full event details sharing. This also reveals the title, notes, location, online link and organizer.",
    ["event privacy", "schedule sharing", "calendar details", "availability"],
    { href: "/platform/calendars" },
    linked("calendar-reads.ts; calendar-access.ts", "calendar-commands.ts")
  ),
  entry(
    "calendar.commitments",
    "calendar",
    "Your commitments",
    "Review RSVP and volunteer commitments separately from profile visibility.",
    ["rsvp", "volunteer", "commitments"],
    { href: "/platform/commitments" },
    linked("post-participation.ts", "post-participation.ts")
  ),
  entry(
    "safety.blocked",
    "safety",
    "Blocked accounts",
    "Review your blocks. Unblocking never restores a friendship automatically.",
    ["blocked", "block", "unblock", "safety"],
    { href: "/platform/relationships?view=blocked" },
    linked(
      "relationships.ts readRelationships",
      "relationships.ts relationshipCommand"
    )
  ),
  entry(
    "safety.muted",
    "safety",
    "Muted accounts and churches",
    "Review your private mute and snooze choices.",
    ["mute", "muted", "snooze", "feed"],
    { href: "/platform/relationships?view=muted" },
    linked(
      "relationships.ts readRelationships",
      "relationships.ts relationshipCommand"
    )
  ),
  entry(
    "data.permissions",
    "data",
    "Browser permissions",
    "Check this website’s camera, microphone and location permission status.",
    ["camera", "microphone", "location permission", "device permission"],
    { href: "/platform/settings/data#browser-permissions" },
    {
      persistenceOwner: "browser and device permission settings",
      read: "navigator.permissions.query",
      write: null
    },
    { scope: "browser", valueType: "information", state: "explanation" }
  ),
  entry(
    "data.export",
    "data",
    "Download your data",
    "Prepare your private account export using the existing confirmation flow.",
    ["export", "download data", "copy my data"],
    { control: "export" },
    account(
      "account-export.ts downloadAccountExport",
      "account-export.ts prepareAccountExport"
    )
  ),
  entry(
    "data.deactivate",
    "data",
    "Deactivate account",
    "Take a reversible break after reviewing the effects and any handoff requirements.",
    ["deactivate", "take a break"],
    { control: "deactivate" },
    account("account-lifecycle.ts", "account-lifecycle.ts deactivateAccount")
  ),
  entry(
    "data.delete",
    "data",
    "Permanently delete account",
    "Review permanent deletion, retained shared messages and actual cleanup progress.",
    ["delete account", "close account", "permanent deletion", "erase"],
    { control: "delete" },
    account(
      "account-deletion.ts readAccountDeletionProgress",
      "account-deletion.ts requestPermanentAccountDeletion"
    )
  ),
  entry(
    "help.support",
    "help",
    "Help and support",
    "Find the current help routes and available support.",
    ["help", "support", "contact", "safety help"],
    { href: "/platform/help" },
    help
  ),
  entry(
    "help.feedback",
    "help",
    "Share website feedback",
    "Share a private suggestion or problem when feedback intake is available.",
    ["feedback", "suggestion", "problem", "rating", "diagnostics"],
    { href: "/platform/feedback" },
    help
  ),
  entry(
    "help.receipts",
    "help",
    "My feedback",
    "Return to your private receipts and chosen follow-up preferences.",
    ["feedback receipt", "my feedback", "follow-up", "suggestion status"],
    { href: "/platform/feedback/requests" },
    help
  ),
  entry(
    "help.ideas",
    "help",
    "What we're building",
    "Browse reviewed ideas and their status. Planned work is separate from released changes.",
    ["roadmap", "building", "ideas", "suggestion credit", "planned"],
    { href: "/platform/feedback/ideas" },
    help
  ),
  entry(
    "help.privacy",
    "help",
    "Privacy policy",
    "Read how information is handled.",
    ["privacy policy", "data policy"],
    { href: "/privacy" },
    help
  ),
  entry(
    "help.terms",
    "help",
    "Terms",
    "Read the current website terms.",
    ["terms", "rules", "guidelines"],
    { href: "/terms" },
    help
  ),
  entry(
    "help.releases",
    "help",
    "What's new and app version",
    "Read retained release notes for changes that have shipped.",
    ["version", "update", "release", "patch notes", "what's new"],
    { href: "/platform/releases" },
    help
  ),
  entry(
    "help.features",
    "help",
    "Explore features",
    "Find current features and their availability.",
    ["features", "guide", "how to", "installation"],
    { href: "/platform/features" },
    help
  ),
  entry(
    "future.family",
    "privacy",
    "Family supervision",
    "Unavailable until its separate safety contract is ready.",
    [],
    { href: "/platform/settings" },
    linked("inactive family contract"),
    { capability: "future", state: "future", valueType: "information" }
  ),
  entry(
    "future.payments",
    "data",
    "Payments",
    "Unavailable until its provider and payment contracts are ready.",
    [],
    { href: "/platform/settings" },
    linked("inactive payment contract"),
    { capability: "future", state: "future", valueType: "information" }
  ),
  entry(
    "privacy.messages",
    "privacy",
    "Contact requests",
    "Choose who can request an adult conversation or invite you to a group. Acceptance and blocks still apply.",
    ["messages", "requests", "contact", "who can message", "conversation", "group invitation audience"],
    { control: "contact" },
    {
      persistenceOwner: "SocialPreferences.contactRequests",
      read: "adult-contact.ts readAdultContact view=preferences",
      write: "adult-contact.ts adultContactCommand operation=preferences"
    },
    { defaultValue: "NOBODY" }
  )
]);

export function settingHref(setting: SettingRegistration) {
  return "href" in setting.destination
    ? setting.destination.href
    : `/platform/settings/${setting.folder}/${setting.id.split(".")[1]}`;
}

export function settingsInFolder(folder: string) {
  return settingsRegistry.filter(
    (s) => s.folder === folder && s.state !== "future"
  );
}

export function isSettingsPath(pathname: string) {
  if (/^\/platform\/settings\/?$/.test(pathname)) return true;
  const match = /^\/platform\/settings\/([a-z]+)(?:\/([a-z]+))?\/?$/.exec(
    pathname
  );
  if (!match || !settingsFolders.some((f) => f.id === match[1])) return false;
  return (
    !match[2] ||
    settingsRegistry.some(
      (s) =>
        s.folder === match[1] &&
        s.id.split(".")[1] === match[2] &&
        "control" in s.destination &&
        s.state !== "future"
    )
  );
}

export function searchSettings(query: string, entries = settingsRegistry) {
  const normalized = (s: string) =>
    s.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
  if (query.length > 200) return [];
  const terms = normalized(query).trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  return entries.filter(
    (s) =>
      s.state !== "future" &&
      terms.every((term) =>
        normalized(
          [
            s.label,
            s.description,
            ...s.aliases,
            settingsFolders.find((f) => f.id === s.folder)?.label ?? ""
          ].join(" ")
        ).includes(term)
      )
  );
}
