# Featured profile resources

October 6, 2026 UTC. Locally verified and ready for integration. Not merged or live.
Application and browser QA `2356885964648e6d500f90d344ab133913cfa3db`, production
build `yB8ycJbNab2ZsF7lHzjzY`.

## Behavior and boundaries

Members can check, add, reorder and remove up to six listing, opportunity or media
references in the existing profile editor, then save the collection explicitly.
The canonical post pin and selected calendar event retain their existing behavior.
Only references enter profile JSON. Newly added choices require current eligible
owner access in the same versioned save transaction. Omission by older editors
preserves saved choices; explicit empty collections remove them. Existing unavailable
choices can be retained, reordered or removed without blocking other profile edits.

Each viewer read rechecks profile access, the current selection and canonical source
permissions. Generic member preview assumes no owner or church grants. Visitor
preview remains identity-only. Member HTML/RSC omit raw featured IDs and copied
source metadata. Current client cards contain only permitted narrow projections.
No hidden-reference counts or per-item private placeholders are exposed.
Successful empty or fully inaccessible collections hide the reader section. Its
observer remains mounted so newly permitted content can appear after a current read.
Owners retain controls to remove unavailable saved choices.

Visible focused cards refresh at a bounded 30-second interval. Blur, offline,
identity or route changes, failed reads and the 10-second request deadline conceal
them. Accepted cards are bound synchronously to viewer, profile ID, username,
presentation version and preview identity. An independently settled abort prevents
stalled transport from holding expired cards or preventing a fresh retry. Browser
throttling still means this is not instantaneous revocation or process-memory erasure.

The mounted editor retains unsubmitted link text and selected references on
concealment. Immutable save retries and deliberate version review preserve uncertain
writes. Featuring resources changes no source audience, participation or provider
configuration. Existing opaque module recovery, export and erasure remain the owners.

## Verification

- 32 registered input, real PostgreSQL, profile module/recovery, calendar, pin and
  saved-resource checks passed at `73434e4`. All 124 populated migrations and an
  actual workspace dump/restore passed. Subsequent application changes were the
  equivalent raw-reference omission, client cancellation hardening and empty-section
  presentation, covered by
  final HTTP, component and browser checks.
- Six production HTTPS checks passed at the final application: strict current-account
  API validation and caching, guest/member/preview HTML/RSC boundaries, existing
  profile conflicts and calendar audience/write behavior.
- Thirteen actual-component controlled-hook checks passed: four pre-effect identity
  changes plus nine profile-ID, held-response, foreground, deadline and coalescing
  cases. These model lifecycle and transport behavior; they are separate from native
  browser acceptance. A deliberately noncooperative transport reproduced the deadline
  robustness gap before the fix.
- Twenty-one production-browser groups passed with zero page errors: eight featured
  resource flows, eight existing module flows and five profile/settings/photo flows.
  They cover actual add/order/save, current audience previews, focused withdrawal,
  native two-window foreground changes, offline/resume, retained link/selection,
  committed-but-lost save with identical retry bytes, explicit conflict review,
  upload retry preservation, empty/inaccessible section omission with current-access
  recovery and 320-pixel enlarged-text layout. The featured runner
  observed zero external requests. The viewport capture was visually inspected.
- Production build, types, changed-source lint, copy, hydration, runtime traces,
  source-security and diff checks passed. Build lint retains existing repository
  warnings. Runtime trace verification inspected 256 traces, 63,523 entries and
  633 server JavaScript files without private fixtures or environment files.

The first focus attempts retained failed evidence: headless automation did not
produce a native focus change. A headed browser with forced focus disabled supplied
that acceptance. The older profile browser expectations also needed the new explicit
empty collection field. A corrected QA rerun completed twenty groups on the prior
verified build. Final review found an empty reader placeholder; the final application
hides it, and a new complete build/HTTPS/browser run passed all twenty-one groups.
All owned browsers, server and fictional databases were closed afterward.

## Integration and remaining acceptance

No new migration, dependency or provider configuration. Keep the decoder,
omission-preserving writer and editor together: an older strict decoder is not a
compatible rollback after a featured collection is saved. The existing protected
module recovery contract applies.

No main push, production migration, application-row write, recipient send or deployment
was performed. The designated release owner must reconcile compatible prepared work,
resolve the held dependency-security gate, verify the combined release and confirm
the canonical serving build before closing this feature. Media playback/provider and
physical-device acceptance remain separate. Final independent handoff review is
recorded with the private evidence receipt.
