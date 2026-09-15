# Notification and scheduled-publication acceptance

15 September 2026 UTC. Release candidate `2026.09.15.2`,
`complete-notification-choices`. This local receipt does not claim deployment.

## Complete feature

Explicit person/church new-post bells, independent Activity/phone choices for
twelve categories, current-source summaries, reaction/prayer grouping and
church/commitment outcomes extend the existing canonical Activity/outbox owners.
Follow and church membership never enable a bell or phone consent. New phone
categories start off; source-time opt-in prevents backfill. Current authority is
checked at creation, delivery and opening. Private prayer acknowledgments do not
identify participants. Operational outcomes remain available on their own screens.

Church publishers can save a private publication plan, manage scheduled posts,
edit, reschedule, cancel and resolve conflicts without losing content or reply
permissions. The canonical post owns the schedule. Native queue delivery and
bounded daily repair recheck the exact revision, current publisher and due time.
Restored plans, lost authority and plans more than one day overdue become drafts.
Only actual publication creates author alerts. The existing queue/maintenance
configuration owns both new consumers; no new dependency or recurring cron is added.

Migration 56 adds opaque fanout continuations, explicit preference/bell recovery
revisions and schedule-dispatch acknowledgments. Protected restore disables
unreconciled choices, devices and work before service resumes. Export and erasure
reuse their established personal/organizational ownership boundaries.

## Verified locally

The uninterrupted full gate on `fd86ffc` passes all 143 discovered test files:
883 checks, 881 passes, two expected skips, zero failures/cancellations. It includes
production HTTPS/HTML/RSC privacy, all migrations, protected restore, real process
restart and the complete domain regression set. The subsequent `de11570` UI
cleanup retires late notification acknowledgments after identity concealment;
its production build, types/scoped lint and 13 release/settings contracts pass.
The full gate was not repeated on that UI delta.

Eight current production-built browser suites pass 50 groups on `de11570`:
account transitions 2, notification integration 8, settings 11, relationships 3,
compact actions 4, Activity 12, shared composer 7 and post discovery 3. These cover
exact lost-acknowledgment retries, current choices after logout/account switching,
canonical Activity/detail/Back, scheduling conflicts/cancellation/revocation,
private drafts, narrow/enlarged layouts and zero page errors. Device capability
is fictional; no actual permission prompt, recipient send or phone delivery is
claimed. The old inline-composer QA entry point was superseded by the current
shared-composer suite; its selector failure is preserved, not counted as a pass.

A final fresh fixture passes ten integration/schedule/process-kill checks. A
worker killed before fanout commit leaves no partial events; a kill after a
twenty-recipient commit resumes with five remaining unique events. Six personal
export checks pass over actual local production HTTPS. An encrypted, read-only
production copy upgrades from 55 to 56 migrations and restores in isolated
PostgreSQL 17: all 100 original tables/column fingerprints are preserved and
protected receipt replay completes. Production is unchanged by that rehearsal.

## Measured costs

Isolated source resolution uses 10 SELECTs / 12 statements for both one and thirty
author sources; thirty grouped Activity updates use 20 SELECTs / 23 statements.
Observed durations are 10.735, 8.641 and 13.705 ms respectively, not production
latency. Twenty-thousand fictional bell rows use ordered primary-key scans for
twenty-row first/deep pages at 0.016/0.015 ms. Partial covering bell indexes exist;
the fixture planner chose the primary index, so index selection is not overstated.

Compared with the prior release, summed unique route/layout JavaScript gzip
changes are Home +653 bytes, profile +10, Activity -220, Settings including its
lazy notifications chunk +1, and post detail +1,116. New scheduled-list/manage
routes total 144,714/165,156 gzip bytes. These are local per-file gzip comparisons,
not network transfer or a claimed startup-speed improvement. The production build
checks 162 traces, 35,519 entries and 411 server JavaScript files without private
fixtures or credentials. Emitted hydration repair is verified separately.

## Remaining acceptance

The first candidate `6a684d9` built successfully, but publication was rejected by
the provider's Hobby limit of twelve serverless functions. Migration 56 had
already applied; the prior application remained canonical. Its additive schema
is compatible with that application. All 56 production checksums match and the
25 original-column production fingerprints remain unchanged, with no new bells,
preferences, schedules, fanout jobs, recipient intents or sends.

The deployment repair keeps the existing comment-consumer route and registers
the two new topics on that same private function. Dispatch uses the SDK's topic
metadata; each domain retains its payload validation, current authorization,
bounded work, acknowledgment and retry timing. No additional function, provider
plan or public callback is needed. Six focused consumer/scheduling checks and
fifteen existing comment-notification checks pass; types and scoped lint pass.
The initial focused import failure used unsupported TypeScript parameter-property
syntax in Node's fixture loader; ordinary field initialization repairs it.

The installed recovery registry now matches production's 56 migrations. Its
ordinary encrypted restore passes across 101 tables with plaintext removed;
nightly retention verifies 43 encrypted sets with zero issues or removals.
Prior registry and failed-deployment receipts are retained privately.

Before release completion: exact deployment READY and independent canonical
assignment, serving version and emitted renderer, public and signed-in live
behavior, both no-op native consumer probes, migration checksum reconciliation,
installed recovery verification and production write accounting. Actual locked
phone/tap/reply and physical cross-device acceptance retain their existing owner
prerequisites. Optional email digests and unimplemented future feedback sources
remain with their owning features. Final batch review remains last.
