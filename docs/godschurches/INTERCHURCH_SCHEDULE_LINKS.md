# Interchurch agreement schedule links

Prepared 7 October 2026. This report describes an isolated implementation;
integration and verified release acceptance remain separate.

## Behavior

An active private help agreement can link one canonical occurrence or volunteer
shift owned by the requesting church. Both named adults must currently be able
to read its details. A busy-only calendar grant is insufficient. A shift also
requires a readable church-authored post linked to the same occurrence, an open
role and an available opportunity. Personal calendars, another church's events,
group/topic posts and unavailable sources are excluded.

The link copies the deliberately reviewed time into the existing agreement
terms. It creates no RSVP, signup, application, capacity reservation or access
grant. A change to the link clears both acknowledgments and shared contacts;
each participant must acknowledge the exact current agreement independently.
All-day sources keep their canonical date-only representation. Agreement terms
use midnight in the source time zone and preserve the exclusive end date.

Canonical event edits, cancellation, publication changes and volunteer-slot
changes invalidate affected active agreements in the source transaction. The
old reviewed time and source fingerprint remain unchanged. The interface shows
the readable current source and requires a deliberate link refresh followed by
renewed acknowledgment. An edit to a sibling occurrence does not invalidate an
unchanged linked occurrence. A source change racing acknowledgment cannot leave
stale confirmed help.

New or replacement targets must have a future end. A previously linked,
unchanged past source remains usable for permitted completion and history.
Refreshing that same source is explicit. Ordinary amendments preserve its link
and cannot separately rewrite its canonical time. Unlinking also requires fresh
acknowledgments and preserves the last reviewed time as standalone terms.

## Privacy and persistence

The association lives inside existing private agreement JSON, with exactly five
binding fields: schema, kind, target ID, occurrence ID and a fingerprint. Request
and offer input parsers continue to reject schedule fields. No Prisma model,
dependency, participation pool or background job is added.

Reads and mutations recheck both participants, source access, current versions
and existing privileged-authority rules. Membership/grant and publication
epochs prevent revoked and later regained access from reviving old agreement
consent. An unavailable target produces the existing minimal unavailable receipt
without linked IDs, logistics or prior contact. Public HTML and RSC do not
contain the private source binding.

Choices require an explicit read, scan at most 20 candidates with one lookahead,
and return only targets readable by both adults. The cursor is authenticated and
encrypted, bound to the pair, church and target kind, and expires after 15
minutes without extending the expiry between pages. It does not disclose the
last scanned hidden target. Each event permits at most 100 active agreement
links across its occurrences. Oversized restored state fails source mutation
atomically before an incomplete invalidation can commit.

The existing private page owns original-account checks and exact serialized
mutation retry. Late choice responses cannot reopen concealed information.
Current authorization failures from the auxiliary choice read conceal the
entire private page. Schedule choices are cleared on concealment and selected
again; existing offer entries and a pending original mutation remain with their
existing owner. No private response or schedule draft is written to browser
persistent storage.

Material changes use the existing generic interchurch update channel. A
different canonical organizer may notify both named participants only through
the recorded current schedule-change provenance. The projection includes no
organizer identity or source logistics. Optional push still requires agreement
notice consent and the account's existing category consent. No provider
delivery is established by local source or fixture checks.

Exports omit binding identifiers and fingerprints and suppress unavailable
source logistics or stale contact. Selected report evidence omits linked dates
and time zone as well as the binding. Erasure removes the association through
the existing interchurch erasure owner; recovery remains with the existing
opaque control replay and quarantine rules.

## Migration and compatibility

`20261007224000_interchurch_schedule_links` adds two partial JSON lookup indexes,
one publication-audit index and a strict binding trigger. It does not rewrite
existing agreement data. The current command and erasure owners identify their
transaction with `gc.interchurch_schedule_writer=v1`.

An old writer cannot add a binding, drop it through an ordinary amendment,
revive acknowledgment, add contact, invent completion or replace the source.
The trigger permits monotonic restriction by existing cleanup owners, including
the two-step recovery quarantine and fully anonymous terminal scrub. Exact
legacy cancellation may add its first timestamp and reason while clearing
contacts. Previously retained acknowledgment/notice values may stay unchanged
or clear; they cannot be newly added or replaced. Terminal cancellation metadata
cannot subsequently be rewritten by that writer.

Apply the additive migration before enabling the new server. Do not roll back
to a reader that understands only the old agreement terms once links exist.
Retain the compatible reader and binding protections during recovery. This is
an expansion guard for restrictive cleanup, not proof that every older build
can serve linked agreements.

## Verification record

- The final migration preserved all existing row fingerprints across 165
  populated fixture tables. Initial controller failure and repair evidence were
  retained privately; no shared database was used.
- All 22 initial focused real PostgreSQL groups passed: consent, exact retries, source
  races, sibling edits, slot/cancellation behavior, both-person access,
  wrong-church references, amendment preservation, old writers, exports/report
  evidence, recovery replay, opaque pagination, generic notices, past history,
  revoked/regained membership, bounded fan-out, both all-day source kinds and
  both legacy cancellation shapes with prohibited terminal rewrites.
- All 70 existing tests passed across interchurch help, calendars, participation,
  volunteer-shift and volunteer-application suites.
- A further real PostgreSQL regression verifies that infrastructure failure
  aborts export while genuine source-access loss returns a safe limited export.
  Both existing export/report cases were rerun after that repair and passed.
- The final production build, `l5Tz2DJvvfqlM2g03XhRq`, passed compilation, types,
  copy, hydration-output, runtime-trace and public-build security checks. All
  1,558 recorded source/test/build-input hashes remained unchanged. Focused
  ESLint and whitespace checks passed without warnings or errors.
- Four real HTTPS tests passed against the final build, including wrong owner,
  cross-origin rejection, exact retry, calendar invalidation, revoked source
  access and private HTML/RSC concealment.
- Seven actual browser groups passed with zero page errors or attempted external
  requests. They cover lost-response retry, separate bilateral acknowledgment,
  optional contact, 320/1440-pixel layouts, foreground 401/403/404 and sign-out,
  explicit source refresh, volunteer-shift linking, held reads, replacement
  accounts and unavailable-target concealment. Screenshots were inspected.
- A populated dump/restore retained all 165 application tables' row fingerprints
  and the restored old-writer guard. A fresh database applied all 126 migrations
  successfully, producing 165 application tables plus Prisma's migration ledger.
  Temporary verification databases were removed.
- All owned application, proxy and database processes stopped, and all three
  owned ports were verified closed before handoff.

Preserved harness failures were repaired rather than counted as passes: an
invalid fictional username, an unbounded wait on an intentionally canceled
identity-response body, unsupported dynamic-client test mocking, and an empty
untracked migration directory left by a filename correction. The final browser
runner bounds its waits and records its own hash separately from the build.

The fixture disables provider delivery and uses fictional accounts. Its main
journeys use the existing explicit test MFA-off configuration; they do not
establish real privileged-provider, staging, device or pilot acceptance.

## Reproduction

After preparing this checkout's explicitly owned, migrated fictional fixture,
run `node scripts/test-interchurch-help-schedule.mjs <fixture-directory>`.
`--http` additionally requires its built HTTPS application and certificate;
`--regression` includes the existing related service suites. The browser runner
is `scripts/qa-interchurch-help-schedule-browser.mjs`. Launch it with
`node --import ./tests/register.mjs` and the fixture directory argument, with
`NODE_EXTRA_CA_CERTS` pointing to that fixture's certificate before Node starts.
It uses the same fixture and production build. The runners create no shared
service, deployment or external provider activity. Keep their private artifacts
outside version control.
