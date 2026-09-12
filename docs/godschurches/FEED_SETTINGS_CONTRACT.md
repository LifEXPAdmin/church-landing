# Feed preferences: existing authority and activation gates

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
