# Account-owned Menu shortcuts

The Menu lets a signed-in member select up to six working destinations, arrange
their order, save them to their account and reset them. A second signed-in session
reads that saved order. Guests retain the existing Menu without an account editor.
The choices come from the existing navigation registry and current administration
authority. They never grant access or activate a future destination.

## Ownership and recovery

`SocialPreferences` owns the ordered IDs and a separate shortcut version. Saving
does not modify its other preferences or their versions. The current account is
resolved from the session, checked against the expected-account header and locked
inside the existing shared permission boundary. Strict bounded commands use the
existing social-operation receipts and expected-version checks. A lost reply can
confirm exactly the original request. A competing device cannot silently replace
newer choices. Unsaved choices block link navigation and browser Back; discarding
local edits, resetting saved choices and reloading after conflict each require a
specific confirmation.

Reads resolve stored IDs against the currently permitted registry. Forbidden,
unknown and disabled IDs never appear in the returned choices or saved links.
Writes recheck that authority before receipt replay as well as before a new save.
Admin retains its source-owned eligibility, capability and privileged-session
requirements. Private responses use `no-store`; the existing private snapshot
guard conceals stale state during account changes and access rechecks.

A same-version server refresh can remove a formerly available choice while the
editor remains mounted. The editor then shows a generic unavailable row, allows
its removal and blocks saving until all selected choices are available. The
mounted owner/version baseline records whether removal changes the saved choices,
even when newer authority-filtered props omit that choice. Explicit discard
returns to that baseline without writing; saving removal persists it even if
the original authority later returns. Reset
remains available even if every stored choice has become hidden. No former
destination label, URL or capability metadata is supplied by the new read.

The owned account export includes shortcut IDs and their version. Existing
permanent erasure removes their `SocialPreferences` row. Shortcuts contain static
navigation IDs, not audience, consent or access grants. Restored IDs are projected
through current authority before display or mutation; no additional retention
journal kind is introduced.

## Migration and configuration

Apply `20260918184000_menu_shortcuts`, then generate the matching Prisma client
before serving the new code. It adds two defaulted columns and database bounds:
at most six non-null IDs, at most 480 serialized bytes and a nonnegative version.
Its SHA-256 is
`bf7a9f2b37052baf7a06bf1aa3383229cdc0ed6fa95d6976c68ea934b646201d`.
The integration owner settles ordering with any other unmerged migrations.
No provider credentials, environment flag, dependency or background job is added.

The production build contains 224 traces, 75,118 trace entries and 558 server
JavaScript files and passes the private-artifact trace check. One isolated
unprivileged read returned 27 enabled choices in 4,366 JSON bytes and used 13
database statements, including transaction begin and commit. The Menu reuses
that read for its optional Admin entry instead of repeating the former Admin
navigation lookup. These observations are a local cost inventory, not a latency
or production capacity claim.

## Original candidate verification, 18 September 2026

- Five service tests cover another session's saved order, six-choice bounds,
  unrelated preferences, current authority, exact receipt replay, competing
  versions, malformed and foreign-owner requests, private headers, deactivation,
  owned export and permanent erasure.
- Seven built HTTPS browser groups exercise the actual editor, two independent
  browser contexts, ordering, keyboard use, unsaved link and Back protection,
  explicit discard and reset, lost replies, conflicting edits, account switching
  and revoked Admin access during a same-version refresh without remounting the
  editor. No browser runtime errors occurred.
- All five existing navigation browser groups pass, including guest/member
  destinations, current Admin authority, Exchange history/filter/scroll behavior
  and enlarged narrow-screen layout. Shortcut screenshots at 320, 390 and 1,440
  pixels with doubled root text remain bounded.
- TypeScript, production build, hydration repair, copy rules and runtime trace
  checks pass. Lint has zero errors and 35 existing unrelated warnings.
- All 101 migrations applied to a fresh isolated local database. A complete dump
  restored six preference rows with the identical digest
  `24cede633c9300d352616793fbf207ec` and all 101 migration records.
- The complete account, portal and support regression gate passed all 189
  discovered test files: 1,219 passing executions, zero failures and two expected
  development-only email skips in the production phase. Populated upgrades,
  complete restore, fresh migrations, process restart, development HTTP and
  production HTTPS HTML/streamed-response privacy checks passed. All five new
  shortcut service tests also passed inside that complete run.

Focused review identified the removed-choice null dereference before handoff.
The implementation now handles that state, and the mounted-editor browser case
verifies the repair. All test accounts and database writes are fictional local
fixtures. No production changes or external messages were sent.

## Returned correction, 18 September 2026

Integration review found that removing an unavailable choice could compare equal
to newly filtered server props and incorrectly disable Save. The editor now keeps
its baseline for the lifetime of the existing owner/version key and uses it for
both dirty comparison and explicit discard. New versions still remount it through
the existing key. This correction adds no service, schema, migration, dependency,
configuration or request cost.

The expanded browser case checks enabled Save after removal, discard without a
write, persistence of only the remaining choice, absence of the removed shortcut
after authority returns and reset of hidden stored IDs. Five focused service tests
and scoped lint pass. The final production build, TypeScript, copy, hydration
and runtime-trace checks pass. All eight shortcut browser groups and all five
existing navigation browser groups pass with zero page errors.
The full 189-file gate above belongs to the original candidate and is not claimed
rerun for this editor-only correction.

## Integration acceptance

This feature is locally implemented and tested, ready for integration. The
integration owner must combine the changes, apply
the compatible migration/client and recovery setup, run combined release gates
and verify the actual serving release before closure. Automated independent
browser contexts demonstrate persisted account behavior; physical-device
acceptance must not be inferred from browser automation.

## Release copy

Choose up to six Menu shortcuts, arrange them in your preferred order and keep
that order when you sign in on another device. Reset your shortcuts at any time.
Only destinations currently available to your account can appear.

## Combined migration ordering, 18 September 2026

For integration after the applied price-order index, the unpublished candidate
migration `20260918184000_menu_shortcuts` becomes
`20260918223600_menu_shortcuts`. SQL contents and checksum are unchanged.
The original A2 fixture history remains preserved in its isolated environment.
Combined verification and production application remain open at this checkpoint.

## Combined integration acceptance, 18 September 2026

The combined runtime candidate `6a2a0e4` passes the complete isolated support
gate: 194 discovered test files, 208 execution groups, 1,237 passing
executions, two expected production-stage skips and zero failures or
cancellations. Both skipped email cases pass in the earlier development stage.
The actual command exits successfully after 49.80 minutes of machine runtime.
Fresh migrations, populated upgrade and restore, process restart, development
HTTP and built production HTTPS HTML/RSC privacy checks pass.

The independent production build, TypeScript and scoped lint pass. Thirty-five
built HTTPS browser groups pass with zero page errors: eight Menu shortcut, six
profile module, five existing profile settings, five Menu navigation and eleven
navigation/calendar journey groups. Narrow layouts and enlarged text were
inspected. One attempted browser runner filename did not exist and ran no tests;
the corrected existing runner completed successfully. The final source review
found no integration blocker. These are automated local checks, not physical
device observations.

The combined build contains 224 runtime traces, 74,462 trace entries and 558
server JavaScript files. This is a cost inventory, not a performance improvement
claim. A fresh encrypted production-copy rehearsal upgrades 101 migrations to
103, preserves all 144 original table/column fingerprints, completes protected
replay and removes temporary plaintext. Production is unchanged at this local
checkpoint. Publication, installed recovery-registry propagation and exact
canonical-domain live acceptance remain required.
