# Private draft composer and safe update notice

11 September 2026 · Focused interface batch in `godschurches-medium`, branch
`codex/draft-controller-update-batch`, based on released `79eae74`.
The requested route was Astra Medium; task labels do not establish runtime model
settings. Existing reply-permission, session, version and exact retry contracts
are reused without backend or migration changes.

## Implemented

- `40b8380`: persistent in-memory composer controller; five-second autosave,
  truthful save states, serialized exact-body retries, deliberate conflict
  review/reload or Save as new, and publication through the draft service.
- `0f06804`: library Resume uses that controller, preserves full snapshots and
  acknowledged ID/version, protects current dirty work, and renews ephemeral
  previews explicitly. Deleted drafts and revoked access preserve current work.
- Safe update notice captures the rendered build once across client navigation,
  checks explicitly or on throttled foreground return, and offers clean refresh
  only. Dirty/saving/conflict/uncertain work prevents refresh. Offline recovery
  retains the current tab's work and rechecks sign-in.
- Account changes clear draft state and pending requests; publishing choices are
  tied to their verified owner. No draft browser storage, service worker,
  CacheStorage, automatic reload or push permission was added.

## Verification

- Nine controller/installation policy checks passed, including legacy null reply
  choices, both explicit modes, debounce, exact response-loss retry, conflict
  recovery, publish-once and account switching.
- Twenty-four workspace, canonical publishing and search service checks passed;
  populated additive upgrade and dump/restore preserve constraints and receipts.
- Ten existing local HTTPS workspace/export checks passed.
- Ten combined HTTPS browser groups passed with isolated fictional accounts.
  Cover both reply modes, two-context resume, dirty replacement choice, deletion,
  response loss after committed saves/publication, account switching, preview
  renewal and revoked church access. Preview renewal uses a synthetic provider
  response; publication/access checks use the real isolated API/database.
- Update browser checks cover old rendered/new endpoint identity, equal/missing
  endpoint metadata, client navigation, foreground throttle, explicit clean
  refresh, offline recovery, and dirty/in-flight/conflict refresh suppression.
- Lint, type checks, production build and runtime traces pass: 105 traces,
  8,514 entries, 257 server JavaScript files; no private fixtures/environment
  files or Prisma configuration-loader paths in deployment traces.
- Read-only production migration inspection: 27 complete, zero pending, all
  checksums match; zero production application writes or migrations.

The final rebuilt ten-group browser run and ten existing draft-library/manifest
browser regression groups passed. Production release verification is pending at
this checkpoint; deployment identity and live evidence will be recorded after release. Parent integration, rich image/poll/scheduled draft foundations,
physical Samsung/iOS installation and owner acceptance remain open. No owner
notification was sent by this batch.
