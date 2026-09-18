# Community settings implementation and acceptance

September 18, 2026. Communities and interests adds two canonical group links and
four related personal settings destinations. Help, search and release notes are
updated. The [ownership contract](COMMUNITY_SETTINGS_CONTRACT.md) records current
capabilities and gates for RSVP defaults, artist/music, storefront and Foundry.

This is navigation and guidance only. No service, schema, preference value,
notification default or permission changes. Production remains Gather
2026.09.18.4 while exact release and live checks are pending.

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
the preceding Gather production build: 635,732 to 638,380 raw bytes and 193,598
to 194,184 per-file gzip bytes. The difference is 2,648 raw and 586 gzip bytes,
with no additional dependencies, database queries or service endpoints. These
are bundle measurements, not claims of improved live response time.

The extension-slot contract is complete. The broader event-preference task
remains open for a canonical saved RSVP-disclosure default. Physical-device and
actual operator/pilot evidence remain separate.
