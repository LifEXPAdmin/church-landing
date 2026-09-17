# Private following lists

Contract, 16 September 2026. Implemented and verified live in 2026.09.16.13.
See [the exact implementation and release receipt](FOLLOWING_LISTS_IMPLEMENTATION.md).

Members can create, rename and delete up to 20 private lists, each containing up
to 100 currently followed people or churches. List names and membership are
owner-only. They grant no membership, church duty, public endorsement or access
to another person's content. Deleting a list never unfollows anyone.

Reuse SocialPreferences for a bounded, independently versioned list document.
Reuse PlatformFollow and SocialRelationship as the authoritative relationships.
Personal entries bind to the current follow ID. Church entries bind to the
relationship ID and followingSince value. Unfollow/refollow and block/unblock
cannot silently revive an old entry. Muting preserves the private organization
while excluding the author's posts through the existing feed policy.

An explicit list selection narrows Following. Every candidate, page and current
availability read intersects the saved selection with current relationships,
audience, source, block and mute checks. Existing discovery filters still apply.
Bind reading sets to the list document version and selected ID. A deleted
selection or missing newer recovery state requires a deliberate new choice,
rather than widening the feed. Other feed modes remain available. Older feed
and discovery forms preserve independent list choices.

Use current account sessions, the existing permission lock, expected versions,
immutable mutation receipts and owner-bound no-store HTTP responses. Reject
unknown fields, unavailable entries, oversize lists and conflicting saves.
Keep entered names and uncertain requests across recoverable failures. Conceal
private content on account or foreground changes until fresh authorization.

Account export includes the owner's list choices. Account erasure removes them
with SocialPreferences. Protected recovery records only opaque owner/version
receipts; a missing newer document is cleared and quarantined before reads,
so deleted lists and old membership are not reconstructed from a stale backup.

Acceptance covers owner isolation, exact retry and concurrent changes, list
deletion preserving follows, follow epochs, current post/source permissions,
cursor invalidation, old-form compatibility, protected recovery, export/erasure,
route guards, responsive built-browser behavior and the complete release gate.
Run all writes and capacity measurements with isolated fictional fixtures.
Record exact READY/canonical identity and read-only live behavior before closing
the feature. No new provider, dependency, worker or public relationship surface
is required.
