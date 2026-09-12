# Searchable Settings

## September 12, 2026 candidate

Product `2026.09.12.10` adds a grouped Settings home, account summary, folder and
detail routes, approved synonym search, and desktop folder navigation. Existing
account, profile, relationship, directory, calendar and church tools retain their
own service and permission boundaries. Unsupported features have no active switch.
See the [inventory](SETTINGS_INVENTORY.md) and [contract](SETTINGS_CONTRACT.md).

Search reads static labels, descriptions, aliases and folder paths. Private
values are excluded. Back preserves the originating query and scroll position;
deep links retain a route to their folder and a validated sign-in return. Current
session context is private and uncached. Account switches clear old context;
permission refresh conceals controls until verified. Failed reads retain mounted
forms, and retry restores access to their unchanged unsaved input.

Relationship privacy reuses explicit Save, exact-body retries and versioned
conflict review. Discard accepts the last confirmed state, including a deliberately
reviewed newer server version. Browser reading choices retain failed saves, offer
retry/discard, and confirm persistence by cookie readback. Restore display defaults
previews only the five display fields. Navigation, native Back and the existing
safe update notice preserve unresolved work. Reading release notes performs no save.

Verification actually run:

- Six isolated production-HTTPS browser groups cover search, query/scroll return,
  reset isolation, storage failure, discard/retry, lost acknowledgement, conflict,
  failed context recovery, native Back, update notes, revoked church grants and
  account switches. Guest private reads fail, arbitrary settings writes return 405,
  and unknown detail routes return 404.
- Phone/desktop widths of 320, 390 and 1440px retain reachable controls with doubled
  root text. Keyboard search-to-detail works; save feedback uses live status roles.
  Screenshots were inspected. This is not physical assistive-device acceptance.
- Resource, Settings, reading and release-content checks passed. The focused draft
  and reader-navigation regressions preserve existing retry and reply behavior.
- TypeScript and production build passed; 121 runtime traces, 10,289 entries and
  299 server JavaScript files passed artifact guards. Full lint has no errors and
  retains 37 pre-existing fixture-helper warnings.
- A fresh encrypted PostgreSQL 17 backup was authenticated and restored locally.
  Thirty migration checksums match; all 75 original tables retained their column
  fingerprints through a no-op migration rehearsal. Plaintext restore files were
  removed. No production data or permission was changed.

The candidate is verified locally; publication and canonical serving identity are
pending. No schema, dependency, provider, policy or real account/content mutation
is required. Parent integration and owner/device acceptance remain separate.
