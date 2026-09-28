# Artist profiles and external music releases

Implementation checkpoint: 28 September 2026. This feature branch implements the
first public artist projection defined by `ARTIST_RELEASE_CONTRACT.md`. Integration,
production migration, live acceptance and actual operator policy activation belong
to the release owner. This document is not production acceptance evidence.

## Usable first version

`/platform/music` provides bounded name, genre, artist-role, country/named-town,
supplied church/ministry, release-type and organizer-approved event filters. Search
checks current publication, rights, moderation, eligible stewardship and blocks
before counts and twenty-item pages. URL filters survive browser navigation.
The catalog requires narrower filters beyond 2,000 candidate artists; event-filter
inspection additionally caps candidate associations at 200 to bound source checks.

An eligible adult can create a PERSON or TEAM profile in the artist studio, affirm
representation, maintain descriptive biography/roles/genres/coarse location and
ordered supplied credits, and deliberately publish or withdraw the profile. A
profile without releases remains useful. The reader has Music, Events, About and
Support sections. Artwork uses the contract's text fallback. No support/payment
provider is connected. No identity, church-endorsement or rights verification
badge is inferred.

Explicit artist-scoped invitations require acceptance of their exact capabilities
and version. Profile editing, private release editing and release publication are
separate scopes; delegates cannot manage other delegates or stewardship. Invitations
expire in seven days. Accepted and pending scopes are each capped at twenty.
Replacement, revocation, step-down, current eligibility and relationship blocks
are rechecked on reads, writes and successful receipt replay. No unsolicited
message is sent.

Releases have independent identity, version and publication state, ordered stable
track IDs, supplied dates, plaintext credits and canonical Spotify, Apple Music
or Bandcamp listening URLs. Drafts may be incomplete; publication requires the
whole release type and a fresh private assertion for its exact metadata. A SINGLE
has one named track; EP and ALBUM have at least one. Links never embed, autoplay,
scrape artwork or contact a provider during browsing. An explicit Open action
rechecks the current release before navigation. Withdrawing a profile hides its
published children; restoring a moderation state never republishes withdrawal.

Follows extend the existing SocialRelationship identity with an artist target.
They do not create personal follows, notification subscriptions, contact permission
or editing access. The existing relationship settings link to followed artists.
Unavailable owned references have a minimal removal path without source metadata.

Performance associations retain the canonical occurrence ID and need both artist
steward proposal and the actual church calendar publisher's acceptance. Organizer
review uses the current church grant and session-bound privileged authentication.
Canonical edits and cancellations flow through the existing calendar projection;
private sources disappear, and organizers can still withdraw their consent.
Supplied collaborator credits remain plaintext attribution. Optional account or
artist identity links are not activated: typed names never imply that a subject
accepted an association or granted access. Ownership transfer, church-owned artist
stewardship and a verified-identity program remain unsupported by the accepted
first-version contract.

## Recovery and privacy

Artist and release report targets use the existing global community-report and
moderation owners. Church/music-ministry credit never expands reviewer scope.
Publication requires available report intake. Case views preserve only the selected
canonical evidence, with existing retention clocks and private review boundaries.
Erasure scrubs unheld metadata, revokes artist/event authority and keeps only
required tombstones or selected case evidence. Account export includes owned
artist material, the account's delegate history and its artist follow choices.

Browser writes retain the exact mutation body after an uncertain response. Edits
cannot replace that body. A warned local-abandonment action explains that saved
work is not undone. Editor state is keyed by account/resource; private DOM is
concealed on blur, offline state or lost access. Unsent release state survives an
authorized return. Concealed dirty work and lost removal responses retain generic
discard/retry controls without revealing the old fields. Open release editors
prevent silent sibling switching.

Typed ARTIST, ARTIST_RELEASE and ARTIST_FOLLOW recovery controls prevent older
backups from reviving newer withdrawal or follow choices. Global restoration also
quarantines artist profiles/releases and revokes delegates/event associations when
the backup and journal checkpoints match. It preserves evidence and controlVersion
so newer journal controls still replay. Existing sessions and broader elevated
authority are retired by the shared restore owner. Fresh login cannot bypass artist
recovery. Authorized reappointment/republication after restoration remains an
operator recovery gate; this feature supplies no automatic authority reset.

## Schema and integration

Apply `20260928030000_artist_releases` after the existing 121 migrations, then
regenerate the Prisma client for the integrating checkout. The migration adds
ArtistProfile, ArtistRelease, ArtistDelegate, ArtistEventAssociation and ArtistAudit,
extends SocialRelationship targets and community-report target values, and admits
the three typed artist retention controls while preserving existing shape guards.

Migration SHA256:
`335ee6dc93fb66009ec4b6020d0061d98be55e373ca238fb1e70e12371519d90`.

A populated isolated upgrade from migration 121 to 122 preserved fingerprints of
all 160 original tables, including eight populated tables. No production database
was touched. The branch starts before the release owner's request-bound CSP work;
verify their combination on integration rather than replacing the newer security
policy or another worker's schema changes.

## Verification

The isolated evidence currently includes 25 focused input/service/recovery tests,
72 related relationship/calendar/report/moderation/retention regressions, 16 account
export/deletion/shared restoration regressions, five production HTTPS boundary and
organizer-MFA checks, and eighteen production-browser checks. The real artist custom
backup test covers equal and newer protected checkpoints, fresh-login denial,
withdrawal/unfollow replay and repeated `replayComplete: true`.

The production build passed type validation, website copy, hydration
repair, runtime traces and built-output security. The separate source security
scan covered tracked files. Repository lint has zero errors and 36 existing
warnings. Canonical-event navigation, a deliberate provider navigation attempt and
stale-link refusal pass in the built browser. There are zero passive provider
requests and one deliberately intercepted navigation; provider availability and
real recording rights are not claimed. Organizer disclosure also checks the
accepting account's current approved church connection, independently of a
lingering grant record.

Real music rights, the adequacy of a particular publisher's assertion, current
provider terms, human reporting operations and actual post-restore appointments
remain human/operator acceptance. Fictional tests establish application boundaries,
not those facts. Native audio hosting, payments, royalties, support destinations
and release announcements are not enabled by this implementation.
