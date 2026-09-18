# Community settings implementation and acceptance

September 18, 2026. Communities and interests adds two canonical group links and
four related personal settings destinations. Help, search and release notes are
updated. The [ownership contract](COMMUNITY_SETTINGS_CONTRACT.md) records current
capabilities and gates for RSVP defaults, artist/music, storefront and Foundry.

This is navigation and guidance only. No service, schema, preference value,
notification default or permission changes. Application commit
`25eb4a1ffba75e5875a23938cd3a4f428e7e2f27`, version **2026.09.18.5**, is READY in
`dpl_D5oMRMA3Zek6seqPCvFoYQuCWGkb` at **12:09:55.440 UTC**. Independent
canonical-domain assignment and serving identity match at **12:10:50.887 UTC**.

Local acceptance: fifteen focused settings, navigation, Help and release tests
pass. Eight new Communities browser scenarios cover canonical destinations, all
six links and Back, actual contact save/reload, separate initially-off phone
choices, denied/retry, stale-account concealment, enlarged 320-pixel layout and
guest return. The six-scenario existing Settings browser regression also passes,
including lost acknowledgment, conflict, dirty-work protection and current role
refresh. An initial guest-return test expected signup rather than the existing
Join entry; the expectation was corrected and all eight scenarios reran.

Build, TypeScript, copy and lint pass; lint retains existing warnings and has no
errors. Two presentation components were reviewed for stable hooks, access
concealment, semantic links and keyboard behavior. No service or schema changes
are made, so the preceding Gather 184-file regression remains the service
baseline; these browser and focused checks verify the new presentation delta.

Runtime measurement compares the same Settings route plus shared layouts with
the preceding Gather production build: 635,732 to 638,391 raw bytes and 193,598
to 194,191 per-file gzip bytes. The difference is 2,659 raw and 593 gzip bytes,
with no additional dependencies, database queries or service endpoints. These
are bundle measurements, not claims of improved live response time.

Live acceptance passes 65 public/privacy checks and six protected health checks.
Existing signed-in Mac Chrome verifies the Settings entry, all six Communities
destinations and privacy guidance, and the canonical contact form with its saved
value unchanged. The observation is read-only, not a physical-phone test.
All 99 migration and recovery checksums match. The current installed encrypted
restore verifies 144 application tables and removes plaintext; nightly checks
cover 75 sets with no issues or removals. All 144 production table fingerprints
are unchanged through 12:14:34 UTC. Verification application writes and recipient
sends are zero. One reserved nonexistent-source queue probe is accepted and
consumed; scoped runtime error/fatal rows are zero through 12:13:47 UTC.

The extension-slot contract is complete. The broader event-preference task
remains open for a canonical saved RSVP-disclosure default. Physical-device and
actual operator/pilot evidence remain separate.
