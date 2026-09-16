# Notifications and adult photo-tag acceptance

September 16, 2026. **Published and verified:** `2026.09.16.2`, application SHA
`8023e809f30acf52a863fc11c0f06d8d304ee8c1`, READY deployment
`dpl_6WQEd4ms8mf73s4YkEkt4VdjNmP8`. Independent alias lookup and the canonical
release endpoint agree. Final application acceptance source is `6349ece`; the
release commit changes documentation only.

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

Browser acceptance covers 47 groups against `827d57e`:

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

The final calendar change preserves an exact volunteer signup through guest
account entry. Eight core browser groups and 20 read-only guest/private-entry
checks pass again against `47b3ae9`. The only subsequent application change is
the new photo setting's ID: `privacy.photos` follows the existing registry
contract. All six registry checks and the final production build pass.

Complete staged regression covers all 167 discovered files: 1,018 passing checks
and two expected disabled-delivery skips. This includes fresh/upgrade migrations,
synthetic full restore, development and production builds, actual HTTPS boundaries
and restart. Successful stages are retained; failed partial suites and the
superseded production-calendar run are excluded from the accepted count.

Preserved failures led to three specific corrections: an obsolete generic church
summary assertion, the preference expectation missing the new photos category,
and the new setting ID that did not follow the established registry convention.
Church summaries still exclude private role/capability details. Earlier focused
integration caught and corrected a reaction-identity regression; the final
integration passes 22 checks. Five mention checks verify current name resolution,
consent, blocks and eligibility. No failures remain in the accepted gate.

## Recovery and live release

The protected production-copy rehearsal upgrades 84 to 89 migrations and preserves
all original columns in 119 tables. Protected replay completes, restored plaintext
is removed and production is unchanged. Fresh preflight confirms all 84 installed
checksums and exactly five intended additive migrations.

Production reached READY at 04:19:15.300 UTC; exact serving identity and independent
canonical assignment were verified at 04:20:34 UTC. Twenty public/private-entry
checks, four secured health checks and eight connected signed-in browser
observations pass. Home and Menu show the labeled Notifications entry with the
existing unread count; All/Unread, private photo review, adult request choices,
the registered privacy entry and separate initially-off photo phone alerts are
visible. Navigation leaves both existing unread updates unchanged. No real tag,
read-state change, preference save, message or device registration was created.

All 89 production checksums and the installed recovery registry match. Original
column fingerprints in all 119 existing tables are unchanged. New mentions,
photo tags/approvals, personal unread reminders, explicit tag preference changes
and new feature events are zero. Two nonexistent-source probes execute on this
deployment with HTTP 200 and zero application writes. No outbound sends occur.
Public-browser page errors and deployment-scoped error/fatal rows are zero in
the checked 04:19:15–04:25:30 UTC window, with a 100-row limit per severity.

Installed ordinary and daily 89-to-89 restores each cover 121 tables and remove
restored plaintext. Nightly recovery validates 56 encrypted sets with no issues
or removals, retaining the existing 28-day expiry and 30-day maximum policy.
The local execution host must remain awake.

Actual provider output verifies 189 traces, 59,758 entries and 474 server
JavaScript files with no private fixture/environment/configuration-loader path.
The deployed renderer is 173,096 bytes, SHA256
`2b7c5f99a8710e52520e7d0dc25c9fb65fd7c06e0a1d6cfee97276e0a452a3b7`.
There are 389 function route entries, 12 distinct packages and 168,517,375 packaged
bytes, including middleware. Application functions use Node 24, 2,048 MB and
`iad1`; middleware lists eight regions. The 150.692-second concurrent build wait
and package sizes are provider observations, not latency, billing or capacity
guarantees. No shared-project configuration was changed.

The required notification and adult photo-tag engineering is complete. Keep
physical-device, actual cross-device, operator/provider and pilot acceptance
separate. Family tagging remains unavailable behind its own policy gate.
