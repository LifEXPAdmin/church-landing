# Feed preferences: existing authority and activation gates

## Active four-mode feature — September 14, 2026

The current unified queue explicitly selects one complete early feed feature:
Latest, Friends, Top This Week and Trending. All four are required. Their service,
preference, selector, Home/My feed integration, regression and exact live-release
work belongs to this feature cycle. Earlier foundation/UI labels do not defer
required finishing work. The current application is 2026.09.14.13; this section
records the new implementation audit, not a completed feed release.

- Latest selects currently eligible public posts, newest publication and stable
  ID first. It is the default only when no supported private choice is saved.
- Friends selects currently accepted mutual friends, newest first, excluding
  self, pending requests and one-way follows. Current source permissions still
  apply. An empty or guest Friends view must not add stranger content.
- Top This Week ranks public posts by distinct eligible active non-self Likes
  received within the rolling previous 168 hours. Older posts can qualify through
  recent Likes; this supersedes the earlier proposed post-age restriction.
- Trending sums each distinct eligible active non-self Like's weight in the
  previous 72 hours: `2 ** (-ageHours / 24)`. Four Likes aged 24 hours score 2;
  three aged one hour score about 2.915. Both ranked modes exclude zero scores,
  use one snapshot time, include the lower time boundary and exclude the snapshot
  instant. Ties use newest publication, then descending stable post ID.

The existing Like owner has one row per account/post and immutable `createdAt`.
Unlike changes active/version fields; exact receipts do not create new votes.
The command can also create an initially inactive row, so its row-creation time
cannot always be treated as a verified first-active Like time. Any necessary
timestamp support must preserve known dates, avoid refreshing dates on retries,
and leave unknown historical activation dates unguessed. Normal visible Like
counts remain separate from ranking. Plain reposts use the original Like target;
repost copies must not multiply its votes.

Current Home and My feed share the mounted reader, ordinary List/Pages choice and
chronological anchors. Those anchors alone cannot freeze a changing Like ranking.
The feature needs viewer/mode-bound stable ranked cursors, current authorization
on each page and on retained readers, deliberate refresh, and private saved mode
across sessions. Current mute/block, moderation, source/repost, account and church
audience owners remain authoritative. Friends eligibility must also disappear
after friendship removal even if the former friend's original post stays public.

Required empty text: “No posts from your friends yet”, “No liked posts in the last
7 days yet”, and “No trending posts yet”, each with an explicit Latest action.
Switching mode resets its source cursor but preserves List/Pages, navigation and
unsent-work protections. Guest choices remain separate from account preferences.
Broader Local, Following, Your Church, recommendations, advanced filters and
future settings scopes below remain distinct; their absence does not defer these
four approved modes. No new paid ranking provider or view tracking is required.

## Existing and broader preference authority

The current Home and My feed share `HomeFeedPage` and the audience-aware post
reader. `homeFeedMode` is deployment configuration, not a private account
preference: community selection by default, or the existing following mode.
No account-selected default, radius, language, denomination or ranking preference
is persisted today. The early-community owner decision and focused reader remain
in force; this audit does not change either. See [reader evidence](FEED_READER_REPORT.md).

| Proposed choice | Current authority and inputs | Activation boundary |
| --- | --- | --- |
| Community / Public | Current community feed broadens candidates after `postReadableWhere` and social discovery filtering. Guests remain public-only; signed-in readers can receive their permitted content. | Preserve current launch behavior. A distinct Public preset must explicitly restrict to public posts; never equate current membership eligibility with public discovery. |
| Following | Existing deployment mode combines self, followed personal authors, followed churches and permitted church audiences. | The new strict Following preset must include only followed people/churches, newest-first, as specified; current mode is not that accepted selectable preset. |
| Your Church | Existing church read filters and current membership checks support scoped views. | New preference must select an approved church and distinguish church-authored posts from personal posts explicitly shared to that audience. Pending/left/revoked access cannot reveal content. An unavailable choice needs an explicit recovery path, never silent widening. |
| Churches | Followed church IDs and public church identities already exist. | A selectable Churches preset must limit to those churches' public posts; following grants no membership or management. |
| Favorites | Private favorites and canonical follows exist independently. | The feed must intersect favorites with current follows, newest-first; marking a non-followed account favorite is not sufficient. |
| For You | No accepted ranking service, reason DTO or private feedback/preference storage. | Ranking and signed cursor/snapshot contract must precede controls; no reading-time or inferred-faith signal. |
| Local | Churches have public text locality, but no approved coordinate/radius service or personal-post locality declaration exists. | Require chosen coarse area/radius and author-approved source locality. Do not infer from directory contacts, profile location or private membership; no automatic GPS. |
| Denominations | Church records have self-declared public tradition text. No personal post declaration, preference or maintained synonym taxonomy exists. | Default All; where a filter is implemented it must expose an explicit All choice. Strict selected traditions exclude unknowns. Never infer a person's faith from membership, text, likes or geography. |
| Language | No author-selected post-language declaration or preference exists. | Explicit language and include-unknown rules are required, independent of place/tradition. |
| Topics / types | Existing author-selected post types/topics and `communitySearch` post-topic filtering. | Search filters affect only the current query. Persisted hidden-topic/word/type preferences and presets need their own authoritative service; no AI synonym expansion. |

Existing read boundaries apply before snippets, counts and cursor pages. Current
blocks, inactive accounts, post status, source/church/event audiences and private
media access remain authoritative. Muting/snoozing affects discovery, not direct
authorization. Existing List/Pages reading preferences affect presentation only.

The owning selectable-feed work separates private preference/eligibility data,
deterministic ranking/cursors/explanations, then Home integration. Its updated
prerequisite requires the first two foundations before preference controls.
Canonical moderation eligibility and absent coarse-source metadata remain named
dependencies. Do not add a default-feed selector whose change cannot be confirmed
and restored across sessions, or activate a Local/Only preset by silently showing
broader content. Feed-default/radius integration remains blocked by these services.

This is a contract reconciliation only. Source paths, schema, current reader and
focused specification were inspected. No application preference, permission,
provider configuration or production data changed, and no future feed acceptance
is claimed from the existing reader's historical or current checks.
