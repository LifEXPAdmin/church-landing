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
    id: "calendar-following", category: "Events and calendars", name: "Saved calendar layers",
    description: "Follow, hide and color available calendars with private choices saved to your account.",
    steps: "Open My calendars, expand My choices for an available calendar and save. Unfollow to remove its saved overlay, or hide while keeping it followed. Return to your saved choices after trying a temporary view.",
    href: "/platform/calendars",
    eligibility: "Requires an eligible signed-in account and current calendar access. Following grants no membership, extra access, notifications or event response. Source names stay visible beside decorative colors. Recovery may turn a layer off until you review it.", availability: "available"
  },
  {
    id: "calendar-settings",
    category: "Events and calendars",
    name: "Personal Calendar settings",
    description: "Find date formats, viewing choices, event alerts and schedule sharing in separate Settings groups.",
    steps: "Open Settings, Calendar. Save date and time formats in Language and location, review event notifications, or open your calendars to choose a view and deliberately manage sharing.",
    href: "/platform/settings/calendar",
    eligibility: "Requires sign-in. Busy-only availability and event-detail sharing remain separate choices on each calendar or event. Saved default views, timed reminders, calendar subscriptions and external connections are not available here yet. Personal viewing choices never publish events or grant church duties.",
    availability: "available"
  },
  {
    id: "volunteer-applications",
    category: "Events and calendars",
    name: "Volunteer applications and independent shifts",
    description: "Explore church opportunities, apply privately and track a coordinator’s decision for a timed shift or ongoing role.",
    steps: "Open Volunteer opportunities from Menu. Review the duties and commitment, then submit an application. My applications shows the saved status and withdrawal action. Authorized church publishers with volunteer duties create opportunities from their church posts; coordinators review applications and confirm available places. Accepted timed shifts appear in My commitments.",
    href: "/platform/serve",
    eligibility: "Applying requires a verified eligible adult account and current source access. Applications reserve no place until approved and never grant church authority or additional access. A shift can use its parent event time or fixed shorter times within that event. Ongoing roles use agreed arrangements without creating calendar events. Application notes and decisions stay private; screening documents, child information and background checks are not collected here.",
    availability: "conditional"
  },
  {
    id: "profile-selected-event",
    category: "Privacy and account",
    name: "An existing event on your profile",
    description: "Choose one existing event for About. Its original time, location, cancellation state and audience still apply.",
    steps: "Open Edit member profile, paste an event page link, check the original event and choose Use this event. Save profile to apply it. Remove selected event and save to clear only the profile link.",
    href: "/platform/profile/me",
    eligibility: "A verified adult account and current event access are required to choose an event. Each profile viewer must also have current access to its details. Busy-only sharing reveals no event details. Selection does not publish a calendar or RSVP.",
    availability: "available"
  },
  {
    id: "media-settings-layout",
    category: "Privacy and account",
    name: "Media availability and photo data use",
    description: "Find playback, caption and video quality availability together in Settings, with a link to the existing photo Data saver choice.",
    steps: "Open Settings, Media and data use. Choose Data saver in Appearance and reading to change Reduce photo data for this browser.",
    href: "/platform/settings/media",
    eligibility: "Requires sign-in. Video and audio playback, caption preferences and video quality controls are not available here yet. Other websites keep their own player controls.",
    availability: "available"
  },
  {
    id: "church-visitor-information",
    category: "Churches and community",
    name: "Supplied church visitor information",
    description: "Read optional service times, accessibility information, languages, children's program notes and visitor contact preferences on a church's public page.",
    steps: "Find a church and open its page. Confirm schedules and arrangements directly with the church. Use Suggest a correction to save a private draft and send it for independent review.",
    href: "/platform/churches",
    eligibility: "Anyone can read published details. Missing information stays blank. Corrections require an eligible signed-in account and independent listing review. Current authorized profile managers use their existing save, preview and publish controls. Supplied facts do not verify representative authority.",
    availability: "available"
  },
  {
    id: "menu-shortcuts",
    category: "Privacy and account",
    name: "Your ordered Menu shortcuts",
    description: "Choose up to six available destinations and save their order to your account.",
    steps: "Open Menu, then Edit Menu shortcuts. Select destinations, move them up or down and save. Discard local edits or reset saved shortcuts with confirmation.",
    href: "/platform/menu",
    eligibility: "Requires sign-in. Other signed-in sessions use the saved order. Shortcuts never grant access, and destinations that are no longer permitted stay unavailable.",
    availability: "available"
  },
  {
    id: "optional-profile-sections",
    category: "Privacy and account",
    name: "Optional testimony, skills and profile links",
    description: "Add your own plain-text testimony, skills and labeled links to the About section of your profile.",
    steps: "Open Settings, Edit member profile. Fill the optional sections, move My testimony, Skills and Links up or down, then save. Leave a section empty to hide it. Its place in the order is retained. Review newer saved values if another session changed your profile.",
    href: "/platform/profile/me",
    eligibility: "Only you edit your profile. Filled sections are visible to permitted signed-in members. Private account and church-directory contact details are not copied into these fields. A selected event uses its own current audience. Featured-media sections are not available here.",
    availability: "available"
  },
  {
    id: "optional-social-email",
    category: "Privacy and account",
    name: "Separate Likes and direct reply email choices",
    description: "Choose optional email for Likes and direct replies separately from Activity and phone alerts when delivery is available.",
    steps: "Open Settings, Notifications, Notification preferences. Each supported category has its own email choice. Both start off and apply to new activity after you choose them. Quiet hours also pause optional email. You can withdraw a choice even while delivery is unavailable.",
    href: "/platform/settings/notifications/availability",
    eligibility: "Email delivery is not currently activated. Availability requires the configured provider and verified delivery checks. A verified eligible account and explicit category consent are required. Mentions, followed conversations and other categories do not gain email here. Email contains a generic notice and a sign-in link that rechecks your current access.",
    availability: "conditional"
  },
  {
    id: "church-settings",
    category: "Privacy and account",
    name: "Personal church settings and administration",
    description: "Review your church connection and keep personal choices separate from assigned church duties.",
    steps: "Open Settings, My church and ministries. Review the current connection state, then use My church for request, withdrawal or leave confirmation. Directory and contact choices use the existing sharing form. Organization settings lists churches with current assigned permissions and checks access again when opened.",
    href: "/platform/settings/church",
    eligibility: "Sign-in is required. Pending requests do not give church access. An approved connection or role title alone does not grant administration. The existing single active connection rule remains. Personal settings never appoint roles or change church policy.",
    availability: "available"
  },
  {
    id: "community-preferences",
    category: "Privacy and account",
    name: "Communities and interests settings",
    description: "Find your group invitations, membership and event choices together in Settings.",
    steps: "Open Settings, Communities and interests. Review My group choices or My group invitations, then use the related links for Contact requests, Your commitments, Calendars and schedule sharing, and Notification preferences.",
    href: "/platform/settings/communities",
    eligibility: "Requires sign-in. Each destination keeps its current adult eligibility, permissions and private choices. An invitation never joins a group for you. Group and event phone alerts remain separate choices. Church administration stays under My church and requires current assigned duties.",
    availability: "available"
  },
  {
    id: "gather-groups",
    category: "Churches and community",
    name: "Adult Gather groups",
    description: "Find a group, read its rules and deliberately join a private community.",
    steps: "Open Gather groups from Menu. Review a listed group's About page, then join, request approval or accept your named invitation. My choices holds your membership and roster preferences. Owners manage rules, membership, named leadership and archival. A leadership or ownership offer requires the recipient's explicit acceptance.",
    href: "/platform/groups",
    eligibility: "Verified adults can create and join eligible groups. Private cohorts and unlisted groups require named invitations. A church-linked group requires separately assigned church authority; church membership alone grants no group access. Member names start private except accepted leaders. Youth groups are unavailable.",
    availability: "conditional"
  },
  {
    id: "private-group-discussions",
    category: "Posts and conversations",
    name: "Private group discussions",
    description: "Organize member-only conversations, questions, polls and selected answers within a group.",
    steps: "Open a current group's Discussions tab and choose a category or start a private discussion. Reply, vote or explicitly follow a thread. A question author or permitted leader can select a helpful answer. Group leaders can pin threads, lock replies and review scoped reports. Events links open the original event only when its own calendar access permits.",
    href: "/platform/groups/mine",
    eligibility: "Current membership, accepted rules and group access are required. A group draft stays private to its original destination. Reading updates only visible read progress and does not follow a thread or enable phone alerts. Selected answers are member choices, not theological authority. Archived groups retain permitted history and stop new participation.",
    availability: "conditional"
  },
  { id: "church-pantry", category: "Churches and community", name: "Church pantry and support hubs", description: "Find public supply guidance and coordinate a private assistance request with a named church coordinator.", steps: "Open Church pantry and support hubs from Exchange or Settings, My church. Review hours, eligibility and categories. An eligible adult selects their own supplies and consents to the named coordinator. Follow My requests to confirm an offered pickup, cancel or clear ended details. An explicitly assigned assistance coordinator manages stock, sessions and private outcomes, with separate Church Needs duties for replenishment.", href: "/platform/pantry", eligibility: "Available when a church publishes a hub, a current coordinator accepts responsibility and report coverage is available. Requests and appointments do not guarantee supplies. Other members and managers do not inherit private histories. No payments, partner referrals or regulated services are offered. Phone alerts require a separate assistance choice and device.", availability: "conditional" },
  {
    id: "church-needs",
    category: "Churches and community",
    name: "Church Needs and contribution progress",
    description: "Coordinate donated items, paid quotes, transport and event volunteers with separate promised and received counts.",
    steps: "A current church Exchange manager opens Need actions from a Church need listing, chooses an exact deadline, accepts coordinator responsibility and adds named action slots. Review the displayed counts and publish from the listing editor. Contributors choose their quantity or event role. Use My Needs contributions for private entries, and the need’s incoming contributions for organizer receipts, corrections and equipment returns. Close individual slots or repeat the structure as a new private draft with fresh dates and consent.",
    href: "/platform/exchange/needs",
    eligibility: "Current verified adult accounts, listing access, coordinator contact choices and report coverage are required for private contributions. Names start private. Paid quotes reserve nothing until explicitly accepted; waitlists never reserve or promote automatically. Timed volunteers share the existing event capacity and separate organizer duty. This feature does not take payments, issue tax receipts or prove actual fulfillment. Needs phone alerts require a separate choice and device.",
    availability: "conditional"
  },
  {
    id: "private-following-lists",
    category: "Privacy and account",
    name: "Private following lists",
    description:
      "Organize people and churches you follow into named private lists, then choose a list for Following.",
    steps:
      "Open Connections, then Private lists, or open Settings, Feed and discovery, Private following lists. Create a list, add from your current follows and save. Choose Use this list in Following, or use the private list selector in the Following feed.",
    href: "/platform/relationships/lists",
    eligibility:
      "Available to signed-in accounts. Only you can read the names and membership. Lists grant no church access or public endorsement. Deleting a list leaves follows intact. Existing post permissions, muted accounts and discovery filters still apply.",
    availability: "available"
  },
  {
    id: "exchange-private-handoffs", category: "Churches and community", name: "Private Exchange inquiries and handoffs",
    description: "Send a private inquiry, agree to one pickup plan and keep personal listing defaults without publishing precise instructions.",
    steps: "On a published listing, its owner or current church Exchange manager can volunteer to receive inquiries. The receiving adult selects an inquirer and proposes a window. The inquirer confirms the exact plan before seeing private instructions. Open My inquiries and handoffs to complete, cancel, clear or report your own record. Settings, Exchange links to personal defaults that you can apply deliberately to a new personal draft.",
    href: "/platform/exchange/handoffs",
    eligibility: "Both people need current verified adult accounts. Each listing and the receiving adult’s contact preferences must permit new inquiries, and private report intake must be available. Church management does not grant another adult’s private history. Expired or canceled holds stay closed for owner review. Phone alerts require a separate dated handoff choice and current device; exact timing and physical fulfillment are not guaranteed.",
    availability: "conditional"
  },
  {
    id: "exchange-search-saved",
    category: "Churches and community",
    name: "Exchange search and saved choices",
    description:
      "Narrow listings by availability, audience, exact price or approximate area, and keep private favorites and named searches.",
    steps:
      "Open Exchange and choose More filters and sorting. Select a currency and price basis together, or choose a country, named town and distance. Open a listing to save a favorite. Use Save this search and Saved listings and searches to manage your choices. Settings, Exchange brings your listings, saved choices, contact and notification controls together.",
    href: "/platform/exchange",
    eligibility:
      "Saved choices require a verified adult account and remain private. Matching alerts require an explicit choice on each search. Phone alerts additionally require your Exchange notification preference and a registered device. Alerts cover future matching publications only. Current listing access is checked again; approximate distances use town centers and do not reveal homes.",
    availability: "available"
  },
  {
    id: "exchange-listings",
    category: "Churches and community",
    name: "Exchange listings",
    description:
      "Offer ordinary items, request items or describe lawful skilled help with a clear area and audience.",
    steps:
      "Open Exchange from Menu. Browse by type, search or category. Create a private draft, choose its type, add an optional photo and review the details before publishing. Use My listings and its status filter to edit, close, archive or duplicate a listing privately.",
    href: "/platform/exchange",
    eligibility:
      "Creating and managing listings requires a verified adult account. Publication requires current report coverage. Church-owned listings and Church need require assigned Exchange duties; a church audience requires current approved access. Service qualifications are self-stated. Prices do not create payments, reservations or fulfillment agreements. Existing contact consent applies.",
    availability: "conditional"
  },
  {
    id: "account-authenticator",
    category: "Privacy and account",
    name: "Authenticator for assigned duties",
    description:
      "Set up a private authenticator and recovery codes for church, topic, Support and platform duties.",
    steps:
      "Open Settings → Security → Your authenticator. Confirm your current sign-in, add the private key to your authenticator, confirm a code and save your recovery codes separately.",
    href: "/platform/account/authenticator",
    eligibility:
      "Available to eligible verified adults when enrollment is enabled. Setup gives no permissions. Broader enforcement is activated separately after operator enrollment. Protected actions then require a current code; personal account access remains available. Email recovery alone cannot replace a lost factor.",
    availability: "conditional"
  },
  {
    id: "language-location-preferences",
    category: "Privacy and account",
    name: "Date formats and location choices",
    description:
      "Save your preferred date and time formats, choose a private discovery area, and decide who can see your optional profile location.",
    steps:
      "Open Settings → Language and location. Preview date and time formats, choose a discovery town and radius manually or from optional device suggestions, or edit your profile location and its audience. Save each choice separately.",
    href: "/platform/settings/language/interface",
    eligibility:
      "Formats are saved to your signed-in account. The interface is in English; translation is unavailable. Device suggestions and member location sharing require verified adult eligibility. Device coordinates are not saved. Only me stays private, and discovery choices do not change profile disclosure or event times.",
    availability: "available"
  },
  {
    id: "private-feedback",
    category: "Help and feedback",
    name: "Feedback and private receipts",
    description:
      "Share an optional website rating, report a problem or suggest an improvement through a private help case.",
    steps:
      "Open Feedback from Menu or Help. Review any optional context and selected screenshot, choose whether staff may follow up, and revisit the saved receipt in My feedback. Optional prompts can be dismissed or permanently turned off.",
    href: "/platform/feedback",
    eligibility:
      "Intake requires available authorized support and the current notice. Signed-in adults may submit when available. Automatic prompts additionally require eligible opted-in use. Feedback stays confidential; no rating causes an email or public post.",
    availability: "conditional"
  },
  {
    id: "reviewed-ideas",
    category: "Help and feedback",
    name: "Reviewed ideas and chosen updates",
    description:
      "Browse separately reviewed public ideas, add or remove your vote, and choose whether to receive updates.",
    steps:
      "Open Ideas from Feedback. A signed-in adult can vote or choose channels. Manage an idea subscription on its page, case contact choices on your receipt, and available delivery channels in Notification settings.",
    href: "/platform/feedback/ideas",
    eligibility:
      "The board requires activation. Public copies need contributor consent and authorized human review; private cases and screenshots stay private. Votes do not promise delivery. Optional email and phone alerts require their available channel and your choices.",
    availability: "conditional"
  },
  {
    id: "feedback-review",
    category: "Help and feedback",
    name: "Weekly feedback review",
    description:
      "Authorized product reviewers can inspect source-linked themes and keep private weekly learning notes.",
    steps:
      "Open Admin → Feedback → Weekly feedback review. Choose a completed week, inspect authorized cases and manual themes, and record what to learn, try and check next with one canonical work link.",
    href: "/platform/admin/feedback/weekly",
    eligibility:
      "Current product-review permission is required. Each case still requires its own native permission. Platform growth and ratings require separate metric access; small detailed groups are suppressed. Review notes remain private to their author.",
    availability: "conditional"
  },
  {
    id: "platform-growth",
    category: "Privacy and account",
    name: "Platform growth reports",
    description:
      "Explicitly authorized operators can review aggregate registrations, lifecycle, measured use and request outcomes.",
    steps:
      "Open Admin → Growth. Choose dates, inspect definitions and measured coverage, and compare the preceding period. CSV export requires its own permission and records an audit receipt.",
    href: "/platform/admin/growth",
    eligibility:
      "Current explicit metric permission is required. Reports do not grant private account or case access. Optional collection, immature cohorts, small breakdowns and missing prompt evidence are labeled separately.",
    availability: "conditional"
  },
  {
    id: "optional-platform-measurement",
    category: "Privacy and account",
    name: "Your optional measurement choice",
    description:
      "Choose limited platform-use measurement, with separate optional referral and device sharing.",
    steps:
      "Open Settings → Privacy and interactions → Optional platform measurement. Review the disclosure and save your choice. It starts off; turning it off removes optional use and session facts.",
    href: "/platform/settings/privacy/measurement",
    eligibility:
      "Available to eligible verified adult accounts when configured. It excludes operational accounts, private messages, prayer content, page addresses and reading time. Raw use facts last up to 90 days. You can use the website with measurement off.",
    availability: "conditional"
  },
  {
    id: "admin-requests",
    category: "Privacy and account",
    name: "Admin requests and operations",
    description:
      "Review permitted help requests, reports and church requests in one workspace.",
    steps:
      "Authorized operators and reviewers open Admin from Menu. Filter and save a private queue view, open the original request, keep internal notes separate from requester replies, and use its existing review actions. Current health, account lookup and access management appear only for separately assigned duties.",
    href: "/platform/admin",
    eligibility:
      "Current explicit permissions are required for every source and action. Assignment and grouping do not widen access or share private conversations. New platform access changes require current sign-in confirmation and an unused authenticator code. Real support coverage and verification remain separate responsibilities.",
    availability: "conditional"
  },
  {
    id: "public-search-pages",
    category: "Posts and conversations",
    name: "Public pages and search",
    description:
      "Useful public pages have clear titles, stable links and current public details.",
    steps:
      "Browse church pages, published public events and public conversations. Follow their links to read the current source and its audience. Search engines refresh their own results on their own schedules.",
    href: "/platform/churches",
    eligibility:
      "Member profiles, private tools, drafts and search filters stay excluded from indexing. Prayers and posts with a content note need an author-supplied safe excerpt for search discovery. A search result never grants private access or verifies church authority.",
    availability: "available"
  },
  {
    id: "getting-started",
    category: "Account and profile",
    name: "Getting started at your pace",
    description: "Resume useful next steps without repeating completed setup.",
    steps:
      "Open Next steps and this week on Home, or Getting started in Help. Review your church request, optional profile and sharing choices, and saved church listing or representative drafts. Choose Later to hide a hint; restore it from the full guide.",
    href: "/platform/getting-started",
    eligibility:
      "Signed-in accounts. Optional hints never change contact consent, follows, verification or church permissions. Existing listing and representative setup remain separate, resumable paths.",
    availability: "available"
  },
  {
    id: "church-this-week",
    category: "Church tools",
    name: "This week at your church",
    description:
      "Find current events, church notices, open serving roles and your commitments.",
    steps:
      "Open Next steps and this week on Home. Choose a current approved church connection, review its Start here welcome and next seven days, then open an event or post to decide whether to participate.",
    href: "/platform/getting-started",
    eligibility:
      "Current approved church members see only permitted source records. Following a church or a pending request does not provide private access. Changed or withdrawn sources are checked again.",
    availability: "conditional"
  },
  {
    id: "church-welcome-hosts",
    category: "Church tools",
    name: "Church welcome and follow-up",
    description:
      "Choose a church welcome and help with deliberately labeled introductions and questions.",
    steps:
      "Church publishers choose an existing church-authored Start here post in Welcome and follow-up. Authors can label a published church post in Manage post → Welcome and questions. Separately authorized welcome hosts review unanswered or handled threads and date-filtered participation totals.",
    href: "/platform/my-church",
    eligibility:
      "Current publishing or explicitly delegated church welcome host permission. Labels do not change audiences; handled status sends no message and is not a public score. Totals exclude private prayer participants, contact lists and passive reading activity.",
    availability: "conditional"
  },
  {
    id: "author-bells",
    category: "Posts and conversations",
    name: "Choose new-post alerts",
    description:
      "Turn on a private bell for future posts by a person or church.",
    steps:
      "Open their profile or church page, open the relationship choices and choose Notify me of new posts. Choose Activity and phone categories separately in Notification preferences. Turn the bell off at any time.",
    href: "/platform/settings/notifications/availability",
    eligibility:
      "Verified adult accounts with current access. Follow, favorites and membership do not turn on the bell or phone alerts. Mutes, blocks and current source permissions still apply; enabling a bell does not deliver older posts.",
    availability: "available"
  },
  {
    id: "scheduled-church-posts",
    category: "Church tools",
    name: "Scheduled church posts",
    description:
      "Prepare a church post now and choose a future publication time.",
    steps:
      "In the post composer, choose your authorized church identity, enable Schedule publication and enter the time and time zone. Your private draft retains the plan. After scheduling, open Your drafts > Scheduled church posts to edit, reschedule or cancel it.",
    href: "/platform/scheduled-posts",
    eligibility:
      "Current church publishing access, checked again at publication. Plans stay hidden until published. Lost access, restored plans or a delay over one day return to a draft for publisher review. Personal, quote and topic posts publish immediately unless kept as private drafts.",
    availability: "conditional"
  },
  {
    id: "discovery-feeds",
    category: "Posts and conversations",
    name: "Discovery and private feed settings",
    description:
      "Read For You, Following, Your Church, Churches, Local, Public or Favorites using choices you control.",
    steps:
      "Choose a feed in Home or My feed, then open Feed Settings. Select exact topics, languages, traditions, post types or a broad area, and save a strict or explicitly expanded preset. Why this post explains the reading set. More/Less changes topic recommendations; hidden words and topics apply across all Home feeds. Refresh when you want a new set.",
    href: "/platform/settings/feed/discovery",
    eligibility:
      "Guest choices stay on that browser. Account preferences and favorites stay private. Following uses current follows; Your Church requires an approved connection. Public and Local never include church-only posts. Recommendations use explicit choices, not inferred faith or reading time.",
    availability: "available"
  },
  {
    id: "post-discovery",
    category: "Posts and conversations",
    name: "Optional post discovery labels",
    description:
      "Choose a language, tradition or broad locality for an individual post.",
    steps:
      "Open Optional discovery choices in the post editor. Leave labels unclassified or choose your own description. To publish a country or town, confirm that you want to share that locality. Changing the area asks for a new confirmation. Private drafts retain your entries; editing can clear the labels later.",
    href: "/platform",
    eligibility:
      "Labels follow the post's existing audience and never change account beliefs, membership or permission to read. Locality uses a named town center, with no GPS or personal address. Public discovery requires an eligible public post.",
    availability: "available"
  },
  {
    id: "topic-communities",
    category: "Posts and conversations",
    name: "Topic communities",
    description:
      "Explore public communities around faith and everyday life, or create a topic with its own rules.",
    steps:
      "Open Topic communities from Home, Explore or Menu. Read freely. Join and accept the current rules to start a discussion or reply as yourself. Follow separately to add posts to Topics I follow. Owners manage rules, membership restrictions, accepted moderator offers and ownership handoffs from Manage this topic.",
    href: "/platform/topics",
    eligibility:
      "Anyone can read public topics. Creating, joining and contributing require a verified adult account. Topic authority stays within that community. Following does not turn on phone alerts. Archived or moderated topics and restricted content are unavailable to readers; public sharing always checks current access.",
    availability: "available"
  },
  {
    id: "prayer-follow-up",
    category: "Posts and conversations",
    name: "Prayer and private follow-up",
    description:
      "Acknowledge prayer, save a private reminder and follow author updates on posts, comments and replies.",
    steps:
      "Choose Pray, read the first-use guide, then choose I prayed after praying. Your name stays hidden unless you share it. Save privately and choose future author updates independently. Return from Menu > My private prayer list. Authors can publish an update or praise report in the same discussion.",
    href: "/platform/prayers",
    eligibility:
      "Verified adult accounts with current source access. Prayer records do not measure faith or grant permissions. Phone alerts require a separate choice and enabled device. Undo removes the acknowledgment and name; removing a private save leaves the acknowledgment unchanged.",
    availability: "available"
  },
  {
    id: "follow-conversation",
    category: "Posts and conversations",
    name: "Follow a conversation",
    description: "See new replies to a followed conversation in your Activity.",
    steps:
      "Open a post’s discussion and choose Follow conversation. Choose Default to return to direct replies and mentions, or Mute conversation to stop its Activity and phone alerts. Enable optional Replies in conversations you follow in Notification preferences.",
    href: "/platform/activity",
    eligibility:
      "Current account and source access are required. Following a person or church does not subscribe to every discussion. Phone alerts require a separate opt-in and an enabled device; later choices do not send old replies.",
    availability: "available"
  },
  {
    id: "profile-post-pin",
    category: "Posts and conversations",
    name: "Pin a post to your profile",
    description:
      "Feature one of your published personal posts at the top of your profile.",
    steps:
      "Open your post’s More options, then choose Pin to profile. Pin another post to replace it, or choose Unpin from profile to restore the normal order.",
    href: "/platform/profile/me",
    eligibility:
      "Your own published personal posts only. The original audience, source permissions, Likes and comments stay the same. A pin does not change Home or feed ranking.",
    availability: "available"
  },
  {
    id: "participation-choice",
    category: "Getting started",
    name: "Exploring Faith and participation choices",
    description:
      "Choose how you would like to participate, including Exploring Faith.",
    steps:
      "Choose during account creation, or change your saved choice in Edit profile. Exploring Faith means: I’m learning about Christianity and figuring out what I believe.",
    href: "/platform/signup",
    eligibility:
      "Exploring Faith is private to your account. Participation choices do not grant church or staff authority, and ordinary verification and age requirements still apply.",
    availability: "available"
  },
  {
    id: "personal-activity",
    category: "Posts and conversations",
    name: "Notifications",
    description:
      "See messages, mentions, adult photo tags, friend requests and church updates in one personal view.",
    steps:
      "Choose the labeled Notifications bell in the header. Filter All, Unread or a category; open the exact source or mark a group read or unread. Mark all read covers its loaded boundary, so later arrivals stay unread. Reading a notification does not mark unseen messages read.",
    href: "/platform/activity",
    eligibility:
      "Verified eligible adult accounts. Links and names require current source access. Optional notification choices and mutes still apply; Messages retains its own history and pending requests. Reading Activity cancels an optional phone alert that has not started delivery. Already delivered phone notifications remain under your device controls.",
    availability: "available"
  },
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
      "Verified eligible adult personal accounts. New requests default to No one. New contact and sending require current reporting coverage; the interface explains when they are paused. Blocks stop new sends. Clear for me does not erase the other participant's history. Optional phone alerts have separate controls and do not grant contact permission. Attachments, groups, delivery/read receipts and email are unavailable.",
    availability: "conditional"
  },
  {
    id: "report-review",
    category: "Privacy and account",
    name: "Scoped report review",
    description:
      "Authorized reviewers can inspect selected reports, record reasons and apply scoped post or comment restrictions.",
    steps:
      "Open Your reports and the review link. Inspect the selected source, choose a decision and author explanation, then confirm its preview. Lost responses keep the same retry. Author reconsideration cases open in the assigned reviewer’s existing help inbox.",
    href: "/platform/reports/review",
    eligibility:
      "Explicit current report authority for both original and current source scopes. Hide, remove and restore preserve source audiences, reply choices and author withdrawal. Case status alone does not change content. Reconsideration uses the assigned reviewer, including the founder for founder-reviewed cases; it is not independent review. Account restrictions require their separate authority.",
    availability: "conditional"
  },
  {
    id: "content-decisions",
    category: "Privacy and account",
    name: "Decisions about your content",
    description:
      "Read a private explanation and request reconsideration of a decision about your post or comment.",
    steps:
      "Open Your reports, then Decisions about your content, or follow its Activity update. Inspect the decision and your selected text. Review who will receive your request, explicitly agree, then send it. Continue replies in the linked help case.",
    href: "/platform/reports/decisions",
    eligibility:
      "Current eligible personal authors or publishers for the speaking church. Reporter identities and private review notes are excluded. Reconsideration is available only while the assigned reviewer has current authority. It does not automatically restore content or provide independent review.",
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
      "Open Menu, then Settings. Search words such as password, alerts or hide phone, or choose a folder. Related personal settings link to existing privacy, directory, calendar and notification controls. Preview text, theme and reading layout in Display before saving. Reading preferences can be restored separately on this browser.",
    href: "/platform/settings",
    eligibility:
      "Sign in to your account. Browser appearance is separate from personal and selected-church settings. Church tools require current access. Contact preferences govern new adult requests; messaging and optional phone notifications retain their current eligibility and operational requirements. Family and payment controls are unavailable here.",
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
      "Signed-in account. Exports, deactivation and permanent deletion require current account confirmation. Permanent deletion explains immediate access loss, retained shared history and removal deadlines; its availability is shown before confirmation. Browser status does not grant church access or publish your location. General connected-app permissions are unavailable.",
    availability: "available"
  },
  {
    id: "phone-notifications",
    category: "Getting started",
    name: "Optional phone notifications",
    description:
      "Choose independent Activity and phone alerts, with private previews, quiet hours and a test you control.",
    steps:
      "Open Settings > Notifications > Notification preferences. Choose Activity and phone categories for replies, mentions, followed conversations, prayer, author bells, reactions, church changes and commitments. Phone delivery also requires Enable notifications and your browser's permission. Set quiet hours or choose Send me a test notification. On iPhone, first add the app to your Home Screen using the installation help.",
    href: "/platform/settings/notifications/availability",
    eligibility:
      "Eligible verified adult accounts and a supported browser with delivery available. Permission is requested only after your tap. Provider acceptance does not prove your phone displayed an alert. Signing out or switching accounts removes the old association; in-app messages remain available without push.",
    availability: "conditional"
  },
  {
    id: "founder-welcome",
    category: "Posts and conversations",
    name: "Founder welcome and replies",
    description:
      "Read a clearly labeled welcome and choose whether to reply directly to Andrew.",
    steps:
      "When welcomes are active, finish account setup and verification, then open Messages. Reply to Andrew uses the same private conversation. Optional founder announcements have their own preference, separate from personal replies.",
    href: "/platform/messages",
    eligibility:
      "New eligible adult accounts only, once each after verification and required setup, while founder operations are available. No existing-account backfill is sent. Replying does not change ordinary contact preferences or create a friendship. Current blocks and account restrictions apply.",
    availability: "conditional"
  },
  {
    id: "polls",
    category: "Posts and conversations",
    name: "Community polls",
    description:
      "Ask a question and choose one or several answers with readable vote totals.",
    steps:
      "Write and publish a post, then choose Add a poll from the composer. Set 2 to 8 choices and a closing time. Members can change their vote before closing; authorized post editors can close voting.",
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
      "Open an event’s volunteer post and choose I can help for an instant-signup role, or open its opportunity to apply when approval is required. Review or cancel an accepted timed signup in My commitments. Event RSVP is a separate choice. Fixed shifts keep their own times when the parent event changes, and conflicts require coordinator review.",
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
      "Invite someone to join God’s Churches and become friends with you.",
    steps:
      "Open Menu, then My QR code. Enable your invitation, then copy, share or download it. A signed-out guest sees the signup form first and chooses whether to connect. Verification and adult eligibility still come before connection. Existing members sign in to review; existing friends see their current friendship. Either person can remove the friendship in profile relationship controls.",
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
    id: "adult-photo-tags",
    category: "Profiles",
    name: "Adult photo tags and approvals",
    description:
      "Review a photo tag before it becomes an approved association.",
    steps:
      "Open Photo tags and approvals from a readable photo, or Review photo tags in Notifications. Approve, decline or remove a request. Find approved photos from a profile’s Photos tab and choose who may ask to tag you in Privacy settings.",
    href: "/platform/photo-tags",
    eligibility:
      "Verified adult accounts with current photo access. Pending requests stay private, and approved tags keep the original photo audience. Removing a tag does not delete someone else’s photo. Family and child tagging remain unavailable; phone alerts are a separate choice.",
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
      "Open the community, choose a post type and audience, review who can reply, then publish. Under Content note and preview, you can add a note and choose a short safe excerpt. Edit these choices later with Edit post. Authorized church moderators can change discussion settings with a recorded reason; post managers can review recent moderation decisions.",
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
    name: "Feed choices and focused reading",
    description:
      "Choose a community or discovery feed, then read in List or Pages.",
    steps:
      "Choose Latest, Friends, Top This Week or Trending in Home or My feed. Open More feeds for the other reading choices. Your account remembers that choice. Latest shows public posts; Friends shows accepted mutual friends; Top This Week counts Likes received in the last seven days; Trending gives more weight to recent Likes. Refresh posts updates the reading set. List, Pages and display settings stay separate.",
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
      "Share the website or an eligible public post, church or event with a branded preview.",
    steps:
      "Open Menu and tap Share God’s Churches near the top to see the website QR immediately. Copy, share or download its PNG. Use Share on posts and Share publicly on church or event pages.",
    href: "/platform/share?qr=1",
    eligibility:
      "Only eligible public pages have public share links. Restricted or unavailable pages use generic branding. Other apps control their own preview caches and crops. A QR code grants no account or church permissions.",
    availability: "available"
  },
  {
    id: "installation",
    category: "Sharing and installation",
    name: "Installation help",
    description:
      "Optionally install the app or bookmark its clean home address.",
    steps:
      "After a new account signs in, Keep God’s Churches handy offers optional installation, bookmarking or Continue in browser. Verification and invitation progress stay separate. Install and Bookmark help remain in Menu after dismissal. Open or copy the clean app page before following your browser's instructions; invitation and verification links are never used as saved app addresses.",
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
      "Choose Check for updates in the footer. Available updates and connection problems appear above the page. Read What's new, finish saving and refresh only when ready.",
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
    id: "calendar-following", version: "2026.09.22.6", date: "2026-09-22",
    summary: "Save private follow, visibility and color choices for your available calendars.",
    added: ["Calendar layers keep your follow, show and color choices across sign-ins. Unfollowing removes the saved overlay, while hiding keeps the calendar followed."],
    improved: ["My calendars distinguishes saved choices from a temporary selection and keeps each available source discoverable. Access is checked again when reading or saving.", "Calendar Settings, help and account export include your private layer choices. Recovery turns uncertain restored choices off until you review them."],
    fixed: [], featureIds: ["calendar-following", "calendar-settings"]
  },
  {
    id: "calendar-privacy-navigation",
    version: "2026.09.22.5",
    date: "2026-09-22",
    summary: "Open an event’s privacy controls directly and review the selected church and your current calendar duties before making changes.",
    added: ["Eligible event agendas link directly to existing event sharing or church publication controls.", "Church calendar and event administration show the selected church, current editing and publication duties, and a link to assigned roles and permissions."],
    improved: ["Calendar Settings links to permitted church calendar administration and keeps it separate from personal viewing choices."],
    fixed: [],
    featureIds: ["calendar-settings"]
  },
  {
    id: "calendar-sharing-previews",
    version: "2026.09.22.4",
    date: "2026-09-22",
    summary: "Compare busy-only availability and full event details before deliberately sharing a calendar or event.",
    added: ["Existing calendar and event sharing screens show read-only previews using one current event. Busy only shows time and availability; full details also shows the event’s supplied information."],
    improved: ["Calendar Settings links to the comparisons and explains that previewing saves nothing. Existing shares stay active until you change or end them.", "Whole-calendar examples are clearly limited to one active event in the viewed month, while sharing still includes current and future events. Event-series examples identify the current occurrence."],
    fixed: [],
    featureIds: ["calendar-settings", "profile-selected-event"]
  },
  {
    id: "calendar-settings-layout",
    version: "2026.09.22.3",
    date: "2026-09-22",
    summary: "Review personal calendar display, event alerts and schedule sharing together in Settings.",
    added: ["Calendar Settings separates display, reminders and alerts, calendars and subscriptions, and schedule sharing.", "Busy-only availability and event-detail sharing have distinct entries with an audience explanation before them."],
    improved: ["Existing date formats, notification choices and calendar controls remain the place to save or review each choice. Current-view choices are distinguished from saved preferences.", "Unavailable reminder, subscription and calendar-default features are explained without inactive controls."],
    fixed: [],
    featureIds: ["calendar-settings"]
  },
  {
    id: "profile-appearance-settings",
    version: "2026.09.22.2",
    date: "2026-09-22",
    summary: "Find profile appearance and section controls together in Settings, with clear draft and saved states.",
    added: ["Profile appearance and Profile sections open the existing editor at the requested group, including after sign-in.", "Restore appearance defaults changes only your draft palette and cover background. Use Save profile to apply the choices."],
    improved: ["The appearance swatch labels unsaved changes and identifies the last confirmed saved preset. Member and visitor previews continue to show the saved profile.", "Text, section order, selected events and photo drafts remain intact when restoring appearance defaults. Existing photo, conflict and privacy checks still protect saving."],
    fixed: ["Focused Settings entry waits for current account access before moving keyboard focus into the profile form."],
    featureIds: ["optional-profile-sections", "account"]
  },
  {
    id: "volunteer-applications-and-shifts",
    version: "2026.09.22.1",
    date: "2026-09-22",
    summary: "Apply privately for church opportunities and keep volunteer shifts distinct from their parent event.",
    added: ["Create a timed opportunity or ongoing ministry role, submit a private application and review its decision in My applications.", "Authorized coordinators accept or decline applications. Acceptance confirms one available place; withdrawal releases only uncompleted help and keeps the decision history."],
    improved: ["Shorter shifts use fixed times within their parent event. My commitments shows the shift interval, while changed parent times can pause new approvals for review.", "Church Needs, event posts and application review use the same timed reservation. Existing instant-signup roles keep their behavior."],
    fixed: ["Application confirmation opens the saved application list after a recovered response. Current account and church access control private pages, exports and coordinator views."],
    featureIds: ["volunteer-applications", "volunteering", "church-needs", "rsvp"]
  },
  {
    id: "canonical-profile-event-links",
    version: "2026.09.18.14",
    date: "2026-09-18",
    summary: "Show an existing event on your profile while keeping its original audience and RSVP.",
    added: ["Check an event page link, deliberately select it and save it to About. Remove the selection without changing the original event."],
    improved: ["Church, group and profile event views reflect the same event edits and cancellation. Current source permissions determine which details each viewer can see.", "Profile conflict review includes the saved event choice. Older editors preserve it, and protected recovery prevents a removed selection from returning."],
    fixed: ["Event links copied from calendar pages work in group and profile pickers with their display time zone."],
    featureIds: ["profile-selected-event", "optional-profile-sections", "gather-groups"]
  },
  {
    id: "profile-section-order-and-media-settings",
    version: "2026.09.18.13",
    date: "2026-09-18",
    summary: "Arrange your profile sections and find media availability in Settings.",
    added: ["Choose the order of My testimony, Skills and Links in Edit profile. Your saved order appears in About, and empty sections stay hidden.", "Media and data use brings playback, captions and quality availability together, with a working link to browser-local photo Data saver."],
    improved: ["Keyboard movement keeps focus on the section you moved. Order-only edits use the existing unsaved-change and latest-saved review controls.", "Unavailable playback, caption and video quality capabilities are explained without presenting them as saved preferences."],
    fixed: [],
    featureIds: ["optional-profile-sections", "media-settings-layout"]
  },
  {
    id: "church-visitor-information",
    version: "2026.09.18.12",
    date: "2026-09-18",
    summary: "Find supplied visitor information on public church pages.",
    added: ["Church pages can include optional service times, accessibility information, languages, children's program notes and visitor contact preferences."],
    improved: ["Visitor details are labeled as supplied information, with a reminder to confirm arrangements directly. Empty fields stay absent.", "Private correction drafts and authorized profile changes use the existing review and publication controls on the same church page."],
    fixed: ["Long valid multilingual church drafts fit the bounded request limit. Representative forms send each profile field once, and unsupported text is rejected before saving."],
    featureIds: ["church-visitor-information"]
  },
  {
    id: "menu-shortcuts-and-profile-sections",
    version: "2026.09.18.11",
    date: "2026-09-18",
    summary: "Keep your preferred Menu destinations close and add optional profile sections.",
    added: [
      "Choose up to six available Menu shortcuts, arrange their order and save them to your account for other signed-in sessions.",
      "Add an optional testimony, up to ten skills and three labeled links to your profile's About section. Empty fields remove their sections."
    ],
    improved: [
      "Unsaved shortcut choices and profile entries retain their existing confirmation and conflict-review paths. Resetting shortcuts leaves other preferences unchanged.",
      "Profile sections use current member access and protected recovery. Private account contacts are not imported, and linked sites are not embedded."
    ],
    fixed: [
      "An unavailable shortcut can be removed and saved after access changes. Invalid profile text is rejected while editable entries remain available."
    ],
    featureIds: ["menu-shortcuts", "optional-profile-sections"]
  },
  {
    id: "navigation-and-calendar-recovery",
    version: "2026.09.18.10",
    date: "2026-09-18",
    summary: "Return to your place and recover unsaved calendar edits safely.",
    added: [],
    improved: ["Back preserves permitted Exchange filters and reading position across linked pages.", "Calendar edits keep unsaved entries and offer an explicit review when saved information changes."],
    fixed: ["Calendar pages conceal cached private details when access changes.", "Retrying an uncertain calendar save keeps its original request and avoids duplicate changes."],
    featureIds: ["exchange-listings", "calendar"]
  },
  {
    id: "exchange-price-browsing",
    version: "2026.09.18.9",
    date: "2026-09-18",
    summary: "Improved price-sorted Exchange browsing for larger catalogs.",
    added: [],
    improved: ["Price sorting keeps the same current-access checks and stable page order."],
    fixed: [],
    featureIds: ["exchange-listings"]
  },
  {
    id: "menu-groups-and-clear-security-guidance",
    version: "2026.09.18.8",
    date: "2026-09-18",
    summary: "Find existing features in clearer Menu groups and review essential security notice guidance.",
    added: ["Menu organizes destinations into Community, Discover, My activity and Account, while preserving the five primary links."],
    improved: ["Security explains required authenticator notices and links to separate optional notification choices.", "The authorized Growth dictionary explains community outcome definitions and clearly identifies outcomes that are not measured."],
    fixed: ["Menu cards leave more room for enlarged text on narrow screens.", "Hiding recovery codes moves keyboard focus to a clear confirmation, without claiming that an external copy was saved."],
    featureIds: ["settings", "account-authenticator"]
  },
  {
    id: "separate-likes-and-reply-email-choices",
    version: "2026.09.18.7",
    date: "2026-09-18",
    summary: "Separate email choices for Likes and direct replies, with clear delivery availability.",
    added: ["Likes and direct replies each have an initially-off email choice, separate from Activity, phone alerts and required account emails."],
    improved: ["Unavailable email delivery and denied browser permission are explained separately. Turning off one category preserves other choices, and older activity is not sent when email is enabled."],
    fixed: [],
    featureIds: ["optional-social-email", "phone-notifications"]
  },
  {
    id: "church-settings-and-current-administration",
    version: "2026.09.18.6",
    date: "2026-09-18",
    summary: "Review your church connection and current administration access together in Settings.",
    added: ["My church settings distinguishes pending, approved and ended connections and links the existing membership, directory and personal notification choices."],
    improved: ["Church administration shows its current scope and connects existing Groups, Pantry, Exchange, volunteer, coordinator and review tools to assigned permissions."],
    fixed: ["Ordinary membership and role titles no longer appear as administration choices. Opening a church rechecks current access and conceals unavailable tools."],
    featureIds: ["church-settings", "church-management"]
  },
  {
    id: "communities-and-interests-settings",
    version: "2026.09.18.5",
    date: "2026-09-18",
    summary: "Find your personal group and event choices together in Settings.",
    added: ["Communities and interests connects group invitations and membership with existing contact, calendar, commitment and notification choices."],
    improved: ["Settings search and Help explain invitation consent, private membership, separate phone alerts and church administration."],
    fixed: [],
    featureIds: ["community-preferences"]
  },
  {
    id: "gather-groups-and-private-discussions",
    version: "2026.09.18.4",
    date: "2026-09-18",
    summary: "Adult Gather groups with deliberate membership, named leadership and private discussions.",
    added: [
      "Create listed adult groups or private invitation-only cohorts, set rules and review membership choices.",
      "Choose whether your name appears on the member roster. Accept leadership or ownership explicitly and retain permitted history when a group is archived.",
      "Publish private discussions and questions with categories, polls, selected answers, leader pins, locked replies and scoped report review.",
      "Read progress covers visible replies. Following a thread and enabling phone alerts remain separate choices. Group event links retain the original calendar permissions."
    ],
    improved: ["Menu, My church, Settings and Help connect group discovery, membership, privacy and notification choices."],
    fixed: ["Confirmed group choices refresh their current state. Unconfirmed requests stay available through unrelated page updates.", "Start a separate group draft while preserving an existing saved draft and its original audience."],
    featureIds: ["gather-groups", "private-group-discussions"]
  },
  { id: "church-pantry-and-private-pickups", version: "2026.09.18.3", date: "2026-09-18", summary: "Church pantry guidance, private assistance requests and deliberate pickup offers.", added: ["Churches can publish hours, access guidance and up to twelve supply categories with clear counted or approximate availability.", "Adults can send a minimal private request to a named coordinator, review and confirm a pickup offer, cancel and clear ended details.", "Explicit assistance duties govern private queues, pickup capacity, collection and missed-pickup corrections. Stock adjustments record reasons separately.", "Prepare a Church Need from a public category and deliberately link the reviewed active need without copying recipient histories."], improved: ["Settings, Exchange and Help connect assistance records to their existing privacy, export, report and recovery controls.", "Generic assistance updates use a separate phone notification choice and current access checks."], fixed: [], featureIds: ["church-pantry", "church-needs"] },
  {
    id: "church-needs-and-receipts",
    version: "2026.09.18.2",
    date: "2026-09-18",
    summary: "Coordinate Church Needs with clear promises, actual receipts and private contributor choices.",
    added: [
      "Add Donate, Sell to us, Transport and Volunteer action slots to a church-owned need with an exact deadline and responsible coordinator.",
      "Reserve available quantities, deliberately join a full-slot waitlist or submit a private paid quote. Promises, accepted quotes and confirmed receipts remain distinct.",
      "Record partial receipts, correct mistakes with a reason and track equipment returns. Timed volunteers use the existing event role and capacity.",
      "Publish organizer updates, close individual slots and repeat a need’s structure as a fresh private draft without copying contributors or their information."
    ],
    improved: [
      "Exchange and Settings link to your private Needs contributions. Help explains counts, returns and the separate Needs notification choice.",
      "Current audience, account, church duty, block and coordinator checks apply to private records, retained pages and delivery."
    ],
    fixed: [],
    featureIds: ["church-needs", "exchange-listings"]
  },
  {
    id: "clearer-search-and-home",
    version: "2026.09.18.1",
    date: "2026-09-18",
    summary: "Clearer search states, simpler Home controls and consistent God’s Churches branding.",
    added: [],
    improved: [
      "Choose Latest, Friends, Top This Week or Trending directly. More feeds keeps the other approved choices available, with one Refresh posts action and the same List, Pages and full-screen reader.",
      "Routine update checks are in the footer. Updates and connection problems still appear prominently, and unsent work continues to block refresh.",
      "More compact Home spacing brings posts closer to the mission and signup invitation. Website labels and installation text consistently use God’s Churches."
    ],
    fixed: [
      "Search shows a loading or access-check state while returning to results, with a manual resume action when results have been concealed. Existing matching, filtering and audience rules are unchanged."
    ],
    featureIds: ["search", "reader", "updates", "installation"]
  },
  {
    id: "private-following-lists",
    version: "2026.09.16.13",
    date: "2026-09-16",
    summary: "Organize your follows into private reading lists.",
    added: [
      "Create, rename and delete up to 20 private lists with up to 100 followed people or churches each.",
      "Choose a saved list in Following and search your current follows while editing its membership."
    ],
    improved: [
      "List names and membership stay private to your account, including export and recovery. Deleting a list keeps every follow intact.",
      "Unfollowing or blocking removes a list entry. Refollowing does not add it back, and current audience, mute and source checks still control every post."
    ],
    fixed: [
      "A deleted selected list or missing newer recovery choices require deliberate review before Following reopens. Uncertain saves confirm the same request."
    ],
    featureIds: ["private-following-lists"]
  },
  {
    id: "exchange-private-handoffs", version: "2026.09.16.12", date: "2026-09-16",
    summary: "Agree to private Exchange handoffs with clear consent, pickup windows and personal defaults.",
    added: [
      "Send and review private listing inquiries when the receiving adult’s choices permit them. Each listing can have one selected or agreed handoff at a time.",
      "Propose a pickup window, confirm its exact plan and then share private instructions with the two participants. Complete, cancel or record a missed handoff privately. Expired holds require owner review before reopening.",
      "Save private personal defaults for listing type, audience, general town and reusable pickup text. Apply listing defaults only to a new personal draft, and copy pickup text deliberately into a proposed plan."
    ],
    improved: [
      "Incoming and outgoing histories, private reporting and account export keep current participant access. Blocking, source withdrawal, lost authority and protected recovery cannot silently revive an old agreement.",
      "Handoff updates and reminders have their own optional phone category. Saved-search notification choices stay separate."
    ],
    fixed: ["An active handoff cannot be bypassed by changing a listing’s terms or availability. Uncertain saves confirm the original request before another action."],
    featureIds: ["exchange-private-handoffs", "exchange-listings", "exchange-search-saved"]
  },
  {
    id: "exchange-search-saved-choices",
    version: "2026.09.16.11",
    date: "2026-09-16",
    summary:
      "Find Exchange listings with clearer filters, private favorites and saved searches.",
    added: [
      "Filter by availability, item condition, audience, exact currency and price basis, free offers or an approximate area. Choose newest, comparable price or nearest-area sorting.",
      "Keep private favorite listings and named searches. Choose optional matching alerts for future available listings; phone delivery uses your separate notification and device choices."
    ],
    improved: [
      "Applied filters can be removed individually, and returning from a listing preserves the search context.",
      "Unavailable favorites show a private generic state and can still be removed. Saved choices are included in account export and deletion.",
      "Settings, Exchange links your listing audiences, general listing area, saved choices, contact requests and notification preferences."
    ],
    fixed: [
      "Changed listing access and account changes are checked again before saved content or matching alerts are shown. Uncertain saves can confirm the original request."
    ],
    featureIds: ["exchange-search-saved", "exchange-listings"]
  },
  {
    id: "exchange-items-requests-services",
    version: "2026.09.16.10",
    date: "2026-09-16",
    summary:
      "Create and manage Exchange listings with private drafts, clear audiences and optional photos.",
    added: [
      "Exchange supports Free, For sale, Wanted and Service listings, plus Church need for authorized church-owned listings.",
      "Wanted listings include requested items and an optional needed-by date. Services state an area, availability, self-stated qualifications and free help or an exact paid rate."
    ],
    improved: [
      "My listings preserves saved drafts, offers explicit publication and supports closing, archiving and private duplication. Uncertain saves can retry the same request.",
      "Listing photos, reports, account export and deletion use the existing privacy and safety controls."
    ],
    fixed: [
      "Changing listing type clears incompatible fields before saving, and changed account or church access is checked again before private content is shown."
    ],
    featureIds: ["exchange-listings"]
  },
  {
    id: "account-authenticator-enrollment",
    version: "2026.09.16.9",
    date: "2026-09-16",
    summary:
      "Prepare an authenticator and private recovery codes for your assigned duties.",
    added: [
      "Eligible adults can enroll from Account security when setup is enabled, with current sign-in confirmation and private recovery codes."
    ],
    improved: [
      "Replacement retires the old factor, recovery codes and other sign-ins. Essential security notices show whether the email provider accepted them.",
      "Protected-action confirmation can open in another tab while your original form stays available. Broader enforcement remains a separate activation step."
    ],
    fixed: [
      "Protected database recovery cannot reactivate an old authenticator or its confirmed sessions.",
      "Phone navigation labels wrap within their own buttons at larger text sizes."
    ],
    featureIds: ["account-authenticator", "admin-requests"]
  },
  {
    id: "feed-rendering-efficiency",
    version: "2026.09.16.8",
    date: "2026-09-16",
    summary:
      "Feed pages do less repeated work while keeping current conversations and your chosen date formats.",
    added: [],
    improved: [
      "Feed cards load current discussions when opened and retain current visible comment counts.",
      "Repeated date labels reuse formatting rules while preserving your date order, time format and the source time zone."
    ],
    fixed: [],
    featureIds: ["discovery-feeds", "language-location-preferences"]
  },
  {
    id: "optional-device-area-suggestions",
    version: "2026.09.16.7",
    date: "2026-09-16",
    summary:
      "Optionally use this device once to suggest a private discovery area.",
    added: [
      "Eligible adults can request approximate town suggestions, choose an area and save it separately."
    ],
    improved: [
      "Manual town selection stays available after denied permission, cancellation, timeout or unavailable device location.",
      "The interface clearly marks automatic translation as unavailable; language filters do not translate posts or other media."
    ],
    fixed: [
      "Keyboard skip links stay hidden until focused even at larger text sizes."
    ],
    featureIds: ["language-location-preferences"]
  },
  {
    id: "regional-formats-and-private-location",
    version: "2026.09.16.6",
    date: "2026-09-16",
    summary:
      "Save date and time formats and choose who can see your profile location.",
    added: [
      "Preview and save date order and 12-hour or 24-hour time for your account.",
      "Choose Only me or permitted signed-in members for your optional profile location."
    ],
    improved: [
      "Calendars, messages, activity and account views use your formats while preserving event time zones and all-day dates.",
      "Private discovery areas remain separate from profile location and its audience."
    ],
    fixed: [
      "A restored older profile cannot disclose a location hidden or removed by a newer privacy choice."
    ],
    featureIds: ["language-location-preferences"]
  },
  {
    id: "language-and-private-discovery",
    version: "2026.09.16.5",
    date: "2026-09-16",
    summary:
      "Find language guidance and private discovery location together in Settings.",
    added: [
      "Language and location settings link to your existing town, radius, reading-language, profile and calendar controls."
    ],
    improved: [
      "Guidance explains the English interface, content-language filters and separate profile location.",
      "Manual town selection works without device location permission and does not change your shared profile."
    ],
    fixed: [],
    featureIds: []
  },
  {
    id: "help-and-product-progress",
    version: "2026.09.16.4",
    date: "2026-09-16",
    summary:
      "Find feedback, private receipts and product progress from Help and Settings.",
    added: [
      "Help and Settings link directly to feedback, your private receipts and reviewed ideas."
    ],
    improved: [
      "Product guidance distinguishes plans from released changes and explains optional contributor credit."
    ],
    fixed: [
      "Help now describes the existing permanent-deletion flow and all browser reading-reset choices."
    ],
    featureIds: ["private-feedback", "reviewed-ideas"]
  },
  {
    id: "clear-website-writing",
    version: "2026.09.16.3",
    date: "2026-09-16",
    summary:
      "Read clearer guidance, date ranges and status labels across the website.",
    added: [],
    improved: [
      "Forms, notifications, help, welcome text and sharing descriptions use clearer sentence punctuation.",
      "Character limits and date ranges use the word to, and report placeholders say when information is unavailable."
    ],
    fixed: [
      "Unavailable report percentages use an explicit explanation instead of an ambiguous separator."
    ],
    featureIds: ["personal-activity", "private-messages", "public-search-pages"]
  },
  {
    id: "notifications-and-photo-tag-approval",
    version: "2026.09.16.2",
    date: "2026-09-16",
    summary:
      "Find your notifications immediately and approve photo tags before they appear.",
    added: [
      "A labeled Notifications bell and unread count stay available in the signed-in header on phones and larger screens.",
      "Choose people to mention in a post; private drafts keep the selection and publication checks current consent and access.",
      "Adults can request, approve, decline and remove photo tags, with separate privacy choices and approved photo associations."
    ],
    improved: [
      "All, Unread and category views support read, unread and mark-all choices across sessions without falsely reading unseen messages.",
      "Accepted friend invitations and newly opened volunteer roles join existing notifications under current consent, subscriptions and privacy rules.",
      "Volunteer alerts open the exact role or owned signup; canceled and older signups remain reviewable without exposing lost source details."
    ],
    fixed: [
      "New arrivals remain unread after an earlier mark-all boundary, and retries do not overwrite later read choices.",
      "Photo tags never widen an audience, revive a removed association after protected recovery or delete someone else’s photo."
    ],
    featureIds: [
      "personal-activity",
      "adult-photo-tags",
      "private-messages",
      "photo-library"
    ]
  },
  {
    id: "feedback-and-product-review",
    version: "2026.09.16.1",
    date: "2026-09-16",
    summary:
      "Keep feedback private, choose follow-up and review product outcomes with traceable sources.",
    added: [
      "Feedback forms and private receipts support optional ratings, bug details, suggestions and deliberately selected private screenshots when staffed intake is available.",
      "An optional, dismissible prompt respects measurement consent, quiet moments, cross-device cooldowns and the permanent Don't ask again choice.",
      "A reviewed idea board supports contributor consent, removable votes, honest roadmap states, merge reversal and chosen updates when activated.",
      "Authorized weekly product reviews combine source-scoped manual themes, reopened and high-impact cases, released changes and private learning notes."
    ],
    improved: [
      "Growth reports and permitted CSV exports include retained ratings, displayed-prompt coverage, voluntary submissions and missing-attribution states with small-group protection.",
      "Selected feedback channels share existing Activity, notification preferences, quiet hours and delivery retries. Current consent and source access are rechecked before delivery.",
      "Saved privacy choices and review edits participate in protected recovery; unavailable channels can still be switched off."
    ],
    fixed: [
      "A staff reply that directly resolves a request now counts as the first substantive human response.",
      "Withdrawn or expired prompt evidence never becomes a fabricated voluntary response or historical exposure."
    ],
    featureIds: [
      "private-feedback",
      "reviewed-ideas",
      "feedback-review",
      "platform-growth",
      "admin-requests"
    ]
  },
  {
    id: "platform-growth-measurement",
    version: "2026.09.15.7",
    date: "2026-09-15",
    summary:
      "Review platform outcomes with clear coverage and an optional measurement choice.",
    added: [
      "Private aggregate Growth reports with date controls, lifecycle reconciliation, mature return cohorts and separately permitted CSV exports.",
      "Default-off platform measurement with optional referral and coarse device choices in Privacy settings."
    ],
    improved: [
      "Reports distinguish current service records, observed use, unknown history and suppressed small breakdowns.",
      "Getting started can be deliberately finished while every profile, photo and church step remains optional."
    ],
    fixed: [
      "Report boundaries preserve the reporting calendar independently of the database timezone.",
      "Withdrawal, account lifecycle and protected backup restoration clear optional measurements before they can be reused."
    ],
    featureIds: [
      "platform-growth",
      "optional-platform-measurement",
      "getting-started"
    ]
  },
  {
    id: "admin-request-operations",
    version: "2026.09.15.6",
    date: "2026-09-15",
    summary: "Handle permitted requests in one private admin workspace.",
    added: [
      "A scoped request queue with private saved views, internal notes, priorities, reminders and original requester conversations.",
      "Duplicate links and bounded batch actions preserve original requests and report each result separately.",
      "Separately permitted operational health, account lookup, audit and authenticator-protected access management."
    ],
    improved: [
      "Phone and keyboard navigation retain filtered returns and selected requests; conflicting edits preserve unsent entries.",
      "Current permission checks keep revoked access and older reviewer assignments from reopening private work."
    ],
    fixed: [
      "Authorized topic reviewers can find their assigned content reconsideration cases in the support inbox.",
      "Assigned support owners can reopen a resolved request for follow-up through its existing conversation."
    ],
    featureIds: ["admin-requests", "support", "account"]
  },
  {
    id: "public-page-discoverability",
    version: "2026.09.15.5",
    date: "2026-09-15",
    summary: "Find useful public pages through clear titles and stable links.",
    added: [
      "Search guidance for current public church pages, published public events and eligible public conversations."
    ],
    improved: [
      "Public page details and previews follow the current source. Private pages, drafts and member profiles remain excluded from search indexing.",
      "Church and event details describe supplied facts without inventing a building, venue or verified affiliation."
    ],
    fixed: [
      "Public church, event and topic tabs identify God’s Churches, and sources without a description receive useful public guidance.",
      "Official church pages receive the same public preview support as community listings. A community-listing label describes provenance, not privacy.",
      "Paginated public directories retain their own addresses, while tracking and private filters do not create duplicate indexable pages."
    ],
    featureIds: ["public-search-pages", "sharing"]
  },
  {
    id: "onboarding-church-welcome",
    version: "2026.09.15.4",
    date: "2026-09-15",
    summary: "Get started at your pace and find your next church action.",
    added: [
      "Resume optional getting-started hints, church requests and private setup drafts from Home or Help.",
      "See your church’s current Start here post, next events, notices and serving opportunities in This week.",
      "Label church introductions and questions; explicitly delegated welcome hosts can handle follow-up and review current participation totals."
    ],
    improved: [
      "Completed profile and church steps disappear from the short guide. Optional hints can be saved for later and restored.",
      "The compact Home panel and post label controls load their data when opened. Current source permissions and account checks protect each read and save."
    ],
    fixed: [],
    featureIds: [
      "getting-started",
      "church-this-week",
      "church-welcome-hosts",
      "church-welcome",
      "discovery-feeds"
    ]
  },
  {
    id: "public-sharing-cards",
    version: "2026.09.15.3",
    date: "2026-09-15",
    summary: "Public links now have clear, branded preview images.",
    added: [
      "God’s Churches cards for eligible public posts, churches, events and topics, with current public titles and short descriptions."
    ],
    improved: [
      "The brand and website address remain readable in wide and square preview crops.",
      "Private, unavailable and unsupported-image previews use safe generic branding."
    ],
    fixed: [
      "Plain repost previews point to the original post, matching Copy and Share; posts with your added thoughts keep their own address.",
      "Previously shared image addresses recheck current access after source changes and during image generation. Other apps may retain previews they already copied."
    ],
    featureIds: ["sharing"]
  },
  {
    id: "complete-notification-choices",
    version: "2026.09.15.2",
    date: "2026-09-15",
    summary:
      "Choose the activity that reaches you and schedule future church posts.",
    added: [
      "Private new-post bells for people and churches, separate from Follow and phone permission.",
      "Independent Activity and phone choices for reactions, prayer acknowledgments, church roles and connections, event responses and volunteer commitments.",
      "Future church publication with editable drafts, explicit time zones, rescheduling and cancellation."
    ],
    improved: [
      "Related activity is grouped with generic phone previews and current access checks when an alert opens.",
      "Quiet hours, exact retries, private exports and recovery protection apply to the expanded choices."
    ],
    fixed: [
      "Turning on a new bell, phone category or device cannot send older activity.",
      "Interrupted notification batches resume without duplicate recipients; canceled or outdated publication plans cannot publish.",
      "Restored schedules require review, and optional alert choices never change church permissions or hide canonical operational outcomes."
    ],
    featureIds: [
      "author-bells",
      "scheduled-church-posts",
      "personal-activity",
      "phone-notifications",
      "drafts"
    ]
  },
  {
    id: "explicit-discovery-feeds",
    version: "2026.09.15.1",
    date: "2026-09-15",
    summary:
      "Choose discovery feeds, save private preferences and understand why posts appear.",
    added: [
      "For You, Following, Your Church, Churches, Local, Public and private Favorites alongside the four existing feeds.",
      "Exact filters, strict or explicitly expanded presets, readable ranking reasons, More/Less topic choices and editable hidden words or topics.",
      "Optional author-selected language, tradition and broad locality, with explicit location-sharing consent and private draft support."
    ],
    improved: [
      "Reading sets stay in place until you refresh, with finite paging, clear empty states and an optional browser-only break reminder.",
      "Town lookup uses compressed public data without GPS, personal addresses or an external location service."
    ],
    fixed: [
      "Streamed page reloads preserve the shared shell, appearance controls and feed choices.",
      "Feed choices wait until the page is ready, so a first selection during slower loading is not silently lost.",
      "Private settings, draft publication and classification edits preserve exact retries and current-account checks.",
      "Unreadable guest choices require an explicit reset; withdrawal, erasure and protected recovery prevent older public classifications from returning."
    ],
    featureIds: ["discovery-feeds", "post-discovery", "reader", "drafts"]
  },
  {
    id: "public-topic-communities",
    version: "2026.09.14.18",
    date: "2026-09-14",
    summary:
      "Discover public topic communities, join their discussions and follow the topics you care about.",
    added: [
      "Public topic pages, community rules, topic creation and a private Topics I follow stream.",
      "Owners can offer moderator roles or ownership for explicit acceptance, review scoped reports and manage participation restrictions."
    ],
    improved: [
      "Topic discussions use the existing post composer, comments, prayer, sharing and report review.",
      "Current rules and a public-post confirmation make participation choices clear; private exports and protected recovery include topic choices."
    ],
    fixed: [
      "Topic changes preserve exact retries and current-account permissions. Revoked roles, hidden topics and restricted authors cannot be restored by stale forms or older recovery copies."
    ],
    featureIds: [
      "topic-communities",
      "sharing",
      "report-review",
      "prayer-follow-up"
    ]
  },
  {
    id: "prayer-private-follow-up",
    version: "2026.09.14.17",
    date: "2026-09-14",
    summary:
      "Pray on posts and comments, save private follow-ups and receive author updates.",
    added: [
      "A first-use prayer guide, I prayed with undo and optional name sharing, and your private prayer list.",
      "Authors can share requests, updates, praise reports and completed follow-ups in the original discussion."
    ],
    improved: [
      "Choose Activity updates for each saved prayer, with separate optional phone alerts.",
      "Hide Like and prayer counts in Appearance and reading without hiding their controls."
    ],
    fixed: [
      "Interrupted prayer actions retain the same retry. Source access changes hide private details, while same-account unsent author text remains available to review or discard."
    ],
    featureIds: [
      "prayer-follow-up",
      "personal-activity",
      "phone-notifications",
      "settings"
    ]
  },
  {
    id: "followed-conversation-activity",
    version: "2026.09.14.16",
    date: "2026-09-14",
    summary: "Follow a conversation to see its new replies in Activity.",
    added: [
      "A separate, optional phone-alert choice for replies in conversations you follow."
    ],
    improved: [
      "Follow, Default and Mute explain which conversation updates you receive."
    ],
    fixed: [
      "Delayed replies respect current access and consent, without replaying old replies after a later follow or phone opt-in."
    ],
    featureIds: [
      "follow-conversation",
      "personal-activity",
      "phone-notifications"
    ]
  },
  {
    id: "personal-profile-pin",
    version: "2026.09.14.15",
    date: "2026-09-14",
    summary: "Pin one of your posts to the top of your personal profile.",
    added: ["Pin, replace or unpin an existing post from its owner menu."],
    improved: [
      "Visitors with current access see the same post once, with its original Likes, comments and timestamp."
    ],
    fixed: [
      "Profile placement preserves post audiences, source access and your existing introduction. Unconfirmed choices retain the same retry."
    ],
    featureIds: ["profile-post-pin", "profile"]
  },
  {
    id: "four-community-feeds",
    version: "2026.09.14.14",
    date: "2026-09-14",
    summary:
      "Choose Latest, Friends, Top This Week or Trending in Home and My feed.",
    added: [
      "A saved feed choice for your account, with separate guest choices."
    ],
    improved: [
      "Ranked pages keep their order while you read. Refresh posts starts a new set with current Likes."
    ],
    fixed: [
      "Friends shows accepted mutual friendships only and rechecks access when you return. Feed changes protect unsent entries."
    ],
    featureIds: ["reader"]
  },
  {
    id: "reasoned-discussion-moderation",
    version: "2026.09.14.13",
    date: "2026-09-14",
    summary:
      "Church moderation changes explain why a discussion’s settings changed.",
    added: [
      "Authorized post managers can review the latest ten discussion moderation decisions."
    ],
    improved: [
      "Church moderators choose a reason when changing reply settings. Existing author controls and exact request retries are preserved."
    ],
    fixed: [
      "Discussion changes made through church moderation permission now record a reason and the previous and updated settings."
    ],
    featureIds: ["posts"]
  },
  {
    id: "current-reader-privacy",
    version: "2026.09.14.12",
    date: "2026-09-14",
    summary:
      "Open readers recheck current post and profile access when you return.",
    added: [],
    improved: [
      "Post readers check current visibility and permitted counts together. Member profiles conceal retained details until current access is confirmed."
    ],
    fixed: [
      "A hidden or newly private post no longer remains visible in an open feed after you return. Comment drafts stay available to their owner while source access is checked."
    ],
    featureIds: ["posts", "profile"]
  },
  {
    id: "fair-community-activity",
    version: "2026.09.14.11",
    date: "2026-09-14",
    summary:
      "Clearer waiting messages help keep community activity manageable.",
    added: [
      "Posting, commenting and following have account-based activity limits with a waiting time when reached."
    ],
    improved: [
      "Private drafts and existing relationship choices remain available while waiting. People sharing church Wi-Fi have separate activity allowances."
    ],
    fixed: [
      "Confirming a saved request does not use another activity allowance. A changed publishing request cannot reuse an earlier request key."
    ],
    featureIds: ["posts", "drafts"]
  },
  {
    id: "author-content-notes",
    version: "2026.09.14.10",
    date: "2026-09-14",
    summary:
      "Authors can add a content note and choose a safe preview for a post.",
    added: [
      "Optional content notes and safe excerpts are available in new posts, private drafts and Edit post."
    ],
    improved: [
      "Posts with a content note show the chosen excerpt in feeds and repost previews. Open the post to read the full text. Search, saved items and public sharing respect the same choices and current audience."
    ],
    fixed: [
      "Published post changes preserve an interrupted request for confirmation and protect unsaved entries when leaving or switching accounts. Full post text rechecks current access when you return."
    ],
    featureIds: ["posts", "drafts", "saved"]
  },
  {
    id: "reviewed-account-access",
    version: "2026.09.14.9",
    date: "2026-09-14",
    summary:
      "Account access decisions have clearer reasons and safer recovery.",
    added: [
      "Authorized account operators can review recent access decisions and their recorded reasons."
    ],
    improved: [
      "Suspending or restoring an account requires a reason and explicit confirmation. Restoring access still requires a new sign-in and leaves prior sharing and permissions ended."
    ],
    fixed: [
      "An interrupted account access change can be confirmed without repeating it. Switching accounts requires a fresh review before continuing."
    ],
    featureIds: ["settings", "support"]
  },
  {
    id: "responsive-community-actions",
    version: "2026.09.14.8",
    date: "2026-09-14",
    summary: "Comments and Likes can proceed while others are reading.",
    added: [],
    improved: [
      "Posting a reply or changing a Like no longer waits for unrelated reading across the community."
    ],
    fixed: [
      "Concurrent replies and repeated submissions preserve one saved result, with existing account and privacy protections."
    ],
    featureIds: ["posts", "comments"]
  },
  {
    id: "community-reliability",
    version: "2026.09.14.7",
    date: "2026-09-14",
    summary:
      "Busy community feeds and shared-network photo updates work more efficiently.",
    added: [],
    improved: [
      "More people can update photos on shared church Wi-Fi while individual account protections remain in place.",
      "Removed photo files can be cleared in larger batches after their existing waiting period.",
      "Home finds recent posts more efficiently in larger communities.",
      "Home loads a small comment preview without retrieving the entire conversation."
    ],
    fixed: [
      "Service checks make delayed background work easier to detect without exposing personal details."
    ],
    featureIds: ["profile-photos"]
  },
  {
    id: "avatar-startup",
    version: "2026.09.14.6",
    date: "2026-09-14",
    summary: "Profile pictures load with fewer waiting steps.",
    added: [],
    improved: [
      "Profile pictures on posts, comments and messages appear with less waiting.",
      "Returning to the app avoids repeated loading of the same profile picture."
    ],
    fixed: [
      "Old picture responses stay hidden after account, access or current-picture changes."
    ],
    featureIds: ["profile-photos"]
  },
  {
    id: "related-settings-access",
    version: "2026.09.14.5",
    date: "2026-09-14",
    summary: "Related directory settings follow your current church access.",
    added: [],
    improved: [
      "The directory shortcut appears only with a current approved church connection. Other personal settings stay available."
    ],
    fixed: [
      "Accounts without an approved church connection no longer get a related shortcut into a restricted directory-sharing page."
    ],
    featureIds: ["settings"]
  },
  {
    id: "related-settings",
    version: "2026.09.14.4",
    date: "2026-09-14",
    summary:
      "Find related privacy, sharing and notification choices in Settings.",
    added: [
      "Related personal settings connect Profile, Privacy, My church, Calendar, Notifications and Safety to existing working controls."
    ],
    improved: [
      "Each shortcut keeps the original control and current account protections. Church directory and calendar sharing still require deliberate choices."
    ],
    fixed: [
      "The account deactivation explanation now correctly distinguishes the separate permanent-deletion review.",
      "Phone navigation keeps whole words readable with enlarged text."
    ],
    featureIds: ["settings"]
  },
  {
    id: "gods-churches-header",
    version: "2026.09.14.3",
    date: "2026-09-14",
    summary: "God’s Churches, clearly named at the top of every page.",
    added: [],
    improved: [
      "Public, account and demo headers show God’s Churches, with matching accessible link names and page-title branding."
    ],
    fixed: [
      "The brand includes its apostrophe, space and capital C. Home links keep their existing destinations."
    ],
    featureIds: ["account"]
  },
  {
    id: "signup-before-installation",
    version: "2026.09.14.2",
    date: "2026-09-14",
    summary:
      "Create your account first; keep the app handy when you are ready.",
    added: [
      "New accounts get optional Install the app, How to bookmark this page and Continue in browser choices after signing in. Bookmark help also stays in Menu."
    ],
    improved: [
      "Personal QR links open the signup form directly, with inviter context, an existing-account sign-in route and a choice to join without connecting."
    ],
    fixed: [
      "Installation no longer appears before personal QR signup. Saved app links use the clean home address, while verification, invitation consent and existing friendships keep their current protections."
    ],
    featureIds: ["friend-invitations", "installation", "account"]
  },
  {
    id: "exploring-faith",
    version: "2026.09.14.1",
    date: "2026-09-14",
    summary: "A welcoming, private Exploring Faith choice.",
    added: [
      "Choose Exploring Faith when creating your account: I’m learning about Christianity and figuring out what I believe."
    ],
    improved: [
      "Change your participation choice later in Edit profile, with protection against conflicting saves."
    ],
    fixed: [
      "Exploring Faith stays private to your account and is not shown as a profile or author badge. Existing verification, invitation consent and church permissions remain in place."
    ],
    featureIds: ["participation-choice", "account"]
  },
  {
    id: "content-decisions-and-reconsideration",
    version: "2026.09.13.32",
    date: "2026-09-13",
    summary: "Private content decisions and a clear reconsideration route.",
    added: [
      "Authors can read a safe decision explanation from Your reports or Activity, then deliberately request reconsideration from the assigned reviewer."
    ],
    improved: [
      "Authorized reviewers can request correction, hide, remove or restore the selected post or comment while preserving its audience and reply permissions."
    ],
    fixed: [
      "Reported text stays available only to authorized review for its existing retention period after author removal. Backup recovery preserves removals and pauses for review when it cannot prove a later restoration.",
      "Read-only demos no longer make an unnecessary account-information request.",
      "Signing in from a content-decision link returns to that decision."
    ],
    featureIds: [
      "report-review",
      "content-decisions",
      "private-reports",
      "personal-activity"
    ]
  },
  {
    id: "personal-activity",
    version: "2026.09.13.31",
    date: "2026-09-13",
    summary: "A personal Activity view with clear read controls.",
    added: [
      "Open Activity from Menu or Messages to see grouped updates, categories, timestamps and unread counts."
    ],
    improved: [
      "Mark a group or all loaded activity read while keeping later arrivals unread. Lost confirmations offer an exact retry, and unavailable sources keep private details hidden."
    ],
    fixed: [
      "Reading an update cancels its optional phone alert if delivery has not started."
    ],
    featureIds: ["personal-activity", "phone-notifications", "private-messages"]
  },
  {
    id: "photo-cleanup-recovery",
    version: "2026.09.13.30",
    date: "2026-09-13",
    summary: "Photo cleanup recovers after an interrupted save.",
    added: [],
    improved: [],
    fixed: [
      "A lost save confirmation can no longer leave saved photos blocking cleanup of failed uploads. Retained photos stay intact."
    ],
    featureIds: ["photo-library", "profile-photos", "post-photo-management"]
  },
  {
    id: "reply-and-mention-phone-alerts",
    version: "2026.09.13.29",
    date: "2026-09-13",
    summary: "Comment phone alerts and a welcome for new members.",
    added: [
      "Choose separate phone alerts for replies to your personal posts and comments, and for selected mentions.",
      "Eligible new accounts receive the founder welcome after setup and required verification, with a deliberate Reply action into the same private conversation."
    ],
    improved: [
      "Comment alerts respect quiet hours, conversation mute, current source access and your phone choices. Tapping an available alert opens its exact comment."
    ],
    fixed: [
      "A reply that also mentions you creates one alert intent. Edits and retries do not backfill old alerts, and your account export includes saved notification and quiet-hour choices."
    ],
    featureIds: ["phone-notifications", "founder-welcome", "private-messages"]
  },
  {
    id: "bounded-community-feed",
    version: "2026.09.13.28",
    date: "2026-09-13",
    summary: "More efficient community feeds as conversations grow.",
    added: [],
    improved: [
      "Feed pages count replies, Likes and photos only for the selected posts, reducing repeated work on larger communities."
    ],
    fixed: [
      "The feed keeps its current audience checks, reply permissions, stable page order and private-source restrictions."
    ],
    featureIds: ["reader"]
  },
  {
    id: "private-message-and-notification-controls",
    version: "2026.09.13.27",
    date: "2026-09-13",
    summary:
      "Phone notification controls, permanent account closure and clearer private-message retention.",
    added: [
      "Notification settings include deliberate device opt-in, a recipient-initiated test, quiet hours and separate founder-announcement preferences.",
      "Permanent account closure explains immediate access loss, shared-message exceptions and removal deadlines before confirmation."
    ],
    improved: [
      "Private messaging now has protected retention and restore procedures. Privacy information explains selected report evidence, founder review and recovery-copy expiry.",
      "The founder welcome, explicit replies, inbox filters and deliberate announcement controls are prepared. Welcomes and new messaging remain paused until founder reviewer access is verified."
    ],
    fixed: [
      "Account switching revokes old phone associations, and notification links recheck the signed-in account before opening private content.",
      "Retry and restore records prevent deleted messages, queued welcomes and old device permissions from being revived."
    ],
    featureIds: [
      "phone-notifications",
      "data-controls",
      "private-messages",
      "founder-welcome"
    ]
  },
  {
    id: "scoped-report-review",
    version: "2026.09.13.26",
    date: "2026-09-13",
    summary:
      "A private report queue for authorized reviewers, with recoverable decisions.",
    added: [
      "Authorized reviewers can browse open and closed cases, inspect only the selected source and record a private review reason."
    ],
    improved: [
      "Case access is checked before pagination and every decision. Changed sources are labeled as current text; no extra evidence copy is stored."
    ],
    fixed: [
      "Unconfirmed decisions preserve the same retry even if review access is revoked. Case details stay concealed until current access is checked again."
    ],
    featureIds: ["report-review", "private-reports"]
  },

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
