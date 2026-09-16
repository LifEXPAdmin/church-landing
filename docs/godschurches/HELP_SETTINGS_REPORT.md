# Help settings and supported navigation

## Product progress and feedback: September 16, 2026

**2026.09.16.4 / 7f7d5dae40470330d9d9d3375ad4d2fedaa613bb** is READY in
**dpl_3HQzyqU1K1UyVdGwsf8R8yyhEEDA** at **05:31:04.243 UTC**. Independent
canonical assignment and actual serving identity match at **05:32:32 UTC**.
Application source is `1661c8d`; the release adds only a browser-test selector fix.

The release adds direct Help/Settings entries for private feedback,
owned receipts and the existing public reviewed-ideas board. This board is the
canonical product-progress destination; no parallel roadmap or public copy of
private submissions is created. Help and the board distinguish plans/testing
from released changes and explain separate, optional contributor recognition.
The existing receipt, human review, consent and provider gates remain intact.

Help now describes the implemented permanent-deletion confirmation/progress
flow and all six browser reading-reset choices. Older statements below that
feedback, reviewed ideas or deletion are unimplemented are superseded by their
own release receipts.

Ten existing help/search/registry/release checks pass, as does the authored-copy
guard over 706 files and 45,996 fragments. Types, scoped lint and the production
build pass. Five existing built-browser groups verify current notification
controls, loaded release, canonical links, consent/status explanations, private
account returns and identical retry after simulated support failure. Widths are
320/390/1,440 pixels with doubled-text checks; the phone screenshot was inspected.
An initial JSX lint error and browser selector mismatch are corrected, with their
original logs retained. No application guard was weakened.

Actual live checks pass: 22 public/navigation/access groups, four health checks and
three read-only signed-in Chrome observations. Help shows eleven topics and the
new entries; the public ideas board honestly remains unavailable under its actual
activation gate; owned receipts remain empty. The two unread notifications stay
unread. Initial live-harness assumptions about the existing Settings join route
and missing expected-account header were corrected against the source; their
failed attempts are retained separately from the final passing run.

All 89 production migration checksums match with none pending. No schema, provider,
authority or dependency changes are included. All 121 production-table fingerprints
match between 05:26:37 and 05:35:17 UTC. Verification made zero user-data/test writes
or outbound sends. Health has no alerts or pending work. Scoped final-deployment
error/fatal queries return zero rows from READY through 05:34 UTC, limited to
100 rows per severity. The current protected restore receipt remains valid;
this presentation change requires no new schema rehearsal.

Local output passes 189 traces / 43,670 entries / 475 server JavaScript files;
provider output passes 189 / 59,758 / 474. The actual provider/canonical renderer
is 173,096 bytes with SHA256
`2b7c5f99a8710e52520e7d0dc25c9fb65fd7c06e0a1d6cfee97276e0a452a3b7`.
Summed per-file gzip for unique route plus root/platform-layout JavaScript grows
837 bytes for Settings, 194 for Help and 283 for reviewed ideas. These are local
artifact differences, not measured network transfer or startup latency.

The feature's scoped navigation and explanation work is complete. Actual intake,
idea-board activation, appointed operators and physical-device acceptance retain
their named prerequisites. No real submission, vote, subscription or permission
change was used. Continue the next eligible unified priority; final review stays last.

## Historical Help release: September 12, 2026

September 12, 2026. Help and About reuses the current Help/contact and private
request destinations, Privacy and Terms pages, loaded-release context, retained
release notes and Explore features. It adds seven searchable summaries covering
audiences, calendar sharing, browser/profile appearance, scoped display reset,
current notification availability, data controls and access help.

The summaries are presentation of the existing contracts. They do not change
audiences, church authority, account lifecycle or policy text. Private account
email, member profile information and church directory contacts remain distinct.
Quiet hours and unavailable delivery channels are explained without fake controls.
Calendar and event-series shares remain independent. Policy dates stay on their
source pages; the displayed app version comes from `LoadedVersion`.

## Verification

Ten focused search/navigation/registry/release tests pass. Search handles multiple
words, whitespace, case and no results; every action has a registered account
return and existing destination. Types, scoped lint and production build pass,
including 121 runtime traces, 10,292 entries and 300 server JavaScript files with
private artifacts excluded.

Four built browser groups pass: keyboard disclosure and search, safe empty results,
all approved summaries, 320/390/1440px doubled text, real help/policy destinations,
source policy dates and retained release navigation, actual current loaded version,
phone support/recipient disclosure, simulated failed submission preserving text
and an identical request-key retry, guest Help and private Settings return. No
browser errors. No email app was opened and no real support request was sent.
Fixture recipient setup and account creation were confined to isolated records.

## Release and remaining scope

Product `2026.09.12.18`, application `a77bf8caa5a7bce048f8c9f7071426fd5bdf37d3`,
is live on READY deployment `dpl_wQUitNXMH8rYJQC9vc9tB7jggZpE`. Independent
canonical assignment and serving identity match. Fifteen live checks at
15:12:19 UTC passed with zero application writes or browser errors. The 15:09
preflight verified all 30 migration checksums and the protected backup/restore.
No migration, provider or permission change is included.

Expanded feedback types/rating, removable diagnostic context, private attachments,
feedback drafts and receipts require their owning feedback contract. Ordinary
support is not relabeled as that completed feature. Public roadmap, suggestion
credit and follow-up remain separate gated capabilities; existing release notes
do not establish them. Parent integration and physical owner acceptance stay open.
