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
    id: "notifications",
    label: "Notifications",
    description: "Current conversation controls and alert availability."
  },
  {
    id: "church",
    label: "My church",
    description: "Your connection, directory choices and church tools."
  },
  {
    id: "calendar",
    label: "Calendar",
    description: "Your calendars and deliberate schedule sharing."
  },
  {
    id: "safety",
    label: "Safety",
    description: "Blocked and muted accounts, and where to find help."
  },
  {
    id: "data",
    label: "Your data",
    description: "Export your information or take a break."
  },
  {
    id: "help",
    label: "Help and about",
    description: "Help, policies, new releases and features."
  }
] as const;

export type SettingsFolderId = (typeof settingsFolders)[number]["id"];
export type SettingsControl =
  | "summary"
  | "email"
  | "verification"
  | "sessions"
  | "methods"
  | "password"
  | "reading"
  | "privacy"
  | "notifications"
  | "export"
  | "deactivate"
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
    "Edit your name, introduction, profile photo, cover and safe appearance choices.",
    ["name", "bio", "about me", "photo", "cover", "theme", "section order"],
    { href: "/platform/profile/me" },
    linked(
      "profiles.ts getProfileEditor",
      "account-boundary.ts update-profile; media.ts"
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
    "Choose who may mention you and whether members see your relationship list.",
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
    "display.reading",
    "display",
    "Reading preferences",
    "Choose appearance, text size, feed navigation, reduced motion and lower photo data use on this browser.",
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
      "reset display"
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
    "See which conversation controls are available and what alerts are still unavailable.",
    [
      "alerts",
      "notifications",
      "push",
      "email notifications",
      "quiet hours",
      "mute conversation"
    ],
    { control: "notifications" },
    {
      persistenceOwner: "none for unavailable delivery categories",
      read: "comment-reads.ts conversation; current delivery availability",
      write: null
    },
    { state: "explanation", valueType: "information" }
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
    "calendar.sharing",
    "calendar",
    "Calendars and schedule sharing",
    "Manage calendar visibility and deliberate busy-only or detail sharing.",
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
    ["deactivate", "close account", "delete account", "take a break"],
    { control: "deactivate" },
    account("account-lifecycle.ts", "account-lifecycle.ts deactivateAccount")
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
    "future.messages",
    "privacy",
    "Direct messages",
    "Unavailable until its contact and safety contracts are ready.",
    [],
    { href: "/platform/settings" },
    linked("inactive messaging contract"),
    { capability: "future", state: "future", valueType: "information" }
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
