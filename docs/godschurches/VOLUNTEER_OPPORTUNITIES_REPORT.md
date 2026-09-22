# Volunteer applications and independent shifts

Implementation checkpoint, 22 September 2026 UTC. The accepted
[opportunity contract](VOLUNTEER_OPPORTUNITIES_CONTRACT.md) is implemented in a
local candidate. Production remains on the preceding release. Full acceptance,
integration, production migration and verified-live evidence are still pending.

## Implemented behavior

Church coordinators can publish an approval-required opportunity from an
authorized church post. Applicants review its duties and commitment, submit a
private optional statement, inspect decisions and withdraw. Coordinators review,
accept, decline or cancel within current church authority. Applying consumes no
capacity and neither applying nor acceptance grants church privileges.

Timed acceptance reserves the existing volunteer signup. Posts, linked church
needs, completion receipts and My commitments use that same reservation and
capacity. Independent shifts preserve their own interval within the parent
event. A parent edit that no longer contains the shift raises a conflict instead
of moving its time. Untimed roles retain accepted application assignments without
creating an event, RSVP or timed signup.

Private application history uses current source, account, relationship and
coordinator checks. Revoked source access leaves the applicant a minimal
withdrawal receipt. Account export and erasure, protected recovery and completed
need receipts preserve their existing boundaries. Exact mutation retries cannot
duplicate a reservation or revive an old acceptance.

## Verification recorded so far

- Fresh fictional replay of all 105 migrations passed. Existing migrations are
  unchanged; the additive migration extends the current retention constraints.
- Thirty-nine focused service checks passed across volunteer applications,
  shift validation, existing participation and church needs. Additional current
  regressions passed for linked-need approval and completed-receipt privacy, and
  two independently timed shifts with owner-only overlap hints after an edit.
- TypeScript, focused lint, release-content checks and the clean candidate build
  passed. Candidate builds passed hydration verification and all 231 runtime
  traces. The final combined build after the query reduction is still pending.
  No new dependency is introduced.
- A fresh encrypted production backup was restored only into an isolated
  database, upgraded from 104 to 105 migrations and reconciled with protected
  controls. All 144 original table fingerprints were preserved, migration
  checksums matched and protected replay completed without unresolved reports.
  Restored authentication remained quarantined and traffic disabled. Production
  was not changed by this rehearsal.
- The built browser completed eight journey groups in one run, including the
  editor, lost-reply reconciliation, approval, narrow enlarged text, canonical
  commitments, account-switch concealment, coordinator revocation, minimal
  cancellation and untimed assignment. Intermittent same-route refresh failures
  were also reproduced, so these journeys are not yet accepted for release.

## Measured runtime cost

On the fictional local database, a 25-application coordinator page initially
required 576 SQL statements and 222 to 230 milliseconds. Batched current
eligibility and church-access filtering reduced this to 26 statements and
9 milliseconds across three reads, with the same 12,030-byte payload. Current
suspension, membership removal, reverse blocks and recovery quarantine all
passed the focused disclosure regression. A twelve-opportunity page used 23 to
24 statements, 10 to 13 milliseconds and 9,338 bytes. These are local
measurements; they do not establish hosted latency or provider headroom.

## Failures and remaining gates

The long-lived checkout build exceeded its heap limit. A clean source export
resolved that environment issue after preserving relative dependency executable
links. An early HTTP test correctly rejected recovery storage outside the
fixture allowlist; the fixture path was corrected, and the HTTP retry passed.

The browser refresh failure saves the application correctly but can leave its
old screen visible even when the API and returned server component payload have
the current state. Avoiding an unchanged reading-preference dispatch and delaying the confirmed
refresh were both tested and did not resolve the failure; both experiments were
reverted. The causal investigation and release acceptance remain open.

Finish the browser regression, measured query/payload review, full support gate,
compatible preserving-code rollback and final release checks. Record the actual
integrated commit, production migration, deployment, canonical assignment,
serving product/build identity and live read-only checks before describing this
feature as released. Screening credentials, role templates, voluntary public
service history and optional availability remain separate future features.
