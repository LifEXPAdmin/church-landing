# Navigation registry

The primary navigation and Menu use `lib/platform/navigation-registry.ts` for destination names, URLs, icons and placement. The five working primary entries remain Home, Churches/My church, Explore, Messages and Menu. Menu groups the remaining destinations under Community, Discover, My activity and Account, with separate sharing, installation, authorized administration and website information sections.

Exchange and Gather use their implemented source resource contracts. Future Media, Businesses and Foundry modules have no usable placeholder entries. A future module needs its real page, implemented source adapter and appropriate placement before joining the registry. The route test resolves every destination against the actual App Router tree and checks that every declaration has a navigation placement.

## Access and rendering

The registry describes navigation, not permission. Private destinations continue to read the current account and enforce source-owned access at their existing pages and services. Guest profile, calendars, commitments and settings retain their existing account gates. Member-only Menu entries require an account; Admin additionally requires the existing server read of currently permitted administration sections. Its optional read fails closed.

The full catalog is read by Server Components. The client primary navigation receives only five resolved link records, with no profile username, descriptions or resource catalog. Existing message badge ownership, active links, measured navigation height, account switching, session boundaries and reviewer navigation remain in place. This change adds no API, database query, persistence, migration, provider or environment setting.

Every destination remains a native link. Menu sections have named headings; decorative icons are hidden from assistive technology. Account entry return paths and QR/profile destinations continue to use the existing current-account behavior. Existing contextual Back and source freshness boundaries remain responsible for history and unavailable content.

## Verification

Focused tests in `tests/navigation-registry.test.ts` cover primary destinations, guest/member and administrator visibility, real route resolution, implemented optional resources, registry reachability and independent account projections. `scripts/qa-menu-navigation-browser.mjs` requires a separate local HTTPS preview and fictional database guarded by `assertPortalTestDatabase`; it blocks browser requests outside that preview and disables external delivery.

The browser checks guest keyboard navigation, real Exchange/Gather pages, account gates, member profile/QR/private destinations, current/revoked administrator access, account switching, calendars and header Settings, filtered Exchange detail/Back history and scroll, desktop/320px layout, doubled root text and runtime errors. These browser sizes are emulation, not physical-device acceptance.

Local candidate checks passed on 18 September 2026: all four focused tests, five built HTTPS browser groups, TypeScript, copy verification and the production build, including hydration and release-trace checks. Lint has zero errors and 35 existing unrelated warnings. A focused review caught a missing persistent bookmark-help entry; it was restored and its keyboard dialog/focus behavior passed before the final browser run. Desktop and enlarged narrow-screen screenshots were inspected.

The complete isolated `test:support` gate passed: 186 discovered test files, 1,202 passing checks, zero failures and two expected production-phase skips of development-only delivery cases. Populated upgrades, backup/restore, fresh migrations, development HTTP, production builds, HTTPS and restart checks passed. The final source hashes matched the frozen browser-tested candidate. Integration and verified release remain separate acceptance steps.

## Proposed release note

Menu now organizes existing destinations into Community, Discover, My activity and Account. The five primary navigation links stay familiar, and available features share one destination registry.

[Shared screen patterns](SCREEN_PATTERNS.md) define list, detail, form, confirmation, recovery and unavailable states using current source owners. Persisted Menu shortcuts and broader cross-feature Back verification remain separate work. This registry does not activate unfinished modules or assert their acceptance.
