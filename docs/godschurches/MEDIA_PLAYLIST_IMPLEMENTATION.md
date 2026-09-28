# Saved media and ordered playlists

## Scripture search and playlists verified live, 28 September 2026 UTC

Scripture search .36 and saved media/playlists .37 are **implemented, tested,
merged and verified live** in one **2026.09.28.37** deployment. Source
`994aec9210dc4da4190efaaefadd05fea5b391a5` is READY and independently canonical
as `dpl_5dCSrCgnUyZ2bDeKcfJqTC1LLQWf`, serving `godschurches.com` at
**02:25:48 UTC**. This acceptance supersedes earlier local-only checkpoints.

The exact combined build `JIQhYFXQSJJsVeRKg3zym` took 42.547 seconds and retained
all 2,030 tracked source hashes. Exact-source CI, TypeScript and scoped lint,
copy and security gates passed. Final verification passed **154 service groups,
60 browser groups and eight HTTPS groups**, including both enforced church MFA
checks. Eight mobile/enlarged-text captures were reviewed. The initial legacy
post-card fixture lacked an authenticator and was correctly denied by the
enforced server. Its failed receipt is preserved; the unchanged suite passed
13 groups in its intended off mode. Enforced-MFA evidence remains separate.

A reproduced accepted-save/lost-response/later-unsave conflict now has a warned
**Stop retrying and reload** control. Cancel preserves the exact pending request;
confirmation clears local pending work and reads current state. It neither
undoes a saved change nor automatically creates a new command. Four actual
browser groups verify the warning, cancel, reconciliation and deliberate retry.

Production passed **127 page/browser/API checks and six health checks**. No
browser errors, blocked mutation attempts, scoped runtime error/fatal rows,
production application test writes, recipient sends or new queue probes occurred.
All 156 original-table/column fingerprints remained unchanged at **02:26:59 UTC**.

Migration `20260928005500_media_scripture` and migration
`20260928010000_media_playlists` applied at **02:22:47 UTC**. All 121 source,
production and installed checksums match; there are 160 application tables. The
four new tables were initially empty, with no inferred Scripture tags or grants.
Encrypted protected 119-to-121 recovery preserved all original fingerprints and
completed stable frozen-journal replay with zero provider mutations or unresolved
controls. Five combined fictional tests verify actual media/playlist/save
dispatch, stale/missing controls, account export and verified account erasure.

The installed 121 registry preceded activation. Separate ordinary 121-to-121
recovery restored all 160 tables and removed temporary plaintext. Actual nightly
run 26 to 27 passed with **115 backup sets preserved**, zero expiry candidates,
removals or issues. Retain the full .37/schema121 artifact as the compatible
fallback. Prior .35 cannot clear Scripture tags or replay playlist/save controls;
no schema downgrade, production restore or universal incident readiness is claimed.

Provider preview retry, embedded playback, trustworthy progress/resume and real
rights, operator, policy, physical-device and pilot acceptance remain open.
Topic pathways are separate builder work. Large builds remain serialized; only
verified inactive caches were removed, preserving source, all non-cache runtime
hashes, fixtures, archives, backups and acceptance evidence. The reviewed mentor
consent definition is integrated separately as documentation, with runtime and
paid-work/credential/policy gates open and no additional deployment.

## Historical tested builder handoff, 28 September 2026 UTC

The candidate is tested and ready for release-owner integration. Application
commit `99c764c1ec8c3f0ac5d12bb8123fa797fd373d68` follows implementation commit
`0036456ac7ea832e63fd2ee9e7533a3b69bb6ab5`. The separately reviewed Scripture
checkpoint is a dependency, not a new change attributed to this feature.
The following final evidence supersedes the earlier pending checkpoints below:

- Production build `_t4TpBxJ6zAUW-NYI4Se_` passed, with all 1,220 application
  source hashes matching the tested snapshot. Hydration, 246 runtime traces,
  source and built-secret checks passed. No package dependency was added.
- All 15 actual Chrome production-browser groups passed with no page errors or
  provider requests, including uncertain creates across later denials, private
  account changes, keyboard pagination and current church manager/editor proof.
- All 89 combined service/API groups passed with no failures or skips. This
  includes all three playlist HTTPS groups with enforced church MFA, catalog,
  Scripture, media cards, account export, retention controls and maintenance,
  actual protected restoration, navigation and resource-owner regressions.
- The populated migration, 161-table actual restore, 121 matching migration
  checksums, old-client probe and newer playlist/save removal replay passed as
  described below. The final sparse-page payload was 17,397 bytes in 11 queries.
- Exact application-source CI [36367240249](https://github.com/LifEXPAdmin/church-landing/actions/runs/36367240249) passed.
  Focused lint, TypeScript, copy and source-security checks also passed.

Migration 121 SHA256 is
`102307db910767972db07752908dbefb6879fba0ad0286a4b8938cbcc6415e51`.
The tested runtime, original failed receipts and final evidence are preserved
privately. Integration, combined release verification, production migration and
live checks remain with the designated release owner. This builder made zero
main-branch changes, production migrations, deployments or real provider sends.
Playback progress, supported-player and real operator/policy acceptance remain open.

## Candidate scope

This isolated candidate implements private saved media and finite personal and
church playlists under the accepted [playlist contract](PLAYLIST_PROGRESS_CONTRACT.md).
It consumes the canonical catalog and its current source-access predicate. It
includes the reviewed Scripture checkpoint as a dependency; it does not modify
that checkpoint's source files. Integration and production acceptance remain with
the release owner. No production migration or deployment is part of this handoff.

Personal owners can create private drafts, publish with PRIVATE, MEMBERS or PUBLIC
audiences, edit, reorder, unpublish and remove. Church creation requires the exact
current scoped media duty, approved connection and activated managed church.
Editors manage their own church drafts; managers control church publication and
live ordering. Privileged church work rechecks the current session proof. No duty
is automatically assigned. Personal saves and playlists do not require a church
role or church MFA proof.

The saved-media page, playlist list, editor and published reader are linked from
the existing menu. The bounded picker adds currently readable published sources.
Unavailable owned references become removable opaque entries. Public readers see
only current authorized media, with dense positions and filtered totals before
pagination. Playlist audiences never grant source access. Removing a playlist
leaves source recordings and personal saves intact; unsaving leaves playlists
intact. Opening a recording is deliberate and uses the existing catalog reader.

Playback progress, resume positions, automatic continuation and embedded players
remain unavailable. No fabricated completion or provider response is stored.
Real rights, consent, policy, operator and provider activation gates remain open.

## Boundaries and cost

The server enforces 100 playlists per account or church, 200 unique entries per
playlist, 1,000 saves per account and 25 items per response page. Strict envelopes,
expected-account checks, same-origin requests, version conflicts and exact-body
receipts reuse the existing command owner. Receipt replay checks current authority.
A 200-entry reorder validates the exact current set and writes positions with one
batched statement. No provider request or background playback job is introduced.

Public membership filters through the canonical media SQL predicate before count,
page and projection. Private management may expose its own opaque entry identifiers
for removal and keyboard ordering, but never denied source IDs or metadata. Signed
cursors bind account, access scope and playlist version; editor anchors locate a
currently authorized entry's page after keyboard movement. Invalid page positions
have a first-page recovery action. A sparse 127-entry fixture with 27 readable
sources used 11 queries and approximately 17 KB for its first 25-item response.

Client state is keyed by account and playlist. Current identity and visibility
checks conceal private DOM on blur, account replacement and access loss. Unsent
navigation is guarded. Inputs freeze during a pending write, and immutable retry
bodies remain in account-and-route-scoped memory through an uncertain result.
A post-commit identity change conceals the draft and allows only the original
account to reconcile it. A lost removal response remains retryable even after
editor reads deny the removed playlist. Browser storage is not added.

## Migration and recovery

Migration `20260928010000_media_playlists` follows the Scripture migration and adds
MediaPlaylist, MediaPlaylistEntry, MediaSavedItem and MediaPlaylistEvent, their
indexes and constraints, and two supported retention-control kinds. There is no
backfill, permission assignment or automatic publication. The migration was
regenerated from the reviewed prior schema after an initial database-diff draft
included unrelated manual constraint drift; that draft was rejected before commit.

A populated 120-to-121 rehearsal preserved all 156 prior table count/content
fingerprints and added four empty tables. An actual 121-schema snapshot restored
all 161 tables, including migration history, with identical contents and all 121
migration checksums. A separately generated 120 client read and wrote existing
media successfully; its compatibility probe rolled back without changing any row.
This is additive schema compatibility, not permission to run obsolete retention
or erasure code after new control kinds exist. Any rollback must retain the current
recovery/erasure consumers and pause new playlist writes until reconciled.

Personal exports contain only the account's playlists, entries and private saves,
with current readable source projections. Church-managed records are excluded.
Erasure clears personal collections and private attribution while retaining church
work. Protected controls contain no source text or URLs. Replaying removals newer
than a snapshot clears membership, titles and private saves, marks recovery state,
retires old credentials and leaves traffic disabled. The actual isolated rehearsal
completed replay, repeated it safely and retained current-authorization review as
an explicit gate. This does not establish a real production restore or operator
acceptance.

## Verification checkpoint

Before the production candidate build, 20 input/service groups and six existing
navigation/resource groups passed. Twelve actual Chrome development-browser groups
passed: creation, source selection, publication, unsent navigation, private DOM
concealment, delayed writes, exact retry, post-commit account change, account
replacement, paginated keyboard focus, stale page recovery, opaque saves, mobile
reader layout and lost removal response. There were zero page errors and zero
provider requests. Two HTTPS boundary groups passed; enforced-MFA and production
browser checks remain pending at this checkpoint.

Browser investigation corrected a create-navigation race with the shared unsent
history guard and gave the populated description field a stable accessible name.
A rehearsal fixture initially used an unnormalized source acknowledgment and an
unsupported private-journal path; those fixture errors were corrected before the
successful clean recovery run. The first broader run encountered its stopped HTTPS
server and a PostgreSQL-incompatible URL query parameter; it is not a passing
regression receipt. Final built verification and integration acceptance must be
recorded below before this candidate is marked ready.

### Uncertain-receipt correction

Final review reproduced an additional browser edge case: a committed create whose
response was lost could discard its retry key after a later rate limit or access
denial. The client now preserves an already uncertain immutable request through
such denials, because they can occur before receipt lookup. The expanded browser
suite passed 15 development groups, including lost create, 429 then 404 denial,
same-key recovery and exactly one playlist, plus actual manager and delegated
editor screens with current session proof and revocation. The corrected personal
MFA fixture includes the required explicit audience; all three HTTPS groups pass.
The corrected production candidate remains pending at this checkpoint.

### Combined release review

A1 combined the three tested B1 commits with the Scripture search checkpoint.
Additional real account export/erasure and protected-dispatch tests cover all
three media control kinds, missing records and reverse-version replay.

An actual browser reproduction found a second uncertain-save case: the source
was saved successfully but its response was lost; a separate authenticated session
then unsaved it, so the original retry correctly returned a permanent conflict.
The old interface kept every change and navigation paused without a local escape.
The interface now offers an explicit, warned stop-retrying action. Cancel retains
the original request; acceptance discards only this account/route's local pending
values and reloads current state. It never undoes a committed write, silently
issues a replacement, or claims the original request failed. Final combined
browser and release acceptance remain separate gates.

The dedicated development-browser regression passed four groups: the actual
permanent conflict, canceled warning with an unchanged request, accepted local
abandonment with zero POSTs, and a subsequent deliberate save using a new key
and one canonical saved row. Both 320-pixel focused controls were inspected.
There were no external requests or page errors; the sole failed request was the
intentionally dropped successful response. Final immutable-build verification,
protected recovery, migration, integration and live acceptance remain open.
