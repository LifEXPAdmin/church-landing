# Exchange implementation and acceptance

September 16, 2026 UTC. Work continues in the same unified feature cycle.
**Unpublished engineering checkpoint. Exchange is not yet a completed feature.**
The live release remains `2026.09.16.9 / 4b834fb`; there are no production listing,
grant, content or provider writes for this checkpoint.

## Implemented locally

The [listing contract](EXCHANGE_LISTING_CONTRACT.md) now has canonical personal
and church-owned listing records, private incomplete drafts, exact integer minor
unit prices, catalog town selection, explicit publication confirmation, current
audiences and state transitions. Session ownership, adult eligibility, immutable
ownership, optimistic versions and exact operation receipts govern writes.
Database constraints and the additive migration preserve earlier data.

Explicit Exchange publishing, management and moderation duties extend the existing
church access owner. Existing post duties do not grant these capabilities. A
personal church audience binds the actual owner and church through their canonical
connection. Revoked membership and changed duties are rechecked before reads,
writes and retry receipts. No production appointment is created.

The existing photo pipeline processes up to eight listing photos, retains exact
upload retries and interrupted-write cleanup, and rechecks the source before and
after byte retrieval. Existing reports have canonical listing targets, original
and current scope filters, selected text, decisions, author notices and appeal
authorization. Bilateral blocks affect detail and media; mute affects discovery.
Personal export and erasure include listings and images through their current
owners. Protected visibility and moderation journals use independent versions;
an older restored audience is quarantined privately before publication review.

## Checks run

The isolated Exchange service gate passes **15 checks**: three input groups and
12 persistence, permission, media, report, recovery, lifecycle and transport
groups. It applies **92 migrations**, preserves populated existing account/post
data, and verifies dump/restore equality including listing, audit and image
records. All actors, provider files, delivery sinks and PostgreSQL data are local
fixtures. Production writes and external sends are zero.

The first run exposed an audience-change error: publication used the old row's
reporting scope instead of the proposed audience. The corrected path requires a
current Exchange reviewer for the proposed church scope; the regression passes.
The focused gate is not the full application gate or a production release proof.

## Work remaining in this feature cycle

Finish accessible discovery/detail/My listings and the editor with retained
unsent work, owned draft recovery, explicit duplication, photo controls, account
entry destinations and current-access concealment. Exercise actual HTTP,
HTML/RSC, phone layout and browser reload/retry behavior. Complete regression
coverage for report expiration, delegation/appeal notices and source changes;
review the new read costs, run the complete established gate, rehearse protected
production migration/recovery and release through exact canonical live checks.
Reconcile the existing private task and feature checklist at completion. Keep
the broader final review last and continue eligible children in the same run.
