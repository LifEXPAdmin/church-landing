# Gather groups implementation checkpoint

18 September 2026. Local work in progress; no group migration or runtime is deployed.

The adult group contract is saved in `GATHER_GROUPS_CONTRACT.md`. The current foundation adds private group destinations to canonical posts, comments, drafts, polls, reports and appeals. It includes explicit current membership and church authority, named invitation and leadership consent, private roster choices, archived history, protected access restoration, pinned threads, selected answers and signed read progress. Read acknowledgements cover returned positions, preserve unseen pagination gaps, and do not change following. Visibility changes invalidate old progress.

The isolated database applies all 99 migrations. Seventeen focused service tests pass, including current-access rejection on exact retries, removal, bans, stale church authority, invitation blocking, older protected restore, draft destination immutability, report scope, private ballots, moderation, pins, locks and deep-linked read progress. TypeScript, website copy and changed-file lint pass. Earlier failures were retained in private evidence and repaired; one unused import and trailing whitespace were removed after those checks.

This is a saved foundation, not feature completion. Account closure/export/erasure, canonical event links, generic current-source notifications, HTTP and member interfaces, navigation/help/release notes, full regression and browser acceptance, measured runtime costs, upgrade/restore, canonical deployment and live verification remain open. No real groups, appointments, members, content or notifications were created in production.
