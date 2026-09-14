# Prayer and private follow-up acceptance

14 September 2026 UTC · Release candidate; not yet published.

## Complete feature scope

F044–F049 cover eligible canonical posts, comments and replies: a versioned
first-use guide, desired-state I prayed and undo, aggregate participation with
explicit per-target name consent, private follow-up saves and independent future
update subscriptions. Author updates are ordinary canonical comments/replies
with small tags for requests, updates, praise and completed follow-up. Existing
source audiences, church authority, moderation, account eligibility and blocking
remain authoritative. No copied private update body, ranking signal, faith score,
streak, badge or claim of verified prayer is introduced.

Legacy 061 is covered by the restrained separate Like/Pray controls and the
browser-owned option to hide their counts. The current prayer scope does not add
an unrequested emoji set or public participation feed. The interface includes
guide/retry/undo, explicit names, list empty/unavailable/removal states, source
updates, optional phone preferences, keyboard and reader touch behavior. Required
label, recovery and return-position repairs are included in this feature.

Saved-list pagination is owner-scoped and bounded. Browser Back and reload retain
the same page and item after current access is rechecked; account entry drops
the old account's pagination cursor. Backgrounding conceals private source data.
Same-account read failures retain only unsent author text; account changes clear
it. A confirmed publication followed by a read outage offers refresh without
resending the committed update.

Delivery extends the existing comment-owned continuation, event and phone owners.
Conversation and prayer phases commit twenty candidates at a time, deduplicate
overlapping direct/mention/follow/prayer recipients and recheck current consent,
source access, mute and eligibility. New device or consent dates never backfill
older updates. The prayer phone category starts off independently. Recovery
quarantines unfinished work, and source deletion/export/erasure include the new
owner records. No new provider, queue, schedule or dependency is needed.

## Candidate verification

Application source `01cc6e7` passes 55 production-build browser groups: eleven
prayer, six display, ten notification settings, eight discussion, five reader,
three private recovery and twelve Activity groups. Browser errors and real sends
are zero. Checks include simulated post and nested-comment taps, Escape, stable
labels after component remounts, 320/390px light/dark largest-text layouts,
explicit independent choices, exact retries, publication/read failures, source
withdrawal, account switching and saved-list return position. Browser emulation
does not establish physical-device or assistive-technology operation.

Ten focused prayer service groups and the earlier fifteen comment notification
groups pass. An additional account-return test and real HTTPS prayer boundary
test are included in the full gate. Twenty-six focused reading/settings/navigation
checks pass. Full lint has zero errors and 37 existing warnings; TypeScript passes.
Clean production build passes 151 runtime traces, 3,347 entries and 381 server
JavaScript files, excluding private fixtures and environment files.

The protected production-copy upgrade from migration 52 to 53 passes. Original
columns across 94 tables match before/after; protected recovery completes with
outbound delivery disabled. Plaintext and its temporary cluster are removed.
Production has not yet been migrated or modified by this candidate's checks.

The first full-gate attempt exposed a legacy reading-preference assertion missing
the new default-false count option. The assertion was corrected; the fresh final
gate runs unchanged source `70be5ff` (application remains `01cc6e7`). Earlier browser
attempts exposed implicit labels incorporating restored textarea values, a return
position omission and QA timing/selectors; the final checks cover their repairs.
One invocation omitted the local TLS CA and was corrected without weakening TLS.
The ordinary working-checkout build exhausted its 6 GB heap; the same application
built successfully in a clean checkout. That observation does not establish the
cause of the earlier exhaustion. All failed attempts remain in private evidence.

## Measured runtime bounds

Prayer controls add no per-card prayer request before activation. The modal is
loaded on demand: 11,814 bytes / 3,992 gzip. Unique listed route/layout JavaScript
is 191,227 gzip bytes for Home (2,148 above the preceding build), 187,659 for post
detail (1,953 above), and 138,337 for the private list. These are local build-file
measurements using gzip level six, not measured network transfer or latency.

Isolated PostgreSQL reads use 15 SELECTs for an empty target, 14 for twenty saved
items plus a cursor, and 12 for an empty update page; response sizes are 381,
7,248 and 68 bytes. Corresponding warm local medians are 8.21, 7.40 and 5.75 ms.
Transaction statements vary with the reused permission gate. Pages contain at
most twenty saves or updates, and names at most thirty permitted participants.
These fixture observations do not establish a production or 100-client SLA.

## Remaining release acceptance

Finish the uninterrupted full gate, exact READY deployment and independent
canonical assignment, actual public and signed-in read checks, migration and
installed recovery registry verification, ordinary installed restore, runtime
logs and original production-data fingerprints. Reconcile the existing private
feature/subtasks and overlapping discussion/notification scope only after those
receipts exist. Preserve physical phone/provider prerequisites in their owners.
