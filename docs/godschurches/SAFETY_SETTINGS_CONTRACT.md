# Safety settings and relationship management

September 12, 2026. Reuses the deployed [relationship service](SOCIAL_FOUNDATIONS_CONTRACT.md)
and its existing current-account, bilateral policy, version and exact-body retry
boundaries. No new permission, schema or moderation capability is activated.

| Action | Existing consequence and Settings entry |
| --- | --- |
| Block | Bilateral direct personal social interactions/reads are filtered. Follows, favorites, invited friendship and personal-conversation subscriptions are removed as defined by the service. Settings opens the owner's blocked list. Public signed-out material and separate church-authored identity/duties retain their existing rules. |
| Unblock | Deliberately remove this account's block only; all other current access rules still apply. Confirmation must say follows, favorites, friendships and conversation subscriptions are not restored. Failed/unknown requests cannot optimistically remove a blocked row. |
| Mute/snooze | Private feed/discovery filtering with permanent or displayed expiry. Direct permitted reads remain available. Does not cancel membership, responsibilities or commitments. Settings opens the canonical muted/snoozed list. |
| Mention/reply controls | Recipient mention choices use the existing social preference editor. Per-post replyAudience and current church eligibility remain in the shared composer/draft/publication service. No global reply or new sensitivity/keyword preference exists. |
| Content report/history | Canonical moderation intake and reporter-visible history remain a separate unbuilt capability. Existing support cases are not moderation reports, and no moderator evidence or other reporter's data may be exposed through Settings. Keep content-report entry/history acceptance gated. |
| Help/support | Links to the actual current Help destination and existing intake where available, accurately labeled as support. It does not imply a post report or enforcement outcome. |

The existing relationship library remains authoritative. Search of blocked/muted
lists filters only the authenticated owner's settings, matching available target
names/usernames (and muted church names) before the existing 20-row ID pagination.
Search is literal, bounded to 100 characters; unavailable targets have a neutral
label and do not match hidden names. Clear search resets the cursor. More/First
page links preserve the explicit search. It never searches incoming blocks or
another account's private relationships.

Unfiltered lists retain unavailable target rows under neutral account/church
labels while the relationship record exists. Hard-deleted targets follow existing
foreign-key cleanup. No target label, profile link or unsupported unblock action
is reconstructed from a missing account. All existing owner checks, no-store
headers, current-session refresh, conflict review and exact-body command retries
remain required. No optimistic relationship removal or automatic reconnection.

This milestone can verify supported blocking/mute/mention management independently
of the missing moderation intake/history. Leave those report-related criteria,
parent integration and physical owner acceptance open.
