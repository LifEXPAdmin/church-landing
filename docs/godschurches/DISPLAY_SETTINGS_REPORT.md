# Display preview verification

September 12, 2026. See [the display contract](DISPLAY_SETTINGS_CONTRACT.md).

The advanced Display form previews appearance, readable post text and List/Pages
layout in sample cards before explicit Save. It reuses the existing five-field
browser preference provider and confirmed cookie readback. Footer appearance
keeps immediate saving. Unsaved previews and failed saves use existing navigation,
native Back and safe-update protection; retries preserve exact choices and
confirmed reset remains browser-only. No account theme, privacy, draft audience,
provider or schema changes are introduced.

## Checks

Six focused built-browser groups verify staged appearance/text/layout without
persistence, keyboard sample navigation and visible focus, in-app/native Back,
safe-update protection, discard, exact five-field save/reload, live OS-theme
inheritance, explicit overrides, profile/relationship isolation, blocked storage,
identical retry writes, confirmed reset and actual focused-reader motion rules.
Both device reduction and the explicit saved motion preference suppress real
page-turn animation. The 320/390/1440px doubled-text check caught intrinsic
fieldset overflow; bounded fieldset sizing and reduced nested phone padding
repair it. Selected layout labels are concise with separate explanations.

Six existing Settings browser groups and five photo-recovery groups pass,
including exact social retries/conflicts, scope/account changes, preserved upload
work, one-photo reduced-data galleries and revoked image access. No browser
errors. Twenty Settings/navigation/release tests, types and production build
pass. Full lint has zero errors and 37 existing unused-fixture warnings; changed
components and the focused new browser script pass scoped lint.

Production build verifies 121 runtime traces, 10,292 entries and 300 server
JavaScript files without private fixtures or environment files. Fixture data and
browser artifacts remain private. Automated motion/theme emulation and keyboard
checks do not replace physical phone or assistive-device acceptance.

## Release status

Product `2026.09.12.15` is prepared. Exact READY deployment, canonical assignment
and live read-only checks remain required before marking it live. Existing
Privacy release remains live until that verification. No migration or production
application-data change is part of this milestone.
