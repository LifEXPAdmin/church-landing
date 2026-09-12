# Data settings verification

September 12, 2026. See [Data contract](DATA_SETTINGS_CONTRACT.md).

The Data folder explains supported sharing and sign-in controls, shows read-only
camera/microphone/location permission status with browser help, and separates
deactivation from export. Search finds the browser-permission guidance. Export and
closure descriptions now reflect the actual albums, drafts, collections, polls,
volunteer and calendar records. Existing service projections, retention,
confirmation and access checks are unchanged.

## Verification

Six account-export and nine lifecycle service/HTTPS groups pass: explicit owner
fields, current password/session binding, expiration and credential revocation,
bounded archive failures, no-store attachment/origin checks, explicit closure
intent, all duty-handoff categories, access revocation and retained records,
reactivation, suspended/legacy denial, concurrent duty assignment and recovery.
The historical export HTML assertion now targets the current Data detail route;
the actual hydrated form and expiry are exercised in the browser suite.

Three focused resource groups pass for personal photo, album and private-draft
export/lifecycle behavior, including source privacy, church uploader exclusion,
reference retirement and reply-permission snapshots. Eight registry/release
tests pass. Types, scoped lint and production build pass; runtime tracing verifies
121 traces, 10,292 entries and 300 server JavaScript files with no private fixtures
or environment/configuration-loader files.

Five built Data browser groups pass: real Chromium status, all permission states
and missing/unsupported/unknown queries, change/focus/manual refresh, no hardware
or location requests, keyboard use and 320/390/1440px doubled-text bounds, search
navigation, wrong export confirmation, real fictional JSON download/owner fields,
retained draft reply permissions, excluded other-owner albums, one-minute expiry
and object-URL revocation, closure confirmation/duty rejection, guest 401/no-store,
sign-in return and replacement-account state. No browser errors. All application
writes occurred only in isolated fictional fixtures.

All six existing Settings browser groups also pass after the folder integration.
The 14:59:35 UTC release preflight confirmed the protected backup/restore and all
30 production migration checksums, with zero application writes or migrations.

## Release status

Product `2026.09.12.17`, application `4113c7ef7fbe6bf4af82fc4276a924d5da1c031b`,
is live on READY deployment `dpl_CPR6eNoprjMMJTSQNMgZJdbKTbrf`. Independent
canonical assignment and serving identity match. Fourteen live checks at
15:04:24 UTC passed with zero application writes or browser errors.
No migration, production account/permission,
provider, retention or permanent-deletion change is included.

General connected-app access and optional data-use consent require approved
capabilities. Permanent deletion, new resource ownership/transfer integration,
history clearing and parent/physical-device acceptance remain open. Existing
reversible deactivation copy does not satisfy those separate gates.
