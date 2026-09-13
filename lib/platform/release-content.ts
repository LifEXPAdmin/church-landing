import type { ReleaseEntry } from "./release-notes";
export type { ReleaseEntry } from "./release-notes";
export { parseReleaseNotes } from "./release-notes";
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
    id: "private-messages",
    category: "Posts and conversations",
    name: "Private contact requests and Messages",
    description:
      "Resume accepted adult conversations from a profile or the Messages tab, with private history and personal inbox controls.",
    steps:
      "Open a person's profile and choose Message. When contact operations are available, a new contact starts with a short request and explicit acceptance. Use Messages for prior history, Requests for decisions and Contact preferences to choose who may ask. Conversation options include mute, archive and clear for me; a message's More menu reports that selected item. Unconfirmed sends retain an exact retry.",
    href: "/platform/messages",
    eligibility:
      "Verified eligible adult personal accounts. New requests default to No one. Real reporting coverage and retention operations must be ready before new contact or sending is enabled; the interface explains when they are paused. Blocks stop new sends. Clear for me does not erase the other participant's history. In-app alert choices do not grant contact permission. Attachments, groups, delivery/read receipts, email and push are unavailable.",
    availability: "conditional"
  },
  {
    id: "private-reports",
    category: "Privacy and account",
    name: "Private reports and receipts",
    description:
      "Check reporting availability from a post, comment, profile or church, and revisit your own private receipts.",
    steps:
      "Open More, choose Report, then select a reason and optional details. If reporting is available, send once and open your private receipt. A lost response offers Retry same report. Menu > Your reports lists your own submissions.",
    href: "/platform/reports",
    eligibility:
      "Verified adult accounts with current access to the item. New intake remains unavailable until reviewer operations are enabled for that scope. No report is submitted when intake is unavailable. Reporting does not automatically restrict content or accounts; church representation disputes use the existing claim review.",
    availability: "conditional"
  },
  {
    id: "reposts",
    category: "Posts and conversations",
    name: "Repost and add your thoughts",
    description:
      "Bring an eligible public post to your profile or add your own words above it.",
    steps:
      "Open Repost, then choose Repost or Add your thoughts. A plain repost keeps the original author and offers Undo. A quote opens a private draft in the shared composer. To allow others to repost your original post, open Edit post and enable reposting.",
    href: "/platform",
    eligibility:
      "Verified adult accounts; the source must remain public and its author must allow reposts. Church destinations require current publishing permission. Source withdrawal or restricted access hides the original preview. Share sends a link; Bookmark saves privately.",
    availability: "conditional"
  },
  {
    id: "mission",
    category: "Getting started",
    name: "Our mission",
    description: "Jesus gave us a mission. You have a part to play.",
    steps:
      "Read our shared calling, then explore believers and churches. Create an account when you are ready to participate.",
    href: "/about#our-mission",
    eligibility:
      "Mission pages and public conversations are available without an account. Participation and church tools retain their current account and access requirements.",
    availability: "available"
  },
  {
    id: "settings",
    category: "Privacy and account",
    name: "Searchable settings",
    description:
      "Find account, privacy, reading and church choices in clear folders.",
    steps:
      "Open Menu, then Settings. Search words such as password, alerts or hide phone, or choose a folder. Changes use their existing account and privacy controls. Preview text, theme and reading layout in Display before saving. Reading preferences can be restored separately on this browser.",
    href: "/platform/settings",
    eligibility:
      "Sign in to your account. Browser appearance is separate from personal and selected-church settings. Church tools require current access. Contact preferences govern new adult requests; actual messaging remains conditional on operational readiness. General notification channels, family and payment controls are unavailable here.",
    availability: "available"
  },
  {
    id: "data-controls",
    category: "Privacy and account",
    name: "Your data and browser permissions",
    description:
      "Understand your account export, browser permissions and taking a break.",
    steps:
      "Open Settings, then Your data. Review camera, microphone and location status without requesting access. Use the browser help links to change those permissions. Confirm your account to prepare a private export; save it within one minute or prepare a new file. Review deactivation and any duty handoff separately.",
    href: "/platform/settings/data",
    eligibility:
      "Signed-in account. Exports and deactivation require current account confirmation. Browser status may be unavailable and does not grant church access or publish your location. Permanent deletion and general connected-app permissions are unavailable.",
    availability: "available"
  },
  {
    id: "polls",
    category: "Posts and conversations",
    name: "Community polls",
    description:
      "Ask a question and choose one or several answers with readable vote totals.",
    steps:
      "Write and publish a post, then choose Add a poll from the composer. Set 2–8 choices and a closing time. Members can change their vote before closing; authorized post editors can close voting.",
    href: "/platform",
    eligibility:
      "Verified adult accounts; church polls also require current church approval. Private drafts retain the post and reply permissions; poll setup happens after publication. Other members see totals, not your ballot.",
    availability: "available"
  },
  {
    id: "volunteering",
    category: "Events and calendars",
    name: "Volunteer roles",
    description: "See available places and offer to help at an existing event.",
    steps:
      "Open an event’s volunteer post and choose I can help for an available role. Review or cancel your signup in My commitments. Event RSVP is a separate choice. Church and feed cards label times in your device’s time zone.",
    href: "/platform/commitments",
    eligibility:
      "Current eligible church members and authorized organizers. Full, closed or canceled roles cannot accept new signups. No waitlist or reminder delivery is implied.",
    availability: "available"
  },
  {
    id: "church-welcome",
    category: "Churches and community",
    name: "Church welcome and next steps",
    description:
      "Find relevant ways to get to know a church and take your next step.",
    steps:
      "Open a church page for upcoming events, its published website and your available next steps. Optional profile and follow prompts disappear once completed; pending connection requests are acknowledged. Approved members can open ministries, teams and responsibilities.",
    href: "/platform/churches",
    eligibility:
      "Actions reflect current account and church access. Following grants no membership. Community listings still require legitimate representative review before management; published program content depends on that church’s records.",
    availability: "available"
  },
  {
    id: "friend-invitations",
    category: "People and churches",
    name: "Personal friend invitations",
    description:
      "Invite someone to join Godschurches and become friends with you.",
    steps:
      "Open Menu, then My QR code. Enable your invitation, then copy, share or download it. Your guest chooses whether to connect and finishes account verification and adult eligibility. Scanning an existing friend's code shows your current friendship and a link to share your own QR. Either person can remove the friendship in profile relationship controls.",
    href: "/platform/invitations",
    eligibility:
      "Verified adult accounts. Codes expire after 30 days and can be replaced or revoked. Friendship grants no extra private or church access.",
    availability: "available"
  },
  {
    id: "profile",
    category: "Profiles",
    name: "Your profile",
    description:
      "Introduce yourself with optional details and a clear choice of what to share.",
    steps:
      "Open Settings, then Profile. Edit your identity, introduction, photos and appearance in the shared editor. Name is required; other profile details are optional. Review optional church directory contacts separately. Unsaved text stays in the editor if a photo upload fails.",
    href: "/platform/profile/me",
    eligibility:
      "Signed-in account. Name and username identify public contributions; other profile details require permitted member access. Directory contacts require a current approved church connection and verified adult eligibility. Sign-in email stays private; street-address sharing is unavailable.",
    availability: "available"
  },
  {
    id: "profile-photos",
    category: "Profiles",
    name: "Profile photos",
    description: "Choose, crop, replace or remove a personal photo.",
    steps:
      "Open Edit profile, then Profile photo. Choose a file, adjust the crop and save. Cancel keeps your saved photo. Tap a readable profile photo or cover to enlarge it; Close or Back returns to the page.",
    href: "/platform/profile/me",
    eligibility:
      "Signed-in accounts can manage their own photo. Profile, post and comment photos remain visible only to permitted signed-in readers; initials appear when unavailable.",
    availability: "conditional"
  },
  {
    id: "photo-library",
    category: "Profiles",
    name: "Your photo library",
    description:
      "Keep personal photos together without making a post for each upload.",
    steps:
      "Open your profile, then Photos. Browse All photos, Profile pictures or Cover photos. Add photos with an explicit audience, caption and description. Previous profile pictures and covers stay available from this release onward; choose one to use again without uploading it twice. Also create a post opens your saved photos in the shared composer.",
    href: "/platform/profile/me?tab=photos",
    eligibility:
      "Manage your own library, up to 1,000 photos in pages of 24. New uploads start as Only me. Personal post photos follow their source audience; church-authored photos stay with their church. Removing a current picture, hiding a library entry and deleting a saved image are separate choices.",
    availability: "conditional"
  },
  {
    id: "photo-albums",
    category: "Profiles",
    name: "Named photo albums",
    description:
      "Organize your saved photos into albums without another upload.",
    steps:
      "Open your profile, then Photos and Named albums. Create an album, choose saved photos, arrange their order and choose a cover. Save the album with Only me, Members or an approved Church audience. Delete an album to remove its organization while keeping the photos.",
    href: "/platform/profile/me?tab=photos",
    eligibility:
      "Signed-in readers need access to the profile, album and each source photo. Albums never widen source audiences. Keep up to 50 albums with 100 photos each and browse in pages of 24. Remove a photo from its albums before deleting the saved photo.",
    availability: "conditional"
  },
  {
    id: "post-photo-management",
    category: "Posts and conversations",
    name: "Add and arrange post photos",
    description:
      "Upload up to ten photos, arrange their order and add captions.",
    steps:
      "Open your post, then Manage photos. Choose files, save them and edit the gallery. Each file has its own progress and retry. Move photos earlier or later and save their order. In Settings, Reduce photo data loads one smaller post preview at a time.",
    href: "/platform",
    eligibility:
      "The current post owner manages its photos. Church posts also require current publishing authority. Existing audiences and reply permissions apply. An interrupted save can be retried unchanged; conflicts keep your local edits for review.",
    availability: "conditional"
  },
  {
    id: "photo-viewer",
    category: "Posts and conversations",
    name: "View photos",
    description: "Open readable photos, move through a gallery and zoom in.",
    steps:
      "Tap a profile photo, cover or post photo. Use Previous and Next, swipe or arrow keys to move through a post's photos. Zoom in for detail, then Fit photo. Close, Escape or Back returns to your place.",
    href: "/platform",
    eligibility:
      "Each photo keeps its current source audience. Member profiles require sign-in. Unavailable photos remain private; opening the viewer adds no access.",
    availability: "available"
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
      "Choose Share a post to open the editor. Save draft is at the top right; Post is at the bottom. Open Drafts to resume the same saved copy. Close or Back offers save, discard unsent changes or keep writing; resolve conflicts and uncertain retries before closing.",
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
      "Open a post's comments, then Write a comment or Reply. The editor shows who you are replying to, with Save draft at the top right and Reply at the bottom. For a lost Like response, choose Retry same Like choice. After a conflict, use Refresh Like status before choosing again.",
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
    steps:
      "Open Comment drafts and resume the target conversation in the shared editor. Save draft keeps your text privately; closing can save or discard only unsent changes.",
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
      "Open My feed. Swipe or use navigation controls; open Settings, then Appearance and reading, to preview text and theme before saving on this browser.",
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
    name: "Bookmarks and collections",
    description: "Keep posts in a private library and organize collections.",
    steps:
      "Tap Bookmark on a post. Open Bookmarks from Menu to organize private collections, or tap the filled bookmark again to remove it.",
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
    id: "church-management",
    category: "Churches and community",
    name: "Your church tools",
    description: "Find the church tools available to your current role.",
    steps:
      "Open a church page. Manage church links to its profile, logo and cover, team, roles and privileges when your permissions allow them. Contributors and representatives can check their own request and next action. Church image managers can choose, crop, replace or remove a logo and cover.",
    href: "/platform/my-church",
    eligibility:
      "Approved membership and current permissions are required for management. Contributing a listing or saving a claim does not appoint a manager. A logo and verified management are separate facts.",
    availability: "conditional"
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
      "Open Settings, then Safety, to review blocked or muted accounts. Search your private list by name, open Connections controls and confirm an unblock when wanted. Unblocking does not restore friendship or follows.",
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
      "Open Menu and tap Share Godschurches near the top to see the website QR immediately. Copy, share or download its PNG. Use Share on posts and Share publicly on church or event pages.",
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
      "Open Menu and Install Godschurches. On iPhone, the Home Screen banner opens Safari's More or Share steps, including Open as Web App when shown. Help remains in Menu after dismissal. If you opened the site inside another app, copy its link into Safari or your usual browser.",
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
      "Review your actual sign-in methods, account security, privacy and available data controls.",
    steps:
      "Open Settings, then Account to review masked sign-in contact, email verification and active sessions. Confirm your account to sign out other sessions; the list refreshes after confirmation. Open Privacy to review saved mention permissions and follower/following count visibility, with separate profile, directory and post-audience guidance.",
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
    steps:
      "Open Settings, then Help and about. Search current help for audiences, calendar sharing, display or quiet hours. Open Help and contacts for the relevant route; the same folder links to policies, the loaded app version and retained release notes.",
    href: "/platform/help",
    eligibility:
      "Church-only contacts require approved access. Delivery and response are separate from submitting a request.",
    availability: "available"
  }
];
export const releases: ReleaseEntry[] = [
  {
    id: "private-messages-and-contact-choices",
    version: "2026.09.13.25",
    date: "2026-09-13",
    summary:
      "A private Messages workspace with explicit contact choices and recoverable history.",
    added: [
      "Messages is in mobile and desktop navigation. Profile Message resumes the same accepted conversation or checks the recipient's request policy.",
      "Private request decisions, paginated conversation history, personal mute/archive/clear controls and in-app alert choices use your current account and permissions."
    ],
    improved: [
      "Unconfirmed sends keep an exact retry, account changes conceal private history, and only messages visible in the conversation advance your read position.",
      "My feed remains reachable from Home and Menu. Selected-message reporting opens only the chosen evidence."
    ],
    fixed: [
      "New contact and sending clearly remain unavailable until actual reporting coverage and retention operations are ready. Existing history and personal cleanup remain accessible; publication does not activate intake."
    ],
    featureIds: ["private-messages", "private-reports", "settings"]
  },
  {
    id: "private-report-forms-and-receipts",
    version: "2026.09.12.24",
    date: "2026-09-12",
    summary:
      "Contextual report forms with private receipts and honest availability.",
    added: [
      "Open Report from More on posts, comments, profiles and churches. Menu now includes Your reports for private receipts."
    ],
    improved: [
      "Report forms retain details during conflicts and connection failures, and retry an uncertain submission without creating another report."
    ],
    fixed: [
      "Reporting clearly says when intake is unavailable. New intake remains off until actual reviewer coverage and operations are established."
    ],
    featureIds: ["private-reports"]
  },
  {
    id: "reliable-likes-and-lighter-loading",
    version: "2026.09.12.23",
    date: "2026-09-12",
    summary: "Reliable Like retries and lighter community loading.",
    added: [],
    improved: [
      "Visible author photos load on demand, and opening What’s new loads its feature details only when needed."
    ],
    fixed: [
      "Retrying a Like keeps the same choice. A stale choice from another tab asks you to refresh its status.",
      "Closed discussions clearly explain that replies are closed.",
      "Discarding a selected profile photo finishes navigation cleanup before confirming completion."
    ],
    featureIds: ["comments", "profile-photos", "installation"]
  },
  {
    id: "attributed-reposts-and-quotes",
    version: "2026.09.12.22",
    date: "2026-09-12",
    summary:
      "Repost public conversations with attribution or add your own thoughts.",
    added: [
      "Choose Repost for an attributed entry on your profile and eligible feed, with Undo that leaves the original intact.",
      "Choose Add your thoughts to write above the original in a private quote draft, then resume and publish in the shared composer."
    ],
    improved: [
      "Authors can explicitly allow reposting from Edit post. Sources keep their original identity, photos and permissions; unavailable originals show a neutral preview."
    ],
    fixed: [],
    featureIds: ["reposts", "drafts", "sharing"]
  },
  {
    id: "shared-post-reply-composer",
    version: "2026.09.12.21",
    date: "2026-09-12",
    summary:
      "A focused editor for posts and replies, with clear draft recovery.",
    added: [],
    improved: [
      "Write posts and replies in a shared editor with Close at the top left, Save draft at the top right and Post or Reply at the bottom.",
      "Author, audience, reply permissions and optional tools stay available without crowding your writing. The editor fits the space available above the mobile keyboard.",
      "Close or Back lets you save, discard unsent changes or keep writing. Previously saved drafts remain available; uncertain requests and conflicts keep their recovery controls."
    ],
    fixed: [
      "Starting another post preserves independent unsent-work protection."
    ],
    featureIds: ["drafts", "comments", "comment-drafts"]
  },
  {
    id: "compact-post-actions",
    version: "2026.09.12.20",
    date: "2026-09-12",
    summary: "Comment, bookmark and share from a simpler post action row.",
    added: [],
    improved: [
      "Bookmark privately with one tap and find your existing collections under Bookmarks in Menu.",
      "Share opens a small external sharing menu with Copy link. It never creates a feed post.",
      "Post and comment More menus keep available management actions together, with existing edit and deletion safeguards."
    ],
    fixed: [],
    featureIds: ["saved", "sharing", "comments"]
  },
  {
    id: "our-shared-mission",
    version: "2026.09.12.19",
    date: "2026-09-12",
    summary: "Our mission is front and center, with a clear way to take part.",
    added: [
      "Visitors see the Great Commission mission before the Home feed, with direct ways to create an account, explore the community and read Our mission."
    ],
    improved: [
      "About, the manifesto, registration welcome and shared footer express the same calling. Menu includes a direct Our mission link.",
      "Returning members retain their normal feed, composer and reading choices."
    ],
    fixed: [
      "About and the manifesto now distinguish available calendar and photo tools from future funding features.",
      "Back restores Home after opening another page from a newly loaded feed."
    ],
    featureIds: ["mission"]
  },
  {
    id: "settings-help-guide",
    version: "2026.09.12.18",
    date: "2026-09-12",
    summary: "Find clear help for settings and the right support route.",
    added: [
      "Search Help and about for answers about audiences, calendar sharing, profile appearance, display resets and current notification controls."
    ],
    improved: [
      "Help brings support contacts, private requests, the loaded app version and existing policy, release-note and feature pages together."
    ],
    fixed: [],
    featureIds: ["settings", "support"]
  },
  {
    id: "data-and-permissions",
    version: "2026.09.12.17",
    date: "2026-09-12",
    summary:
      "Understand browser permissions, your data download and taking a break.",
    added: [
      "Your data settings show camera, microphone and location permission status with links to browser guidance, without asking for access."
    ],
    improved: [
      "Account downloads explain their current scope, including albums, private drafts, collections, polls, calendars and volunteer signups.",
      "Deactivation is separate from other data controls and explains retained photos, revoked invitation and calendar sharing, and required duty handoff."
    ],
    fixed: [],
    featureIds: ["data-controls", "settings"]
  },
  {
    id: "safety-list-review",
    version: "2026.09.12.16",
    date: "2026-09-12",
    summary:
      "Review your safety choices and find blocked or muted accounts more easily.",
    added: [
      "Safety settings explain blocking, muting and mention choices with links to the existing controls and Help.",
      "Search your private blocked and muted lists by an available account or church name."
    ],
    improved: [
      "Unblocking asks for confirmation and explains that follows, favorites, friendships and conversation subscriptions stay removed."
    ],
    fixed: [
      "Empty safety lists explain where to find the controls, and unavailable accounts keep a neutral label."
    ],
    featureIds: ["settings", "relationships"]
  },
  {
    id: "display-preview",
    version: "2026.09.12.15",
    date: "2026-09-12",
    summary:
      "Preview text, appearance and reading layout before saving your display choices.",
    added: [
      "Sample reading cards show your chosen theme, text size and List or Pages layout before you apply them."
    ],
    improved: [
      "Display keeps your preview through navigation attempts and supports confirmed storage retry, discard and browser-only reset.",
      "Device theme and reduced-motion preferences remain supported, with keyboard-accessible controls and comfortable spacing."
    ],
    fixed: [
      "The List and Pages choice is clearly labeled as Home reading layout."
    ],
    featureIds: ["settings", "reader"]
  },
  {
    id: "privacy-settings-overview",
    version: "2026.09.12.14",
    date: "2026-09-12",
    summary:
      "Privacy settings show your saved mention choices and relationship-count visibility.",
    added: [
      "A Privacy overview explains current profile discovery, optional contacts, post audiences and reply permissions with links to existing controls."
    ],
    improved: [
      "Privacy summaries refresh with current account access and do not assume a saved value when a read fails."
    ],
    fixed: [
      "Relationship visibility guidance accurately describes follower and following counts."
    ],
    featureIds: ["settings", "account"]
  },
  {
    id: "profile-settings-clarity",
    version: "2026.09.12.13",
    date: "2026-09-12",
    summary:
      "Profile settings make optional details and separate church contacts easier to understand.",
    added: [
      "Profile settings links directly to your optional church directory email and phone choices."
    ],
    improved: [
      "The shared editor groups identity, introduction and appearance with clearer character guidance and a return to Profile settings.",
      "Profile photos remain optional and save separately, preserving unsaved text through an upload failure."
    ],
    fixed: [
      "A confirmed profile save now finishes its redirect without racing the protection for unsaved Back navigation."
    ],
    featureIds: ["settings", "profile", "profile-photos"]
  },
  {
    id: "security-settings-clarity",
    version: "2026.09.12.12",
    date: "2026-09-12",
    summary:
      "Security settings now reflect your actual sign-in methods and recovery options.",
    added: [
      "A Security overview shows password, linked Google and verified-email status without implying unsupported protection."
    ],
    improved: [
      "Accounts without an available confirmation method receive recovery guidance while retaining read-only session review."
    ],
    fixed: [
      "Supported Google confirmation returns to the setting that requested it; expired confirmation still requires a new proof.",
      "Recovery and verification pages link back to their relevant Settings folders."
    ],
    featureIds: ["settings", "account"]
  },
  {
    id: "account-settings-clarity",
    version: "2026.09.12.11",
    date: "2026-09-12",
    summary:
      "Review your private account details and signed-in devices with clearer status.",
    added: [
      "The Account folder shows masked sign-in contact, email verification status and supported edit links."
    ],
    improved: [
      "Signing out other sessions refreshes the list after confirmation and distinguishes an uncertain response from a failed list refresh."
    ],
    fixed: [
      "Session security guidance links to the Password folder, and email-change guidance returns directly to sign-in email settings."
    ],
    featureIds: ["settings", "account"]
  },
  {
    id: "searchable-settings",
    version: "2026.09.12.10",
    date: "2026-09-12",
    summary:
      "Find your account, privacy and reading choices in searchable Settings folders.",
    added: [
      "Searchable Settings folders with clear personal, browser and church scope.",
      "A browser-only display reset with a preview of exactly what changes."
    ],
    improved: [
      "Existing account, profile, directory, calendar and privacy controls are easier to find.",
      "Reading choices have explicit retry and discard actions when browser storage fails."
    ],
    fixed: [
      "Unsaved privacy choices remain protected when using Back; discarding restores confirmed choices."
    ],
    featureIds: ["settings", "account", "updates"]
  },
  {
    id: "community-next-steps",
    version: "2026.09.12.9",
    date: "2026-09-12",
    summary: "Find poll setup, local event times and useful church next steps.",
    added: [
      "The composer links directly to poll setup after publishing. Readable results show vote counts, percentages and your own saved choices.",
      "Church welcome panels offer current next steps, optional profile improvements, published website links and permitted member tools."
    ],
    improved: [
      "Church and feed event cards show labeled device-local times and direct RSVP links. Volunteer roles display available places and an I can help action, with cancellation and capacity checks preserved.",
      "Unsaved participation entries protect navigation and safe updates. Completed optional welcome steps disappear; pending membership requests are not repeated."
    ],
    fixed: [
      "All-day volunteer commitments display their inclusive dates without exposing the storage end-date convention."
    ],
    featureIds: ["polls", "volunteering", "rsvp", "church-welcome", "drafts"]
  },
  {
    id: "named-photo-albums",
    version: "2026.09.12.8",
    date: "2026-09-12",
    summary:
      "Organize saved photos into named albums with source privacy intact.",
    added: [
      "Create and rename albums, choose a cover, and add, remove or reorder up to 100 of your own photos without uploading files again.",
      "Album audiences start as Only me and can use Members or an approved Church. Counts, covers and enlarged views reveal only currently permitted source photos."
    ],
    improved: [
      "Album saves preserve exact retries and give a review step for conflicting edits. Unsaved choices are protected during navigation and safe app updates.",
      "Deleting an album keeps its photos. Deleting a photo used in an album explains that its album references must be removed first."
    ],
    fixed: [
      "Changed source audiences, membership, blocks and account state apply to album previews and photo delivery. Export includes your own album names and ordered references."
    ],
    featureIds: ["photo-albums", "photo-library", "photo-viewer"]
  },
  {
    id: "church-tools-and-identity",
    version: "2026.09.12.7",
    date: "2026-09-12",
    summary:
      "Reach your church tools and edit permitted church identity photos.",
    added: [
      "Church pages show management links for your current permissions, with your own representative request status and next action.",
      "Church profile managers can crop, replace and remove a logo or cover using the shared photo editor. Readable identity photos open in the photo viewer."
    ],
    improved: [
      "Team, roles, privileges and chart history link to the existing organization tools. Ordinary members keep their existing member links.",
      "Church photo controls preserve selected files through connection failures, offer exact retries and conflict review, and refresh current permissions when you return."
    ],
    fixed: [
      "Contributing a listing is clearly distinguished from approved management access. Revoked access clears stale editing controls."
    ],
    featureIds: ["church-management", "membership", "photo-viewer"]
  },
  {
    id: "personal-photo-library",
    version: "2026.09.12.6",
    date: "2026-09-12",
    summary:
      "Keep a personal photo library, reuse saved photos and manage post galleries.",
    added: [
      "A Photos tab organizes permitted personal photos, profile-picture history and cover history in pages of 24.",
      "Save photos directly with an explicit audience, caption and image description. Also create a post opens the same saved photos in a private draft without another upload.",
      "Personal post photos appear in your library while keeping the source post's current audience. Church-authored photos remain with the church."
    ],
    improved: [
      "Previous profile pictures and covers are retained from this release onward. Select an older saved picture, remove the current selection or deliberately delete unused saved photos.",
      "Manage post photos with individual upload progress, exact retries, captions, keyboard ordering and conflict review.",
      "Reduce photo data in Settings loads smaller previews and one post photo at a time. Large photos load only when opened."
    ],
    fixed: [
      "Pending photo uploads and edits survive navigation attempts, while a changed sign-in clears stale local work.",
      "Opening a photo draft remains reliable when a foreground account check overlaps the resume request. Signing in from a Photos link returns to that tab."
    ],
    featureIds: [
      "photo-library",
      "post-photo-management",
      "photo-viewer",
      "drafts",
      "profile-photos"
    ]
  },
  {
    id: "photos-and-phone-guidance",
    version: "2026.09.12.5",
    date: "2026-09-12",
    summary: "Enlarge photos and find clearer QR and Home Screen guidance.",
    added: [
      "Tap profile photos and covers to enlarge them. The shared photo viewer also shows readable post galleries with captions, navigation and zoom.",
      "A dismissible Home Screen banner makes iPhone installation steps visible near the top of Menu and invitation pages."
    ],
    improved: [
      "Photo controls support keyboard, Escape and Back while keeping your place. Full-size views load only when opened.",
      "Installation help includes Safari menu variants and a copy-link fallback for pages opened inside another app."
    ],
    fixed: [
      "Scanning an existing friend's QR now shows the current friendship, Open profile and Share your own QR. Account verification is explained separately and refreshes when you return."
    ],
    featureIds: [
      "photo-viewer",
      "profile-photos",
      "friend-invitations",
      "installation"
    ]
  },
  {
    id: "profile-photos",
    version: "2026.09.12.4",
    date: "2026-09-12",
    summary: "Add a personal photo to your profile and conversations.",
    added: [],
    improved: [
      "Open your profile, choose Edit profile, then Profile photo to select, crop and save a picture. You can replace or remove it later.",
      "Your saved photo appears on permitted profile, post and comment views. Canceling or a failed replacement keeps the previous photo."
    ],
    fixed: [
      "Photo uploads are available after private storage and scheduled cleanup verification. The feature guide reflects the current upload setting."
    ],
    featureIds: ["profile-photos", "profile", "comments"]
  },
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
