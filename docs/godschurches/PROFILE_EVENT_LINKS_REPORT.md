# Profile event links

September 19, 2026 UTC. Focused acceptance and the complete release gate pass.
Main publication and live acceptance remain open at this checkpoint.

Church agendas and group event links already read canonical calendar occurrences.
Personal profiles now add an explicit optional selection of one existing event.
The profile stores only the occurrence reference, with the existing modules,
optimistic version, export and protected recovery control. Each viewer's current
calendar access determines whether the event appears. No event, schedule,
audience or RSVP is copied and selecting an event grants no publishing authority.

The picker checks a same-site link, shows current permitted details and requires
an explicit selection followed by Save profile. Checking alone writes nothing.
It preserves ordinary profile conflict, navigation and uncertain-save behavior.
Older editors that omit the reference preserve a saved choice; explicit removal
clears it without changing the source. The reader strips stored selection metadata
from member DTOs before adding the independently authorized event projection.
Busy-only sharing, unavailable sources and unauthorized viewers get no event.

An independent review found that copied calendar URLs include a display time-zone
parameter. The profile picker normalizes that supported parameter before lookup.
The pre-existing group picker had the same rejection. Built HTTPS reproduced
that failure without a write at 04:04:24 UTC. Its matching repair now passes the
actual copied-link group journey. Both reject unknown parameters and credentials.

## Evidence so far

Twenty-four focused isolated service/regression checks passed, including canonical time/title/location edits
across church, group and profile; cancellation with one unchanged RSVP; current
audience, busy-only sharing, blocks and generic previews; stale writes, legacy
editor preservation, export and recovery after explicit removal. The first test
attempt failed on reused fictional group names; unique fixture names fixed the
test setup. Two actual HTTPS groups also pass HTML/RSC source/privacy checks,
pinned identity, same-origin intent, authorized profile saves and stale removal.
Two release-content checks pass. Types, scoped lint and copy checks pass.

Seven built HTTPS browser groups passed at 04:13:15 UTC, with no page errors or
external browser requests. They exercise copied event links in groups and
profiles; read-only checks; background concealment; keyboard selection and
unsaved navigation; failed removal and explicit retry; latest-saved conflict
review; canonical edits across group/profile; and revocation on retained pages,
outsider reloads and generic/visitor views. Emulated widths of 320, 390 and 1440
with enlarged text have no horizontal page overflow. Reviewed screenshots include
the picker and current event card. These are not physical-device observations.

The first HTTP attempt assumed a rendered client link in RSC and the wrong
existing account error status. Those assertions were corrected without changing
the account contract. A second attempt caught an isolated recovery-directory
configuration pointing outside the exported server root; correcting that fixture
restored the required protected-save response. An improved browser receipt first
raced the existing history cleanup; awaiting its actual RSC refresh and settled
history fixes the harness without changing application navigation. Failure logs
are retained separately from the passing receipts.

The first production build in the long-running checkout exhausted the configured
Node heap. The failure log is retained. Clean source exports pass production
builds; the repaired candidate completed at 04:08:05 UTC. Hydration verification
retains the existing 173,096-byte renderer, and runtime trace verification passes
224 traces, 74,462 entries and 558 server JavaScript files with no private fixture
or environment path. The complete gate, integration and live checks remain open.

## Measured runtime cost

The existing member reader made 26 SQL queries and returned 584 JSON bytes for
one fictional profile without a choice; the same reader with a permitted event
made 36 queries and returned 968 bytes. This is a bounded canonical occurrence
lookup and current calendar-policy resolution, not a speed improvement claim.
Profiles without a selected event perform no added calendar query. A deliberate
picker check uses the existing identity-before/read/identity-after transport;
there is no new polling or background work.

Compared with the preceding accepted build, the editor route's aggregate client
chunks increase from 598,523 to 603,117 raw bytes and 182,632 to 183,880 gzip bytes.
The member route changes from 670,325 to 670,365 raw bytes and 203,236 to 203,239
gzip bytes; the group route changes from 684,010 to 684,124 raw bytes and 209,838
to 209,880 gzip bytes. Counts include shared chunks and are build observations,
not measured network transfers. No dependency is added.

## Compatibility and scope

Deploy the new decoder and reference-preserving writer with the reader and picker.
An older strict decoder projects modules containing the new reference as empty;
an older form may then overwrite them. A compatible interface rollback must keep
the current decoder, preserving writer, source permissions and recovery controls.
Never restore an older database to undo this UI.

This extends the existing church, group and personal-profile surfaces. Artist and
venture runtime owners do not yet exist and are not created by this adapter.
Their future surfaces must reuse these canonical records and current audience
checks when their own prerequisites are met. No migration, new provider,
dependency or background worker is introduced. Saving or removing a selection
uses the existing profile write owner; acceptance writes use fictional fixtures.

## Complete release gate, 05:01 UTC

Runtime candidate `26ae2be` passes all 197 discovered test files: 1,249 passes,
zero failures or cancellations, and two expected production-stage skips whose
cases passed in development. The isolated run completed from 04:15:54 to
05:01:40 UTC in 45.75 minutes across 211 execution groups. All 1,795 tracked
source files match the frozen commit after cleanup. Production HTML/RSC privacy,
fresh migrations, synthetic backup/restore and the production build pass.

The seven browser groups exercise the unchanged application implementation;
only public release metadata, documentation and the QA script differ from that
browser export. The full gate tests the final metadata and source. Live release
notes, serving identity and privacy checks remain required before acceptance.

At 04:58 UTC, all 104 production/source/installed migration checksums match,
with none pending. The installed encrypted restore verifies 144 tables with
plaintext removed; 83 retained backup sets have no issues. A read-only snapshot
of all 144 original production tables is saved for the post-verification
comparison. No schema, migration, dependency or provider configuration changes.
