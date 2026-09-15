# Public route metadata inventory

## Current candidate — September 15, 2026 UTC

Enumerated directly from the current checkout: **108 page routes**, with
**16 public candidate patterns** and **92 excluded patterns**.
Dynamic patterns are conditional on current source eligibility, not counts of
indexable records. The ten admin patterns include the current private Growth report candidate. The table is a source inventory; exact live serving identity
and acceptance belong in [the current discoverability report](PUBLIC_DISCOVERABILITY_ACCEPTANCE.md).

All public identities use the approved HTTPS host. Preview environments are
noindex and return an empty sitemap. Private platform/API cache and referrer
headers are retained. Public candidate HTML gets its final index directive from
current anonymous eligibility, even for authenticated requests. Accounts, admin,
profiles, tokens, private church tools, search and owned filters remain excluded.
Canonical fields below never preserve tracking or private query values.

The root is a 307 redirect to Home. `/robots.txt` permits reading noindex
responses and advertises `/sitemap.xml`; that same XML route serves the bounded
index and its typed children. These resource routes are not page patterns below.
Current-public reads and no-store responses govern source withdrawal, narrowed
audiences and deleted media. Externally copied search results/cards can remain
until the external service refreshes; no remote-erasure claim is made.

| Route | Source | Eligibility | Title/description ownership | Canonical/index rule | Sitemap, structured data and preview |
| --- | --- | --- | --- | --- | --- |
| `/about` | [page.tsx](../../app/about/page.tsx) | Public information | About \| God’s Churches; Why Godschurches exists, what you can use today, and how to get started. | /about | Static sitemap; branded default card |
| `/admin/analytics` | [page.tsx](../../app/admin/analytics/page.tsx) | Excluded | Inherited layout metadata; existing private/generic copy | No indexed identity; token/filter parameters never enter sitemap | No sitemap or JSON-LD; existing access and preview protections |
| `/admin/waitlist` | [page.tsx](../../app/admin/waitlist/page.tsx) | Excluded | Inherited layout metadata; existing private/generic copy | No indexed identity; token/filter parameters never enter sitemap | No sitemap or JSON-LD; existing access and preview protections |
| `/for-businesses` | [page.tsx](../../app/for-businesses/page.tsx) | Public information | For businesses \| God’s Churches; The Godschurches vision for practical service and community relationships. | /for-businesses | Static sitemap; branded default card |
| `/for-churches` | [page.tsx](../../app/for-churches/page.tsx) | Public information | For churches and pastors \| God’s Churches; Understand church connections and the vision for local church tools. | /for-churches | Static sitemap; branded default card |
| `/for-creators` | [page.tsx](../../app/for-creators/page.tsx) | Public information | For creators and preachers \| God’s Churches; Share written teaching, testimony, and encouragement on Godschurches. | /for-creators | Static sitemap; branded default card |
| `/for-users` | [page.tsx](../../app/for-users/page.tsx) | Public information | For believers \| God’s Churches; Share encouragement and connect with people growing in faith. | /for-users | Static sitemap; branded default card |
| `/help` | [page.tsx](../../app/help/page.tsx) | Public information | Help \| God’s Churches; Get started, sign in, and understand public content and church access on Godschurches. | /help | Static sitemap; branded default card |
| `/manifesto` | [page.tsx](../../app/manifesto/page.tsx) | Public information | Manifesto \| God’s Churches; The convictions and long-term vision behind Godschurches and The Revival. | /manifesto | Static sitemap; branded default card |
| `/platform/admin` | [page.tsx](../../app/platform/admin/page.tsx) | Current explicit operator or scoped reviewer permission | Static private admin title; no case text in metadata | Noindex/nofollow; no indexed identity | No sitemap or public JSON-LD; server permission and no-store checks |
| `/platform/admin/access` | [page.tsx](../../app/platform/admin/access/page.tsx) | Current explicit operator or scoped reviewer permission | Static private admin title; no case text in metadata | Noindex/nofollow; no indexed identity | No sitemap or public JSON-LD; server permission and no-store checks |
| `/platform/admin/audit` | [page.tsx](../../app/platform/admin/audit/page.tsx) | Current explicit operator or scoped reviewer permission | Static private admin title; no case text in metadata | Noindex/nofollow; no indexed identity | No sitemap or public JSON-LD; server permission and no-store checks |
| `/platform/admin/cases/[sourceType]/[sourceId]` | [page.tsx](../../app/platform/admin/cases/[sourceType]/[sourceId]/page.tsx) | Current explicit operator or scoped reviewer permission | Static private admin title; no case text in metadata | Noindex/nofollow; no indexed identity | No sitemap or public JSON-LD; server permission and no-store checks |
| `/platform/admin/churches` | [page.tsx](../../app/platform/admin/churches/page.tsx) | Current explicit operator or scoped reviewer permission | Static private admin title; no case text in metadata | Noindex/nofollow; no indexed identity | No sitemap or public JSON-LD; server permission and no-store checks |
| `/platform/admin/feedback` | [page.tsx](../../app/platform/admin/feedback/page.tsx) | Current explicit operator or scoped reviewer permission | Static private admin title; no case text in metadata | Noindex/nofollow; no indexed identity | No sitemap or public JSON-LD; server permission and no-store checks |
| `/platform/admin/health` | [page.tsx](../../app/platform/admin/health/page.tsx) | Current explicit operator or scoped reviewer permission | Static private admin title; no case text in metadata | Noindex/nofollow; no indexed identity | No sitemap or public JSON-LD; server permission and no-store checks |
| `/platform/admin/growth` | [page.tsx](../../app/platform/admin/growth/page.tsx) | Current explicit aggregate metric permission; exports separately gated | Static private report title; no account/case data in metadata | Noindex/nofollow; no indexed identity | No sitemap or public JSON-LD; current permission and no-store checks |
| `/platform/admin/people` | [page.tsx](../../app/platform/admin/people/page.tsx) | Current explicit operator or scoped reviewer permission | Static private admin title; no case text in metadata | Noindex/nofollow; no indexed identity | No sitemap or public JSON-LD; server permission and no-store checks |
| `/platform/admin/requests` | [page.tsx](../../app/platform/admin/requests/page.tsx) | Current explicit operator or scoped reviewer permission | Static private admin title; no case text in metadata | Noindex/nofollow; no indexed identity | No sitemap or public JSON-LD; server permission and no-store checks |
| `/platform/account/change-email` | [page.tsx](../../app/platform/account/change-email/page.tsx) | Excluded | Local static metadata; existing private/generic copy | No indexed identity; token/filter parameters never enter sitemap | No sitemap or JSON-LD; existing access and preview protections |
| `/platform/account/deletion` | [page.tsx](../../app/platform/account/deletion/page.tsx) | Excluded | Local static metadata; existing private/generic copy | No indexed identity; token/filter parameters never enter sitemap | No sitemap or JSON-LD; existing access and preview protections |
| `/platform/account/google` | [page.tsx](../../app/platform/account/google/page.tsx) | Excluded | Local static metadata; existing private/generic copy | No indexed identity; token/filter parameters never enter sitemap | No sitemap or JSON-LD; existing access and preview protections |
| `/platform/account/reactivate` | [page.tsx](../../app/platform/account/reactivate/page.tsx) | Excluded | Local static metadata; existing private/generic copy | No indexed identity; token/filter parameters never enter sitemap | No sitemap or JSON-LD; existing access and preview protections |
| `/platform/account/recover` | [page.tsx](../../app/platform/account/recover/page.tsx) | Excluded | Local static metadata; existing private/generic copy | No indexed identity; token/filter parameters never enter sitemap | No sitemap or JSON-LD; existing access and preview protections |
| `/platform/account/verify` | [page.tsx](../../app/platform/account/verify/page.tsx) | Excluded | Local static metadata; existing private/generic copy | No indexed identity; token/filter parameters never enter sitemap | No sitemap or JSON-LD; existing access and preview protections |
| `/platform/activity` | [page.tsx](../../app/platform/activity/page.tsx) | Excluded | Local static metadata; existing private/generic copy | No indexed identity; token/filter parameters never enter sitemap | No sitemap or JSON-LD; existing access and preview protections |
| `/platform/calendars/[id]` | [page.tsx](../../app/platform/calendars/[id]/page.tsx) | Excluded | Local static metadata; existing private/generic copy | No indexed identity; token/filter parameters never enter sitemap | No sitemap or JSON-LD; existing access and preview protections |
| `/platform/calendars` | [page.tsx](../../app/platform/calendars/page.tsx) | Excluded | Local static metadata; existing private/generic copy | No indexed identity; token/filter parameters never enter sitemap | No sitemap or JSON-LD; existing access and preview protections |
| `/platform/church-claims/[id]` | [page.tsx](../../app/platform/church-claims/[id]/page.tsx) | Excluded | Local static metadata; existing private/generic copy | No indexed identity; token/filter parameters never enter sitemap | No sitemap or JSON-LD; existing access and preview protections |
| `/platform/church-claims/new` | [page.tsx](../../app/platform/church-claims/new/page.tsx) | Excluded | Local static metadata; existing private/generic copy | No indexed identity; token/filter parameters never enter sitemap | No sitemap or JSON-LD; existing access and preview protections |
| `/platform/church-claims` | [page.tsx](../../app/platform/church-claims/page.tsx) | Excluded | Local static metadata; existing private/generic copy | No indexed identity; token/filter parameters never enter sitemap | No sitemap or JSON-LD; existing access and preview protections |
| `/platform/church-claims/review/[id]` | [page.tsx](../../app/platform/church-claims/review/[id]/page.tsx) | Excluded | Local static metadata; existing private/generic copy | No indexed identity; token/filter parameters never enter sitemap | No sitemap or JSON-LD; existing access and preview protections |
| `/platform/church-claims/review` | [page.tsx](../../app/platform/church-claims/review/page.tsx) | Excluded | Local static metadata; existing private/generic copy | No indexed identity; token/filter parameters never enter sitemap | No sitemap or JSON-LD; existing access and preview protections |
| `/platform/church-listings/[id]` | [page.tsx](../../app/platform/church-listings/[id]/page.tsx) | Excluded | Local static metadata; existing private/generic copy | No indexed identity; token/filter parameters never enter sitemap | No sitemap or JSON-LD; existing access and preview protections |
| `/platform/church-listings/new` | [page.tsx](../../app/platform/church-listings/new/page.tsx) | Excluded | Local static metadata; existing private/generic copy | No indexed identity; token/filter parameters never enter sitemap | No sitemap or JSON-LD; existing access and preview protections |
| `/platform/church-listings` | [page.tsx](../../app/platform/church-listings/page.tsx) | Excluded | Local static metadata; existing private/generic copy | No indexed identity; token/filter parameters never enter sitemap | No sitemap or JSON-LD; existing access and preview protections |
| `/platform/churches/[churchId]/access` | [page.tsx](../../app/platform/churches/[churchId]/access/page.tsx) | Excluded | Local static metadata; existing private/generic copy | No indexed identity; token/filter parameters never enter sitemap | No sitemap or JSON-LD; existing access and preview protections |
| `/platform/churches/[churchId]/calendar` | [page.tsx](../../app/platform/churches/[churchId]/calendar/page.tsx) | Excluded | Local static metadata; existing private/generic copy | No indexed identity; token/filter parameters never enter sitemap | No sitemap or JSON-LD; existing access and preview protections |
| `/platform/churches/[churchId]/directory` | [page.tsx](../../app/platform/churches/[churchId]/directory/page.tsx) | Excluded | Local static metadata; existing private/generic copy | No indexed identity; token/filter parameters never enter sitemap | No sitemap or JSON-LD; existing access and preview protections |
| `/platform/churches/[churchId]/overview` | [page.tsx](../../app/platform/churches/[churchId]/overview/page.tsx) | Excluded | Local static metadata; existing private/generic copy | No indexed identity; token/filter parameters never enter sitemap | No sitemap or JSON-LD; existing access and preview protections |
| `/platform/churches/[churchId]` | [page.tsx](../../app/platform/churches/[churchId]/page.tsx) | Canonical published church | Actual public name \| God’s Churches; supplied summary or public guidance | Detail or valid compound post continuation | Current source; Organization; current church card |
| `/platform/churches/[churchId]/people/[connectionId]` | [page.tsx](../../app/platform/churches/[churchId]/people/[connectionId]/page.tsx) | Excluded | Local static metadata; existing private/generic copy | No indexed identity; token/filter parameters never enter sitemap | No sitemap or JSON-LD; existing access and preview protections |
| `/platform/churches/[churchId]/responsibilities` | [page.tsx](../../app/platform/churches/[churchId]/responsibilities/page.tsx) | Excluded | Local static metadata; existing private/generic copy | No indexed identity; token/filter parameters never enter sitemap | No sitemap or JSON-LD; existing access and preview protections |
| `/platform/churches/[churchId]/review` | [page.tsx](../../app/platform/churches/[churchId]/review/page.tsx) | Excluded | Local static metadata; existing private/generic copy | No indexed identity; token/filter parameters never enter sitemap | No sitemap or JSON-LD; existing access and preview protections |
| `/platform/churches/[churchId]/structure/[positionId]` | [page.tsx](../../app/platform/churches/[churchId]/structure/[positionId]/page.tsx) | Excluded | Local static metadata; existing private/generic copy | No indexed identity; token/filter parameters never enter sitemap | No sitemap or JSON-LD; existing access and preview protections |
| `/platform/churches/[churchId]/structure/assign` | [page.tsx](../../app/platform/churches/[churchId]/structure/assign/page.tsx) | Excluded | Local static metadata; existing private/generic copy | No indexed identity; token/filter parameters never enter sitemap | No sitemap or JSON-LD; existing access and preview protections |
| `/platform/churches/[churchId]/structure/history` | [page.tsx](../../app/platform/churches/[churchId]/structure/history/page.tsx) | Excluded | Local static metadata; existing private/generic copy | No indexed identity; token/filter parameters never enter sitemap | No sitemap or JSON-LD; existing access and preview protections |
| `/platform/churches/[churchId]/structure/new` | [page.tsx](../../app/platform/churches/[churchId]/structure/new/page.tsx) | Excluded | Local static metadata; existing private/generic copy | No indexed identity; token/filter parameters never enter sitemap | No sitemap or JSON-LD; existing access and preview protections |
| `/platform/churches/[churchId]/structure` | [page.tsx](../../app/platform/churches/[churchId]/structure/page.tsx) | Excluded | Local static metadata; existing private/generic copy | No indexed identity; token/filter parameters never enter sitemap | No sitemap or JSON-LD; existing access and preview protections |
| `/platform/churches/[churchId]/structure/roles` | [page.tsx](../../app/platform/churches/[churchId]/structure/roles/page.tsx) | Excluded | Local static metadata; existing private/generic copy | No indexed identity; token/filter parameters never enter sitemap | No sitemap or JSON-LD; existing access and preview protections |
| `/platform/churches/[churchId]/welcome` | [page.tsx](../../app/platform/churches/[churchId]/welcome/page.tsx) | Excluded | Local static metadata; existing private/generic copy | No indexed identity; token/filter parameters never enter sitemap | No sitemap or JSON-LD; existing access and preview protections |
| `/platform/churches` | [page.tsx](../../app/platform/churches/page.tsx) | Published directory | Find your church; useful supplied public listings | Base or validated continuation; search excluded | Base only when useful; current church cards |
| `/platform/comment-drafts` | [page.tsx](../../app/platform/comment-drafts/page.tsx) | Excluded | Local static metadata; existing private/generic copy | No indexed identity; token/filter parameters never enter sitemap | No sitemap or JSON-LD; existing access and preview protections |
| `/platform/commitments` | [page.tsx](../../app/platform/commitments/page.tsx) | Excluded | Local static metadata; existing private/generic copy | No indexed identity; token/filter parameters never enter sitemap | No sitemap or JSON-LD; existing access and preview protections |
| `/platform/demo/[view]` | [page.tsx](../../app/platform/demo/[view]/page.tsx) | Excluded | Local generated metadata; existing private/generic copy | No indexed identity; token/filter parameters never enter sitemap | No sitemap or JSON-LD; existing access and preview protections |
| `/platform/demo` | [page.tsx](../../app/platform/demo/page.tsx) | Excluded | Inherited layout metadata; existing private/generic copy | No indexed identity; token/filter parameters never enter sitemap | No sitemap or JSON-LD; existing access and preview protections |
| `/platform/drafts` | [page.tsx](../../app/platform/drafts/page.tsx) | Excluded | Local static metadata; existing private/generic copy | No indexed identity; token/filter parameters never enter sitemap | No sitemap or JSON-LD; existing access and preview protections |
| `/platform/events/[id]` | [page.tsx](../../app/platform/events/[id]/page.tsx) | Current public church occurrence | Current public title \| God’s Churches; supplied description or public guidance | Occurrence; valid time-zone display canonicalizes; invalid excluded | Uncanceled/unarchived source; Event; current event card |
| `/platform/features` | [page.tsx](../../app/platform/features/page.tsx) | Excluded | Local static metadata; existing private/generic copy | No indexed identity; token/filter parameters never enter sitemap | No sitemap or JSON-LD; existing access and preview protections |
| `/platform/feed` | [page.tsx](../../app/platform/feed/page.tsx) | Excluded | Local static metadata; existing private/generic copy | No indexed identity; token/filter parameters never enter sitemap | No sitemap or JSON-LD; existing access and preview protections |
| `/platform/getting-started` | [page.tsx](../../app/platform/getting-started/page.tsx) | Excluded | Local static metadata; existing private/generic copy | No indexed identity; token/filter parameters never enter sitemap | No sitemap or JSON-LD; existing access and preview protections |
| `/platform/help/cases/[caseId]` | [page.tsx](../../app/platform/help/cases/[caseId]/page.tsx) | Excluded | Local static metadata; existing private/generic copy | No indexed identity; token/filter parameters never enter sitemap | No sitemap or JSON-LD; existing access and preview protections |
| `/platform/help/inbox` | [page.tsx](../../app/platform/help/inbox/page.tsx) | Excluded | Local static metadata; existing private/generic copy | No indexed identity; token/filter parameters never enter sitemap | No sitemap or JSON-LD; existing access and preview protections |
| `/platform/help/new` | [page.tsx](../../app/platform/help/new/page.tsx) | Excluded | Local static metadata; existing private/generic copy | No indexed identity; token/filter parameters never enter sitemap | No sitemap or JSON-LD; existing access and preview protections |
| `/platform/help` | [page.tsx](../../app/platform/help/page.tsx) | Excluded | Local static metadata; existing private/generic copy | No indexed identity; token/filter parameters never enter sitemap | No sitemap or JSON-LD; existing access and preview protections |
| `/platform/help/requests` | [page.tsx](../../app/platform/help/requests/page.tsx) | Excluded | Local static metadata; existing private/generic copy | No indexed identity; token/filter parameters never enter sitemap | No sitemap or JSON-LD; existing access and preview protections |
| `/platform/help/routing` | [page.tsx](../../app/platform/help/routing/page.tsx) | Excluded | Local static metadata; existing private/generic copy | No indexed identity; token/filter parameters never enter sitemap | No sitemap or JSON-LD; existing access and preview protections |
| `/platform/invitations` | [page.tsx](../../app/platform/invitations/page.tsx) | Excluded | Local static metadata; existing private/generic copy | No indexed identity; token/filter parameters never enter sitemap | No sitemap or JSON-LD; existing access and preview protections |
| `/platform/invite/[code]` | [page.tsx](../../app/platform/invite/[code]/page.tsx) | Excluded | Local static metadata; existing private/generic copy | No indexed identity; token/filter parameters never enter sitemap | No sitemap or JSON-LD; existing access and preview protections |
| `/platform/join` | [page.tsx](../../app/platform/join/page.tsx) | Excluded | Local generated metadata; existing private/generic copy | No indexed identity; token/filter parameters never enter sitemap | No sitemap or JSON-LD; existing access and preview protections |
| `/platform/login` | [page.tsx](../../app/platform/login/page.tsx) | Excluded | Local static metadata; existing private/generic copy | No indexed identity; token/filter parameters never enter sitemap | No sitemap or JSON-LD; existing access and preview protections |
| `/platform/menu` | [page.tsx](../../app/platform/menu/page.tsx) | Excluded | Local static metadata; existing private/generic copy | No indexed identity; token/filter parameters never enter sitemap | No sitemap or JSON-LD; existing access and preview protections |
| `/platform/messages/[conversationId]` | [page.tsx](../../app/platform/messages/[conversationId]/page.tsx) | Excluded | Local static metadata; existing private/generic copy | No indexed identity; token/filter parameters never enter sitemap | No sitemap or JSON-LD; existing access and preview protections |
| `/platform/messages/announcements` | [page.tsx](../../app/platform/messages/announcements/page.tsx) | Excluded | Local static metadata; existing private/generic copy | No indexed identity; token/filter parameters never enter sitemap | No sitemap or JSON-LD; existing access and preview protections |
| `/platform/messages` | [page.tsx](../../app/platform/messages/page.tsx) | Excluded | Local static metadata; existing private/generic copy | No indexed identity; token/filter parameters never enter sitemap | No sitemap or JSON-LD; existing access and preview protections |
| `/platform/messages/requests` | [page.tsx](../../app/platform/messages/requests/page.tsx) | Excluded | Local static metadata; existing private/generic copy | No indexed identity; token/filter parameters never enter sitemap | No sitemap or JSON-LD; existing access and preview protections |
| `/platform/my-church` | [page.tsx](../../app/platform/my-church/page.tsx) | Excluded | Local static metadata; existing private/generic copy | No indexed identity; token/filter parameters never enter sitemap | No sitemap or JSON-LD; existing access and preview protections |
| `/platform/my-church/sharing` | [page.tsx](../../app/platform/my-church/sharing/page.tsx) | Excluded | Local static metadata; existing private/generic copy | No indexed identity; token/filter parameters never enter sitemap | No sitemap or JSON-LD; existing access and preview protections |
| `/platform/notifications/[id]` | [page.tsx](../../app/platform/notifications/[id]/page.tsx) | Excluded | Local static metadata; existing private/generic copy | No indexed identity; token/filter parameters never enter sitemap | No sitemap or JSON-LD; existing access and preview protections |
| `/platform/operator/churches` | [page.tsx](../../app/platform/operator/churches/page.tsx) | Excluded | Local static metadata; existing private/generic copy | No indexed identity; token/filter parameters never enter sitemap | No sitemap or JSON-LD; existing access and preview protections |
| `/platform/operator/listings/[id]` | [page.tsx](../../app/platform/operator/listings/[id]/page.tsx) | Excluded | Local static metadata; existing private/generic copy | No indexed identity; token/filter parameters never enter sitemap | No sitemap or JSON-LD; existing access and preview protections |
| `/platform/operator/listings` | [page.tsx](../../app/platform/operator/listings/page.tsx) | Excluded | Local static metadata; existing private/generic copy | No indexed identity; token/filter parameters never enter sitemap | No sitemap or JSON-LD; existing access and preview protections |
| `/platform` | [page.tsx](../../app/platform/page.tsx) | Home | Home \| God’s Churches; current community description | /platform; filtered views excluded | Home; WebSite; branded default card |
| `/platform/posts/[postId]` | [page.tsx](../../app/platform/posts/[postId]/page.tsx) | Current discoverable public post | Current public/safe excerpt; minimal public author label only | Detail or valid continuation; plain repost uses original | Current eligible source; current post card; no profile data |
| `/platform/prayers` | [page.tsx](../../app/platform/prayers/page.tsx) | Excluded | Local static metadata; existing private/generic copy | No indexed identity; token/filter parameters never enter sitemap | No sitemap or JSON-LD; existing access and preview protections |
| `/platform/profile/[username]` | [page.tsx](../../app/platform/profile/[username]/page.tsx) | Excluded | Local generated metadata; existing private/generic copy | No indexed identity; token/filter parameters never enter sitemap | No sitemap or JSON-LD; existing access and preview protections |
| `/platform/profile/me` | [page.tsx](../../app/platform/profile/me/page.tsx) | Excluded | Local generated metadata; existing private/generic copy | No indexed identity; token/filter parameters never enter sitemap | No sitemap or JSON-LD; existing access and preview protections |
| `/platform/relationships` | [page.tsx](../../app/platform/relationships/page.tsx) | Excluded | Local static metadata; existing private/generic copy | No indexed identity; token/filter parameters never enter sitemap | No sitemap or JSON-LD; existing access and preview protections |
| `/platform/releases/[releaseId]` | [page.tsx](../../app/platform/releases/[releaseId]/page.tsx) | Excluded | Local static metadata; existing private/generic copy | No indexed identity; token/filter parameters never enter sitemap | No sitemap or JSON-LD; existing access and preview protections |
| `/platform/releases` | [page.tsx](../../app/platform/releases/page.tsx) | Excluded | Local static metadata; existing private/generic copy | No indexed identity; token/filter parameters never enter sitemap | No sitemap or JSON-LD; existing access and preview protections |
| `/platform/reports/decisions` | [page.tsx](../../app/platform/reports/decisions/page.tsx) | Excluded | Local static metadata; existing private/generic copy | No indexed identity; token/filter parameters never enter sitemap | No sitemap or JSON-LD; existing access and preview protections |
| `/platform/reports` | [page.tsx](../../app/platform/reports/page.tsx) | Excluded | Local static metadata; existing private/generic copy | No indexed identity; token/filter parameters never enter sitemap | No sitemap or JSON-LD; existing access and preview protections |
| `/platform/reports/review` | [page.tsx](../../app/platform/reports/review/page.tsx) | Excluded | Local static metadata; existing private/generic copy | No indexed identity; token/filter parameters never enter sitemap | No sitemap or JSON-LD; existing access and preview protections |
| `/platform/saved` | [page.tsx](../../app/platform/saved/page.tsx) | Excluded | Local static metadata; existing private/generic copy | No indexed identity; token/filter parameters never enter sitemap | No sitemap or JSON-LD; existing access and preview protections |
| `/platform/scheduled-posts/[postId]` | [page.tsx](../../app/platform/scheduled-posts/[postId]/page.tsx) | Excluded | Local static metadata; existing private/generic copy | No indexed identity; token/filter parameters never enter sitemap | No sitemap or JSON-LD; existing access and preview protections |
| `/platform/scheduled-posts` | [page.tsx](../../app/platform/scheduled-posts/page.tsx) | Excluded | Local static metadata; existing private/generic copy | No indexed identity; token/filter parameters never enter sitemap | No sitemap or JSON-LD; existing access and preview protections |
| `/platform/search` | [page.tsx](../../app/platform/search/page.tsx) | Excluded | Local static metadata; existing private/generic copy | No indexed identity; token/filter parameters never enter sitemap | No sitemap or JSON-LD; existing access and preview protections |
| `/platform/settings/[...path]` | [page.tsx](../../app/platform/settings/[...path]/page.tsx) | Excluded | Local generated metadata; existing private/generic copy | No indexed identity; token/filter parameters never enter sitemap | No sitemap or JSON-LD; existing access and preview protections |
| `/platform/settings` | [page.tsx](../../app/platform/settings/page.tsx) | Excluded | Local static metadata; existing private/generic copy | No indexed identity; token/filter parameters never enter sitemap | No sitemap or JSON-LD; existing access and preview protections |
| `/platform/share` | [page.tsx](../../app/platform/share/page.tsx) | Excluded | Local static metadata; existing private/generic copy | No indexed identity; token/filter parameters never enter sitemap | No sitemap or JSON-LD; existing access and preview protections |
| `/platform/signup` | [page.tsx](../../app/platform/signup/page.tsx) | Excluded | Local static metadata; existing private/generic copy | No indexed identity; token/filter parameters never enter sitemap | No sitemap or JSON-LD; existing access and preview protections |
| `/platform/topics/[slug]/manage` | [page.tsx](../../app/platform/topics/[slug]/manage/page.tsx) | Excluded | Local static metadata; existing private/generic copy | No indexed identity; token/filter parameters never enter sitemap | No sitemap or JSON-LD; existing access and preview protections |
| `/platform/topics/[slug]` | [page.tsx](../../app/platform/topics/[slug]/page.tsx) | Current public topic | Current public topic name \| God’s Churches; supplied purpose | Detail or valid compound discussion continuation | Current eligible topic; branded default card |
| `/platform/topics/following` | [page.tsx](../../app/platform/topics/following/page.tsx) | Excluded | Local static metadata; existing private/generic copy | No indexed identity; token/filter parameters never enter sitemap | No sitemap or JSON-LD; existing access and preview protections |
| `/platform/topics/new` | [page.tsx](../../app/platform/topics/new/page.tsx) | Excluded | Local static metadata; existing private/generic copy | No indexed identity; token/filter parameters never enter sitemap | No sitemap or JSON-LD; existing access and preview protections |
| `/platform/topics` | [page.tsx](../../app/platform/topics/page.tsx) | Public directory | Topics; useful current public topics | Base or validated continuation; filters excluded | Base only when useful; branded default card |
| `/privacy` | [page.tsx](../../app/privacy/page.tsx) | Public information | Privacy Policy \| God’s Churches; Privacy information for Godschurches accounts, public content, and historical waitlist records. | /privacy | Static sitemap; branded default card |
| `/terms` | [page.tsx](../../app/terms/page.tsx) | Public information | Terms of Service \| God’s Churches; Terms for using Godschurches. | /terms | Static sitemap; branded default card |

## Historical inventory — September 11, 2026


11 September 2026. Source inventory of the current candidate based on main
`7a5a9ab` / reported application `c7067ae8`, including the local guest-title
refinement. This is reviewed input for the existing canonical/indexing foundation,
not a change to crawl permissions or a fresh production crawl.

The root `metadataBase` uses `NEXT_PUBLIC_SITE_URL`, falling back to
`https://godschurches.com`. Relative canonicals below resolve against that value;
this is a configuration contract, not proof of the live host. The latest release
receipt reports that host; actual alias verification stays in release acceptance.
An absent local canonical is recorded honestly.
[next.config.ts](../../next.config.ts) sends `X-Robots-Tag: noindex, nofollow`
and private/no-store headers on every `/platform/*` route and platform API;
those headers apply even where a public page has its own canonical metadata.
Public readability in the table does not mean current indexability. The shared metadata helper uses
page-specific public titles/descriptions, but the root OG fallback still says
“The Revival” and uses the mountain photo. New share-card presentation exists
separately; endpoint/metadata integration is not complete.

Root GET `/` redirects to `/platform` with 307 in [route.ts](../../app/route.ts).
No root page is invented. All page entries below are discovered from the checkout.
“Protected/conditional” includes delegated readers: the linked page plus its
PortalPage/CalendarPage/support reader is the eligibility source, not its title.
Private records must not enter public indexing merely because a page exists.

## Actual source inventory

| Route | Source | Actual title | Actual description | Local canonical | Eligibility evidence / limits |
| --- | --- | --- | --- | --- | --- |
| `/about` | [page.tsx](../../app/about/page.tsx) | About \| Godschurches | Why Godschurches exists, what you can use today, and how to get started. | `/about` | Guest route; crawl policy still needs review |
| `/admin/analytics` | [page.tsx](../../app/admin/analytics/page.tsx) | Inherited root: Godschurches / The Revival | Inherited root description | `None declared locally` | Operator/admin boundary; protected |
| `/admin/waitlist` | [page.tsx](../../app/admin/waitlist/page.tsx) | Inherited root: Godschurches / The Revival | Inherited root description | `None declared locally` | Operator/admin boundary; protected |
| `/for-businesses` | [page.tsx](../../app/for-businesses/page.tsx) | For businesses \| Godschurches | The Godschurches vision for practical service and community relationships. | `/for-businesses` | Guest route; crawl policy still needs review |
| `/for-churches` | [page.tsx](../../app/for-churches/page.tsx) | For churches and pastors \| Godschurches | Understand church connections and the vision for local church tools. | `/for-churches` | Guest route; crawl policy still needs review |
| `/for-creators` | [page.tsx](../../app/for-creators/page.tsx) | For creators and preachers \| Godschurches | Share written teaching, testimony, and encouragement on Godschurches. | `/for-creators` | Guest route; crawl policy still needs review |
| `/for-users` | [page.tsx](../../app/for-users/page.tsx) | For believers \| Godschurches | Share encouragement and connect with people growing in faith. | `/for-users` | Guest route; crawl policy still needs review |
| `/help` | [page.tsx](../../app/help/page.tsx) | Help \| Godschurches | Get started, sign in, and understand public content and church access on Godschurches. | `/help` | Guest route; crawl policy still needs review |
| `/manifesto` | [page.tsx](../../app/manifesto/page.tsx) | Manifesto \| Godschurches | The convictions and long-term vision behind Godschurches and The Revival. | `/manifesto` | Guest route; crawl policy still needs review |
| `/platform/account/change-email` | [page.tsx](../../app/platform/account/change-email/page.tsx) | Confirm sign-in email \| Godschurches | Inherited root description | `None declared locally` | Public account entry/confirmation; not editorial search content; explicit noindex |
| `/platform/account/google` | [page.tsx](../../app/platform/account/google/page.tsx) | Your Google sign-in \| Godschurches | Inherited root description | `None declared locally` | Public account entry/confirmation; not editorial search content; explicit noindex |
| `/platform/account/reactivate` | [page.tsx](../../app/platform/account/reactivate/page.tsx) | Reactivate your account \| Godschurches | Inherited root description | `None declared locally` | Public account entry/confirmation; not editorial search content; explicit noindex |
| `/platform/account/recover` | [page.tsx](../../app/platform/account/recover/page.tsx) | Forgot password \| Godschurches | Inherited root description | `None declared locally` | Public account entry/confirmation; not editorial search content; explicit noindex |
| `/platform/account/verify` | [page.tsx](../../app/platform/account/verify/page.tsx) | Verify your email \| Godschurches | Inherited root description | `None declared locally` | Public account entry/confirmation; not editorial search content; explicit noindex |
| `/platform/calendars/[id]` | [page.tsx](../../app/platform/calendars/[id]/page.tsx) | Calendars \| Godschurches | Inherited root description | `None declared locally` | Protected/conditional; not approved for indexing; explicit noindex |
| `/platform/calendars` | [page.tsx](../../app/platform/calendars/page.tsx) | Calendars \| Godschurches | Inherited root description | `None declared locally` | Protected/conditional; not approved for indexing; explicit noindex |
| `/platform/church-claims/[id]` | [page.tsx](../../app/platform/church-claims/[id]/page.tsx) | Church setup \| Godschurches | Inherited root description | `None declared locally` | Protected/conditional; not approved for indexing; explicit noindex |
| `/platform/church-claims/new` | [page.tsx](../../app/platform/church-claims/new/page.tsx) | Church setup \| Godschurches | Inherited root description | `None declared locally` | Protected/conditional; not approved for indexing; explicit noindex |
| `/platform/church-claims` | [page.tsx](../../app/platform/church-claims/page.tsx) | Church setup \| Godschurches | Inherited root description | `None declared locally` | Protected/conditional; not approved for indexing; explicit noindex |
| `/platform/church-claims/review/[id]` | [page.tsx](../../app/platform/church-claims/review/[id]/page.tsx) | Church representative review \| Godschurches | Inherited root description | `None declared locally` | Protected/conditional; not approved for indexing; explicit noindex |
| `/platform/church-claims/review` | [page.tsx](../../app/platform/church-claims/review/page.tsx) | Church representative review \| Godschurches | Inherited root description | `None declared locally` | Protected/conditional; not approved for indexing; explicit noindex |
| `/platform/church-listings/[id]` | [page.tsx](../../app/platform/church-listings/[id]/page.tsx) | Church listings \| Godschurches | Inherited root description | `None declared locally` | Protected/conditional; not approved for indexing; explicit noindex |
| `/platform/church-listings/new` | [page.tsx](../../app/platform/church-listings/new/page.tsx) | Church listings \| Godschurches | Inherited root description | `None declared locally` | Protected/conditional; not approved for indexing; explicit noindex |
| `/platform/church-listings` | [page.tsx](../../app/platform/church-listings/page.tsx) | Church listings \| Godschurches | Inherited root description | `None declared locally` | Protected/conditional; not approved for indexing; explicit noindex |
| `/platform/churches/[churchId]/access` | [page.tsx](../../app/platform/churches/[churchId]/access/page.tsx) | Church space \| Godschurches | Inherited root description | `None declared locally` | Protected/conditional; not approved for indexing; explicit noindex |
| `/platform/churches/[churchId]/calendar` | [page.tsx](../../app/platform/churches/[churchId]/calendar/page.tsx) | Calendars \| Godschurches | Inherited root description | `None declared locally` | Protected/conditional; not approved for indexing; explicit noindex |
| `/platform/churches/[churchId]/directory` | [page.tsx](../../app/platform/churches/[churchId]/directory/page.tsx) | Member directory \| Godschurches | Inherited root description | `None declared locally` | Protected/conditional; not approved for indexing; explicit noindex |
| `/platform/churches/[churchId]/overview` | [page.tsx](../../app/platform/churches/[churchId]/overview/page.tsx) | Church space \| Godschurches | Inherited root description | `None declared locally` | Protected/conditional; not approved for indexing; explicit noindex |
| `/platform/churches/[churchId]` | [page.tsx](../../app/platform/churches/[churchId]/page.tsx) | Church details \| Godschurches | Inherited root description | `None declared locally` | Public only where current resource reader permits; dynamic eligibility; explicit noindex |
| `/platform/churches/[churchId]/people/[connectionId]` | [page.tsx](../../app/platform/churches/[churchId]/people/[connectionId]/page.tsx) | Church space \| Godschurches | Inherited root description | `None declared locally` | Protected/conditional; not approved for indexing; explicit noindex |
| `/platform/churches/[churchId]/responsibilities` | [page.tsx](../../app/platform/churches/[churchId]/responsibilities/page.tsx) | Church space \| Godschurches | Inherited root description | `None declared locally` | Protected/conditional; not approved for indexing; explicit noindex |
| `/platform/churches/[churchId]/review` | [page.tsx](../../app/platform/churches/[churchId]/review/page.tsx) | Review connections \| Godschurches | Inherited root description | `None declared locally` | Protected/conditional; not approved for indexing; explicit noindex |
| `/platform/churches/[churchId]/structure/[positionId]` | [page.tsx](../../app/platform/churches/[churchId]/structure/[positionId]/page.tsx) | Church space \| Godschurches | Inherited root description | `None declared locally` | Protected/conditional; not approved for indexing; explicit noindex |
| `/platform/churches/[churchId]/structure/assign` | [page.tsx](../../app/platform/churches/[churchId]/structure/assign/page.tsx) | Assignment privileges \| Godschurches | Inherited root description | `None declared locally` | Protected/conditional; not approved for indexing; explicit noindex |
| `/platform/churches/[churchId]/structure/history` | [page.tsx](../../app/platform/churches/[churchId]/structure/history/page.tsx) | Chart change history \| Godschurches | Inherited root description | `None declared locally` | Protected/conditional; not approved for indexing; explicit noindex |
| `/platform/churches/[churchId]/structure/new` | [page.tsx](../../app/platform/churches/[churchId]/structure/new/page.tsx) | Church space \| Godschurches | Inherited root description | `None declared locally` | Protected/conditional; not approved for indexing; explicit noindex |
| `/platform/churches/[churchId]/structure` | [page.tsx](../../app/platform/churches/[churchId]/structure/page.tsx) | Church space \| Godschurches | Inherited root description | `None declared locally` | Protected/conditional; not approved for indexing; explicit noindex |
| `/platform/churches/[churchId]/structure/roles` | [page.tsx](../../app/platform/churches/[churchId]/structure/roles/page.tsx) | Church role library \| Godschurches | Inherited root description | `None declared locally` | Protected/conditional; not approved for indexing; explicit noindex |
| `/platform/churches` | [page.tsx](../../app/platform/churches/page.tsx) | Find your church \| Godschurches | Inherited root description | `None declared locally` | Guest route; crawl policy still needs review; explicit noindex |
| `/platform/commitments` | [page.tsx](../../app/platform/commitments/page.tsx) | Calendars \| Godschurches | Inherited root description | `None declared locally` | Protected/conditional; not approved for indexing; explicit noindex |
| `/platform/demo/[view]` | [page.tsx](../../app/platform/demo/[view]/page.tsx) | State-dependent; see source | Inherited root description | `None declared locally` | Public fictional tour; not real community content |
| `/platform/demo` | [page.tsx](../../app/platform/demo/page.tsx) | Inherited root: Godschurches / The Revival | Inherited root description | `None declared locally` | Public fictional tour; not real community content |
| `/platform/events/[id]` | [page.tsx](../../app/platform/events/[id]/page.tsx) | Event \| Godschurches | Inherited root description | `None declared locally` | Public only where current resource reader permits; dynamic eligibility; explicit noindex |
| `/platform/feed` | [page.tsx](../../app/platform/feed/page.tsx) | My feed \| Godschurches | Read public posts one at a time, at your own pace. | `/platform/feed` | Guest route; crawl policy still needs review |
| `/platform/help/cases/[caseId]` | [page.tsx](../../app/platform/help/cases/[caseId]/page.tsx) | Private request \| Godschurches | Inherited root description | `None declared locally` | Protected/conditional; not approved for indexing |
| `/platform/help/inbox` | [page.tsx](../../app/platform/help/inbox/page.tsx) | Private support \| Godschurches | Inherited root description | `None declared locally` | Protected/conditional; not approved for indexing |
| `/platform/help/new` | [page.tsx](../../app/platform/help/new/page.tsx) | Private support \| Godschurches | Inherited root description | `None declared locally` | Protected/conditional; not approved for indexing |
| `/platform/help` | [page.tsx](../../app/platform/help/page.tsx) | Help and contacts \| Godschurches | Inherited root description | `None declared locally` | Guest route; crawl policy still needs review; explicit noindex |
| `/platform/help/requests` | [page.tsx](../../app/platform/help/requests/page.tsx) | Private support \| Godschurches | Inherited root description | `None declared locally` | Protected/conditional; not approved for indexing |
| `/platform/help/routing` | [page.tsx](../../app/platform/help/routing/page.tsx) | Private support \| Godschurches | Inherited root description | `None declared locally` | Protected/conditional; not approved for indexing |
| `/platform/join` | [page.tsx](../../app/platform/join/page.tsx) | State-dependent; see source | Inherited root description | `None declared locally` | Public account entry/confirmation; not editorial search content; explicit noindex |
| `/platform/login` | [page.tsx](../../app/platform/login/page.tsx) | Sign in to Godschurches | Sign in securely with your email and password. | `None declared locally` | Public account entry/confirmation; not editorial search content |
| `/platform/menu` | [page.tsx](../../app/platform/menu/page.tsx) | Menu \| Godschurches | Inherited root description | `None declared locally` | Guest route; crawl policy still needs review |
| `/platform/my-church` | [page.tsx](../../app/platform/my-church/page.tsx) | My church \| Godschurches | Inherited root description | `None declared locally` | Protected/conditional; not approved for indexing; explicit noindex |
| `/platform/my-church/sharing` | [page.tsx](../../app/platform/my-church/sharing/page.tsx) | My sharing \| Godschurches | Inherited root description | `None declared locally` | Protected/conditional; not approved for indexing; explicit noindex |
| `/platform/operator/churches` | [page.tsx](../../app/platform/operator/churches/page.tsx) | Church administration \| Godschurches | Inherited root description | `None declared locally` | Operator/admin boundary; protected; explicit noindex |
| `/platform/operator/listings/[id]` | [page.tsx](../../app/platform/operator/listings/[id]/page.tsx) | Church listings \| Godschurches | Inherited root description | `None declared locally` | Operator/admin boundary; protected; explicit noindex |
| `/platform/operator/listings` | [page.tsx](../../app/platform/operator/listings/page.tsx) | Church listings \| Godschurches | Inherited root description | `None declared locally` | Operator/admin boundary; protected; explicit noindex |
| `/platform` | [page.tsx](../../app/platform/page.tsx) | Home \| Godschurches | Grow in faith, connect with your community, and share everyday life on Godschurches. | `/platform` | Guest route; crawl policy still needs review |
| `/platform/posts/[postId]` | [page.tsx](../../app/platform/posts/[postId]/page.tsx) | Post and discussion \| Godschurches | Read a public post and its comments on Godschurches. | `None declared locally` | Public only where current resource reader permits; dynamic eligibility |
| `/platform/profile/[username]` | [page.tsx](../../app/platform/profile/[username]/page.tsx) | State-dependent; see source | Sign in to view member profiles on Godschurches. | `None declared locally` | Sign-in gate; member metadata remains generic; explicit noindex |
| `/platform/profile/me` | [page.tsx](../../app/platform/profile/me/page.tsx) | State-dependent; see source | Inherited root description | `None declared locally` | Sign-in gate; member metadata remains generic; explicit noindex |
| `/platform/search` | [page.tsx](../../app/platform/search/page.tsx) | Explore \| Godschurches | Find people and posts you can view on Godschurches. | `None declared locally` | Guest route; crawl policy still needs review |
| `/platform/settings` | [page.tsx](../../app/platform/settings/page.tsx) | Account settings \| Godschurches | Inherited root description | `None declared locally` | Protected/conditional; not approved for indexing |
| `/platform/signup` | [page.tsx](../../app/platform/signup/page.tsx) | Create a Godschurches account | Create your account and start connecting in faith. | `None declared locally` | Public account entry/confirmation; not editorial search content |
| `/privacy` | [page.tsx](../../app/privacy/page.tsx) | Privacy Policy \| Godschurches | Privacy information for Godschurches accounts, public content, and historical waitlist records. | `/privacy` | Guest route; crawl policy still needs review |
| `/terms` | [page.tsx](../../app/terms/page.tsx) | Terms of Service \| Godschurches | Terms for using Godschurches. | `/terms` | Guest route; crawl policy still needs review |

## Findings and proposed copy

- Guest `/platform/profile/me` and member-profile paths now use the same generic
  sign-in reason as the visible gate. Signed-in owners retain the editor title.
  `/platform/join?reason=settings` uses the account-settings reason. No private
  profile body is loaded for metadata. These are the local title refinement.
- `/platform/calendars` and `/platform/commitments` currently share “Calendars”.
  Proposed commitments title: **My commitments | Godschurches**; description:
  **Review your event responses and commitments.** Keep it protected.
- `/platform/churches/[churchId]` has a generic church-details title and explicit
  noindex. Proposed eligible public title: **[Approved public church name] |
  Godschurches**. Proposed description uses its approved public summary only;
  absent/withdrawn records use neutral text. The XH projection must approve this.
- `/platform/events/[id]` is generic Event. Proposed eligible public title uses
  only approved event name; description: **See event details and respond after
  signing in.** Private/canceled/deleted variants need the owning lifecycle contract.
- `/platform/posts/[postId]` describes a public post even though authorized readers
  can see church posts. Proposed generic description: **Open a conversation on
  Godschurches. Sign in when access is required.** Do not extract prayer text.
- Menu, account operations and many protected destinations inherit the community
  description. Draft descriptions should explain their own action (manage account,
  verify email, recover access), with no indexing expansion. Account token URLs
  must never become canonicals or appear in generated public metadata.
- The public informational routes already have distinct page titles; none of their
  local metadata claims a waitlist-only product. The fictional tour and root fallback
  deserve separate policy review. Do not equate generic inherited metadata with
  permission to index the corresponding private route.
- No Google sign-in, push, upload or analytics activation is promised here. The
  existing public copy should continue to distinguish implemented UI from enabled
  providers and later features.

Source checks: all table links resolve; route list was enumerated directly from
`app/**/page.tsx`. Dynamic titles and inherited descriptions are explicit rather
than guessed. Search-console verification, actual production metadata crawl,
canonical selection and F145–F152 acceptance remain in the owning SEO tasks.
