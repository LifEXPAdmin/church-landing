# Supplied church visitor information

## Complete gate passed, 19 September 2026, 01:41 UTC

The uninterrupted isolated support gate exits successfully at 01:41:12 UTC after
45.74 minutes. All 195 discovered test files pass: 1,242 passing executions,
zero failures or cancellations and two expected production-stage skips for
development-only email cases that passed in development. Both production builds,
staged migrations, dump/restore, real process restart, production HTTPS HTML/RSC
privacy and every discovered regression file complete successfully.

All 1,777 tracked files in the frozen gate export match the recorded source after
the run. The tested application remains `9d6d00d`; later differences are reviewed
test-harness corrections and documentation. The eight built-browser groups and
protected production-copy upgrade described below also pass. Publication,
installed production recovery and verified live acceptance remain next.

## Local verification, 19 September 2026, 00:17 UTC

Application candidate `9d6d00d` passes the production build and eight real-browser
HTTPS groups. The correction owner saves privately, a separate reviewer approves,
and guests see supplied information on the original church URL. Clearing remains
private until review. The representative form saves the maximum multilingual
profile and authority fields in one 29,435-byte request; current profile managers
preview before publishing. An existing-church draft preserves its explicit
dispute flag and checked/unchecked permission choices without granting access or
changing public facts. There are zero browser errors or external sends.

Public details fit 320, 390 and 1,440 pixel viewports and doubled text size without
horizontal overflow. Keyboard focus and optional field labels/hints pass. The
actual renderer repair remains verified; the local build has 224 traces, 74,462
entries and 558 server JavaScript files. Long visitor fields remain absent from
bulk church rows. No speed improvement is claimed from these checks.

The fresh encrypted production-copy rehearsal upgrades 103 to 104 migrations,
preserves all 144 original table/column fingerprints and completes protected
replay. Temporary plaintext is removed and production is unchanged. Installed
production recovery acceptance remains a later publication gate.

The first combined gate ran from 00:06:41 to 00:06:52 UTC and stopped at a
historical whole-row metrics fingerprint because the newly added empty Church
columns changed the serialized row shape. The harness now compares the original
columns and separately requires all five new visitor fields to remain empty.
The next attempt ran from 00:10:29 to 00:23:19 UTC and stopped during its
production build when Node exhausted its configured
6 GiB heap. All test groups reached before the build reported zero failures;
the complete gate did not pass. The earlier independent build passed in a clean
source export. A full retry began at 00:27:54 UTC in a new isolated export with
all 1,777 tracked files verified, independent dependencies and no initial build
cache. Both production builds passed in that clean workspace with the same heap
limit. That run stopped at 00:49:31 UTC because the private wrapper inherited an
enabled push fixture while the messaging HTTP baseline expected push disabled.
The product correctly reported the supplied configuration. The wrapper now uses
the standalone harness environment and does not inherit application fixtures.
All six messaging HTTP checks pass with the corrected baseline. The focused
rerun also needed the matching source working directory for the protected local
recovery store; that guard remained intact. A new complete run began at
00:55:28 UTC. A separate read-only review confirms that the wrapper excludes
browser fixtures and the exported harness uses its own database, origins,
secrets, sinks and certificate trust. The application and assertions are
unchanged; no complete-gate pass is claimed yet. Failed attempts and diagnostics
are retained. Initial browser harness
attempts needed response capture before hard navigation, required-label matching
and scoping to the current accessible form rather than cached hidden markup.
Those test-only fixes are committed separately; application code remains `9d6d00d`.

Five reviewed definitions accompany the publication candidate: [artist identity
and release credits](ARTIST_RELEASE_CONTRACT.md), [private reading records](READING_RECORDS_CONTRACT.md),
[healthy-use settings](HEALTHY_USE_SETTINGS_CONTRACT.md), [family access threats](FAMILY_ACCESS_THREAT_MODEL.md)
and [playlist ownership and private progress](PLAYLIST_PROGRESS_CONTRACT.md).
They change documentation only. Their application, provider, cleanup and family
activation requirements remain open; they do not activate those capabilities.
Optional profile-section ordering is a separately tested, reviewed runtime
handoff and is excluded from this application candidate.

## Candidate implementation, 18 September 2026

Five optional public fields extend the canonical Church record: service times,
accessibility information, languages, children's program notes and visitor
contact preferences. Their respective limits are 1,000, 1,000, 300, 1,000 and
500 JavaScript string units. Empty values remain empty; legacy records receive
no inferred facts. Public detail pages group present values under **Supplied
visitor information** and ask visitors to confirm schedules and arrangements
directly. Text is escaped and preserves line breaks, without automatic embeds.

The existing community listing, private correction and representative profile
owners remain responsible for editing. Corrections stay private until an
independent current listing reviewer approves them against the canonical
version. Approval updates the existing Church ID and URL. An authorized profile
manager saves privately, previews and explicitly publishes, with current grants
checked again. Clearing a value follows the same review/publication path.
Representative review still requires its separate operating policy and appointed
reviewers; this feature does not activate that production gate.

Long visitor notes are selected only for one explicit church detail, correction
or claim snapshot. Bulk search and connection pickers retain their existing
projection and pagination. The shared public-field projection also carries the
owner's private selections into the existing account export allowlist. No new
permissions, dependencies, provider calls, background jobs or duplicate records
are introduced.

The additive migration `20260918234500_church_visitor_information` adds five
non-null text columns with empty defaults and database length constraints. The
application's Unicode string-unit limits are stricter than PostgreSQL character
counts for supplementary characters. Existing fields and row identities are
preserved. Production migration and protected recovery acceptance remain pending
at this candidate checkpoint.

## Reproduced input defects and correction

Before feature edits, an isolated canonical handler rejected a valid 9,667-byte
multilingual listing at the old 8 KiB ceiling. A lone UTF-16 surrogate passed
validation but failed persistence with a service error; the private draft stayed
unchanged. Listing and claim endpoints now have a bounded 32 KiB ceiling and
reject unsupported controls or lone surrogates before persistence. Valid emoji,
multilingual text and ordinary tabs/newlines remain supported.

Inspection of the representative form found three copies of profile values in
its request. Reproducing that serialization through the actual handler rejected
a valid 21,422-byte profile in a 64,720-byte request. The form now sends public
profile fields once, private authority once and only boolean permission choices
in its scopes object. Dispute state remains explicit. Profile-only saves omit
unused authority and scope values. Independent source review measured a maximum
valid canonical payload below 32 KiB; the later real-browser check above confirms
the actual representative transport remains within that boundary.

## Checks and remaining gates

### Release and rollback compatibility

The migration is additive and keeps existing Church IDs, versions, memberships
and claims. Apply it before serving the new detail selectors. Prefer a reviewed
forward fix after publication. Any interface rollback must retain the new field
projection and validation: the prior application does not include visitor fields
when reading or replacing private listing/profile JSON, so it cannot safely
round-trip drafts created with these fields. Retain the columns and recovery
registry rather than dropping supplied facts or restoring a stale database to
undo an interface change. No rollback has been performed by this verification.

### Verification scope

Five isolated service/boundary groups pass: blank/default/bounded Unicode;
independent, self, revoked and stale correction review with deliberate clearing;
private incomplete drafts and owner-only export; current representative profile
publication and revoked grants; maximum multilingual requests and malformed or
oversized no-domain-write rejection. The migration applied only to the fictional
local database. Initial missing required fixture summaries and the public
projection return type were corrected; final TypeScript, scoped lint and copy
checks pass. A private pre-migration guard initially compared an INET string with
its CIDR suffix; using PostgreSQL's host projection fixed the guard before any
migration ran.

Built HTTPS owner/reviewer/guest and representative browser journeys and the
protected upgrade now pass as recorded above. The complete regression gate,
installed backup recovery after migration, exact publication identity and live
checks remain open. Implemented code is not yet a verified live release.
Physical-device and real church operating evidence keep their separate gates.
