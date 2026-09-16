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

### Integrated interface checkpoint

The local feature now has Browse, My listings, create, detail and edit routes,
Menu and account-return entry, current-access concealment, explicit publication,
status and duplicate controls. Immutable pending requests retain unsent fields
after an uncertain response. A changed saved version requires deliberate review.
Photo upload, viewer, ordering, captions, alternatives and removal reuse the
existing media owner. Church-only pages and signed-in listing sets use the
existing private snapshot boundary. No separate listing contact or report store
was introduced.

The expanded isolated gate passes **20 checks** (three input and 17 service
groups), all 92 migrations, populated preservation and dump/restore equality.
New coverage includes original/current report scope, current church managers'
notices and appeals, last-report erasure retention, bounded pagination and an
actual session-bound authenticator challenge followed by duty revocation.

The built Free/For sale interface passes **11 browser groups** and one production
HTTPS group. These exercise lost-create exact retry, owned reload, precise KWD
prices, catalog town selection, navigation recovery, actual photo upload and
metadata, blur concealment, publication, guest HTML/RSC and image bytes,
concurrent saved-version review, duplication, archive/reopen and account switch.
The tested phone layouts include 390 pixels and 320 pixels with enlarged text;
browser page errors are zero. Later private-page guard integration remains in
the final integrated build check. Types, scoped lint and copy validation pass.
The preview uses fictional accounts, its own PostgreSQL cluster, local image
storage and intercepted fictional delivery. Production application writes and
external sends remain zero.

The browser work corrected stable accessible names for populated controls and
removed a stale initial access-check notice. Harness fixes distinguish completed
requests from buttons that appear while a request is still running, and route
the fictional hostname's simulated lost response through the local TLS proxy.

## Work remaining in this feature cycle

Complete the newly eligible Wanted and Service fields in this same listing
feature cycle, including type-change privacy and the original distinct-intent
requirements. Church delegation has an implementation and isolated acceptance;
business delegation still lacks its canonical organization authority service.
Review the new read costs, run the complete established gate, rehearse protected
production migration/recovery and release through exact canonical live checks.
Reconcile the existing private task and feature checklist at completion. Keep
the broader final review last and continue eligible children in the same run.
