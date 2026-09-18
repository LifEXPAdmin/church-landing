# Optional profile section implementation

September 18, 2026 UTC. Implementation and local acceptance pass, including the
complete isolated regression gate. Integration and verified release remain open.
See [the typed contract and reserved slots](PROFILE_MODULES_CONTRACT.md).

The existing profile editor now saves bounded testimony, skills and labeled links.
Filled sections appear in About; clearing fields removes them. Existing name,
biography, introduction, appearance/order, photos, location privacy and canonical
pinning keep their current owners. Calendar and featured-media slots are reserved
and reject input until their source and audience adapters exist. No blank module
navigation or fabricated source cards are shown.

Writes reuse the owner-bound profile version and conflict review. Member and
visitor projections exclude hidden contacts; malformed module JSON fails closed.
Text is inert and links are validated HTTP/HTTPS anchors, without embedding or
prefetching source content. The profile request accepts bounded multilingual data
up to 32 KiB while other account operations retain 8 KiB.

Migration `20260918173000_profile_modules` adds bounded JSON and a recovery version
to `ProfilePresentation`, and extends the existing journal constraints. Every
explicit module save records an opaque recovery receipt in the same transaction.
Protected replay clears older restored content, advances stale editor versions
and handles a missing old presentation row. Newer reviewed modules survive old
receipts; erased accounts remain erased. Existing exports include owned modules,
and existing permanent erasure removes the presentation.

## Original candidate verification

- Twenty-one focused profile/module/location/pin checks pass after correcting the
  initial migration's missing journal constraints. The first run had 17 passes
  and four failures; it is not counted as passing acceptance.
- After review identified the HTTP byte-limit mismatch, six module/recovery
  checks pass, including valid multilingual text and oversized rejection. These
  overlap the prior 21; together they cover 22 distinct focused checks.
- Five new built HTTPS browser groups pass: guest denial; real owner form save
  and inert text; member/visitor privacy and enlarged layouts; rejected links and
  committed-but-lost conflict review; empty-section removal and recovery journaling.
  Five existing profile-settings browser groups also pass, including image retries,
  retained text, contact navigation and stale-version review. Page errors are zero.
- The initial new browser run stopped after three groups because saved textarea
  content polluted its label. Separating label and control fixes the accessible
  name; the final complete five-group run passes. Phone and desktop images were
  inspected, with no script execution or external link requests.
- TypeScript, scoped lint, website copy, formatting/diff and production build pass.
  Runtime trace validation reports 223 traces, 74,692 entries and 556 server
  JavaScript files without private fixture/environment material.
- A fresh 101-migration fictional database matches the final migration checksum.
  A separate dump/restore preserves all 20 populated presentation records and
  their exact data hash, including module JSON and versions. Protected replay is
  tested with stale, absent, current and erased records.
- The complete isolated support gate exits successfully: all 188 discovered test
  files pass, with 1,215 passing executions, zero failures and two expected
  production-phase skips for development-only email checks that passed earlier.
  Coverage includes staged upgrades, full dump/restore, fresh Prisma migrations,
  production build, development HTTP, production HTTPS HTML/RSC privacy, actual
  process restart and every remaining discovered regression file. Both new module
  test files pass within this complete run.

No production data, real recipients or provider credentials were used. Temporary
browser services were stopped before the broad gate. Test fixture bootstrap needed
a shorter local socket path; the corrected isolated cluster is the final fixture.
An earlier preliminary migration fixture is preserved separately and excluded
from final acceptance. No production migration or deployment has occurred.

## Returned validation correction, 18 September 2026

The account boundary reproduced a server-unavailable response for an 18,596-byte
module document made from control characters, despite the body fitting the HTTP
limit. The shared text decoder now rejects unsupported C0 controls, DEL and lone
UTF-16 surrogates before a write. It preserves tab, LF, CR, multilingual text and
valid emoji pairs. The same decoder keeps malformed stored values out of member
projections. No schema, migration, dependency or configuration changed.

Eight focused module and protected-recovery checks pass. They cover every rejected
character across all four text fields, seven invalid HTTP bodies returning 400
without account, presentation or recovery changes, and a maximum-length multilingual
module save within the actual PostgreSQL byte bound. The final production build,
types, copy, hydration, runtime traces and scoped lint pass. Six final built HTTPS
module browser groups and five existing profile-settings browser groups pass
with zero page errors. The real form returns HTTP 400 for unsupported control
text, retains the editable draft and leaves profile and recovery records unchanged. The complete 188-file gate above belongs to the original
candidate; it is not claimed rerun for this bounded validator correction.

## Release requirements

Integrate with current main, apply the additive migration in the agreed ordering,
regenerate the Prisma client and propagate compatible protected-recovery support.
Verify the combined release and actual profile behavior before closing the task.
No provider configuration or new dependency is required. The new reader uses the
existing presentation query; payload and form sizes are bounded. Module writes
add one existing opaque journal receipt and its bounded protection attempt. No
measured performance gain is claimed. New module ordering, featured collections
and physical-device acceptance remain separate.

## Combined migration ordering, 18 September 2026

For integration after the applied price-order index, the unpublished candidate
migration `20260918173000_profile_modules` becomes
`20260918223500_profile_modules`. SQL contents and checksum are unchanged.
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
