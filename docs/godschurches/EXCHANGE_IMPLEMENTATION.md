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

### Distinct intent integration

Wanted, Service and Church need now have explicit canonical fields, editor and
detail presentation, listing filters, report evidence, export and erasure. Type
changes clear incompatible fields deliberately and the server rejects stale
schemas or hidden values. Free and paid services have distinct validated pricing;
paid rates use the same exact minor-unit parser and a stated hour/task unit.
Church need requires actual church ownership and current Exchange duties.

The expanded isolated gate passes **25 checks** (six input and 19 service groups).
All **93 migrations** apply. The populated upgrade preserves existing account,
post and old-policy Free/For sale fields, including a KWD three-decimal amount;
new fields start empty. Dump/restore equality includes listings, audit and media.
Tests cover type changes through current public/editor/report projections,
church-owned need permissions, exact rates, export, unreported erasure and
retention until the final selected report expires. Types, scoped lint and source
copy validation pass.

The complete intent interface passes **15 browser groups** with zero page errors,
including real church-manager creation/publication, approved church reading,
guest denial and concealment after delegate revocation. The brief reconciliation
also adds type navigation, literal bounded search, category chips, owned status
filters and a persistent save action. The focused gate now passes **27 checks**
(seven input and 20 service groups), including filter privacy and literal SQL
wildcard characters. The needed-by date uses the existing viewer date-format
presentation without timezone conversion. The rebuilt filter/date interface
passes all **15 browser groups**, including actual category-chip activation,
literal search, empty owned-status results and the reader's saved date format.
The expanded public candidate check passes **44 groups** with zero page errors
or writes, across 320/390/1280-pixel public, entry, release and access screens.
Thirty-eight input/navigation/registry/release/regional checks also pass.
The feature guide and factual Exchange privacy/service information are updated
in the same cycle. The latest authored-copy changes await built rendering.

Read-cost review reduces a 20-card synthetic long-field response from 184,173 to
13,813 bytes for guests and 184,196 to 13,836 bytes for owners. Both retain one
listing SELECT and the same 20 records. Full detail stays 18,232 bytes. Ten warmed
local samples put guest-list p95 at 3.18 ms and owned-list p95 at 5.34 ms; these
small local diagnostics are not hosted latency or capacity acceptance.

A fresh encrypted production copy upgrades from **91 to 93 migrations**, retains
all **123 original-table column fingerprints**, and passes protected restrictive
replay. Production is unmodified. The broad gate's initial account/church/media
checks passed before the long-lived checkout exhausted the build's Node heap.
The same gate is being rerun in a clean isolated checkout; production preview
builds already pass with 199 verified traces and the pinned hydration renderer.

## Work remaining in this feature cycle

Verify the integrated intent forms in the built browser and complete release
acceptance in this same feature cycle. Church delegation has isolated acceptance;
business delegation still lacks its canonical organization authority service.
Finish the complete established gate and integrated browser checks, retain the
fresh protected migration rehearsal, and release through exact canonical live checks.
Reconcile the existing private task and feature checklist at completion. Keep
the broader final review last and continue eligible children in the same run.
