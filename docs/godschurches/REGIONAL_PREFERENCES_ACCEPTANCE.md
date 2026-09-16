# Regional formats and private profile location

September 16, 2026 UTC. Candidate for 2026.09.16.6; not yet a live completion
receipt. The prior verified release is 2026.09.16.5, documented in
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
