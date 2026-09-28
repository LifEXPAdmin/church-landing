# Saved media and ordered playlists

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
