# Regional formats and private profile location

## Verified canonical release

**2026.09.16.6 / ed6c89457912a0ab4ec53c13dbf7761b0f378e7c** is READY in
**dpl_3sUKNMQqS1ebqfs7MyL6wfewfCME** at **09:01:17.516 UTC** on September 16,
2026. Independent canonical alias lookup and the serving release/product-build
identity match. Runtime candidate `8d4134e` has only isolated test fixes afterward.

The complete `npm run test:support` gate passed at 08:53:56 UTC: all 171
discovered files, 185 test invocations, **1,034 passes, zero failures and two
expected skips**. Fresh migration, protected recovery, production/development
build, real HTTPS and restart coverage are included. All **16 production-browser
groups** pass: seven regional/privacy/support/demo, four language/discovery and
five profile-editor groups, with zero browser errors. The original five static
demo checks pass unchanged. Failed earlier gates below remain historical evidence.

Live verification passes **23 public/access checks**, **four health checks** and
**three signed-in read-only inspections**. The actual account shows default date
and time choices, preview/save controls, independent Only me/permitted-member
location choices, and unchanged private discovery entry. No real preference,
profile, read-state or other user-data change was made. The public renderer bytes
match the hash from this provider build. Scoped error/fatal logs from 09:01:17
to 09:07:54 UTC contain zero rows. Verification writes and sends are zero.

All **90 production migration checksums** match; the one additive migration
applied at 08:58:44 UTC. All original-column fingerprints across **121 tables**
match the 08:48 baseline at 09:08:24 UTC. Existing account preferences retain their
defaults; no regional/privacy edits or recovery holds were created for testing.
The installed recovery registry now has 90 checksums. Its ordinary daily copy
restored all 90 at 09:00:10 UTC, and nightly validation passed with no attention
or expiry actions across 58 encrypted sets. Ordinary daily recovery did not run
protected replay; that separate production-copy upgrade passed at 06:49:29 UTC,
preserving all original columns and completing protected replay without modifying
production. Restored plaintext was removed.

Provider build checks pass with 190 traces, 60,177 entries and 477 server JavaScript
files. The final local build separately has 190 traces, 43,947 entries and 478
server JavaScript files. Against the prior build, unique emitted JavaScript at
gzip level 9 changes by **+1,981 bytes Settings, +2,780 profile, +1,332 Home and
+1,239 event details**. These are asset measurements, not latency or transfer claims.
No extra startup request, dependency or provider was introduced. Physical devices
and assistive technology remain unverified. The same-feature optional device
helper follows immediately; translation and family launch remain distinct gates.

## Preserved implementation and verification history

The prior verified integration release was 2026.09.16.5, documented in
[Language and location acceptance](LANGUAGE_LOCATION_ACCEPTANCE.md).

The [contract](REGIONAL_PREFERENCES_CONTRACT.md) separates account date/time
presentation, source event zones, content-language discovery and profile-location
disclosure. New scalar account preferences reuse the session projection without
an additional startup request. The Settings control supports previews, account
pinning, conflicts and identical retries after an uncertain save. English remains
the supported interface language; translation is not implied.

Profile location uses the existing versioned editor plus an independent privacy
version. Only me is removed from another member's and member-preview DTO; visitor
previews still load only public identity. Verified adult eligibility is required
to choose member disclosure. Legacy editors cannot broaden a hidden audience.
Opaque protected controls contain no location text. Restore clears older text,
uses Only me and requires review; a stale privacy version cannot republish it.
Owned exports include the choices, and permanent erasure clears them.

The additive migration preserves existing field values, display defaults and
permitted-member location behavior. Its isolated first rehearsal caught an
incorrect constraint reference to an operator column stored inside JSON. The
transaction rolled back without adding columns; the corrected migration applied.
The failed and successful isolated receipts are retained privately.

Focused service coverage initially passes 19 checks: date/zone and invalid-data
formatting, account persistence and retry conflicts, profile disclosure and
restriction, opaque restore, export/deletion, existing profile and Settings
regressions. A separate all-day multi-zone regression was added afterward for the
complete gate. Early photo regressions used the preview storage path and then
enabled photo-history behavior; correcting the isolated runner's baseline made
the unchanged profile tests pass. These runner mistakes did not change production.

Remaining before completion: complete application/migration/restore gate,
production browser flows and layout inspection, protected production-copy upgrade,
runtime/bundle checks, exact READY and canonical release, live read-only behavior,
postflight data comparison and migration registry installation, then task-system
readback. No actual members' preferences have been changed for verification.

The first six production-browser groups passed on `7a8e089`, with zero browser
errors: doubled-text phone/desktop layouts, account persistence, exact retry after
accepted response loss, conflict retention, cross-zone event/all-day display,
member/preview HTML disclosure, restricted sharing, restored-location review and
account/read failures. The selector-label repair preceded these checks. Browser
test corrections address native select keyboard assumptions and the existing
"Location:" text prefix; their initial failures remain in the private evidence.

The complete gate found a legacy unverified-profile regression: old clients have
no audience field and could not save their optional location text. The service
now saves that new text as Only me, retaining the existing profile-edit flow
without inferring disclosure. The original HTTP regression remains and adds an
explicit private-audience assertion. Nine focused formatter/privacy tests pass
after this correction. A subsequent timestamp audit also integrates source wall
times in event-series, upcoming-event, poll and scheduling labels without zone
conversion. These finishing changes still require the final browser/build and
complete-gate receipt below before publication.

The production build and browser checks on `7fe0c6b` pass all six regional
groups, four language/discovery groups and five existing profile-editor groups
pass with zero browser errors. Narrow and doubled-text screenshots were reviewed.
Recurring-event dates and source-zone labels are covered. The original account
repair suite passes all six checks, including its unchanged HTTP save flow and
the new private-location assertion. A separate keyboard diagnostic reproduces
the native select arrow-key limitation in plain HTML in the same headless Mac
Chrome; Tab navigation and selection/save behavior pass. This does not claim
physical-device or assistive-technology verification.

The encrypted production-copy upgrade completed at 06:49:29 UTC, applied all 90
target migrations, preserved original columns across 121 tables and completed
protected replay. It made no production writes. The production build verifies
190 runtime traces, 43,947 trace entries and 478 server JavaScript files. Unique
emitted JavaScript gzip totals increase by 1,979 bytes on Settings, 2,780 on the
profile editor, 1,332 on Home and 1,239 on event details against the prior release.
These are build asset comparisons, not network-transfer or latency measurements.
No dependency, provider or additional startup request is introduced.

The full gate on `7fe0c6b` stopped at the demo isolation check after the account,
HTTP, regional, privacy and remaining service regressions had passed. The shared
support presenter imported the live client formatter. The repaired shared
presenter is static again, while a separate live wrapper supplies regional time
elements; the original five demo tests pass unchanged. A follow-up projection
audit also found missing format fields in church, support and admin viewer
snapshots. Their existing queries now select and project the acting account's
two format fields. Three regional service groups pass, including all six viewer
paths and another account's unchanged defaults. New browser coverage checks live
support/admin dates alongside static demo routes. This correction still requires
the rebuilt browser checks and a fresh complete gate before release.
