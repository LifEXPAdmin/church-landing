# Notifications and adult photo-tag acceptance

September 16, 2026. Candidate application source: `827d57e`. This is a local
acceptance checkpoint, not a production-release receipt. Production remains the
feedback release until the full gate, canonical deployment and live verification
are complete.

## Complete feature scope

The signed-in header exposes a labeled Notifications bell and scalar unread count.
Existing Activity URLs retain All/Unread/category views, read/unread, mark-all,
current source checks, cross-tab refresh and safe unavailable history. Notification
reads never claim that unseen messages were read. Canonical message reads update
the separate Messages badge.

Post mention selections survive saved drafts and resolve current permitted names
when reopened. Publication rechecks consent and audience. Friend acceptance and
new volunteer roles use existing canonical events and subscriptions. Volunteer
alerts identify the exact role or owned signup, including canceled and older
reservations without disclosing revoked source details.

Adult photo tags include private request/review, approval, decline/removal,
independent request and notification preferences, approved photo/profile
associations, export/erasure and protected recovery. Tags never grant source
access, publish pending associations or delete another person's photo. Family
extensions remain unavailable behind their separate policy gate.

## Isolated acceptance

The production preview builds successfully with 189 traces, 43,670 entries and
475 server JavaScript files. Its verified renderer is 173,096 bytes, SHA256
`647e9e5fbb96baa9ebe3cf0aa8d816f57e0e46354f2b8ad0fb9db18029e29f15`.
Types, scoped lint and release-content validation pass.

Browser acceptance covers 47 groups against this application source:

- Eight core groups cover actual photo requests/retries/approval/removal,
  independent privacy, saved/reopened post mentions, new volunteer requests,
  exact signup/cancellation, grouped messages and canonical message reads.
- Twelve Activity groups cover pagination, exact source/Back, read boundaries,
  lost acknowledgements, conflicts, offline/focus recovery, current revoked
  sources, identity changes and navigation.
- Four source-action groups cover actual friend acceptance, comments/replies and
  comment mentions, anonymous reactions, church updates and event cancellations.
- Nine existing integration groups cover explicit person/church bells and the
  complete scheduled-post draft/edit/reschedule/cancel/revocation journey.
- Eleven notification-settings groups cover initial permission behavior,
  independent in-app/phone categories including photos, quiet hours, retries,
  conflicts, exact comment/follower destinations, revocation and draft protection.
- Three photo-review boundary groups cover failed images, stale approval after
  a real photo edit, exact decline retries and delayed reads across account changes.

These use isolated accounts/data and simulated browser push capability where
needed. No real phone provider receives a send. The core center works with denied
push permission and without installation. Narrow screens and enlarged text pass.
Browser page errors are zero; expected failed transport, conflict, denied-source
and fictional missing-avatar requests are preserved in the private logs.

The first full gate stopped at an obsolete generic church-role summary assertion.
The corrected assertion still excludes role/capability details; all 11 focused
checks pass. Five mention checks verify current name resolution, consent, blocks
and eligibility. Earlier integration caught and corrected a reaction-identity
regression; the final focused integration passes 22 checks. A fresh complete gate
at `827d57e` is running; do not substitute these focused counts for full acceptance.

## Recovery and release gate

The protected production-copy rehearsal upgrades 84 to 89 migrations and preserves
all original columns in 119 tables. Protected replay completes, restored plaintext
is removed and production is unchanged. Fresh preflight confirms all 84 installed
checksums and exactly five intended additive migrations.

Complete the full regression gate, verify the exact READY deployment and independent
canonical alias, then verify live behavior, original-column fingerprints, all 89
migration checksums and the installed recovery registry. Keep physical-device,
cross-device, actual operator/provider and pilot observations separate. Do not
close the parent feature's remaining physical acceptance from automated evidence.
