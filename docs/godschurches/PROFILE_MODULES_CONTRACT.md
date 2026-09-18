# Typed optional profile sections

September 18, 2026 UTC. Reuse the current profile owner, versioned editor,
member projection, audience previews, private snapshot guard and photo controls.
Name remains required. Optional sections grant no identity, skill certification,
church appointment, management capability or new audience.

## Section inventory

| Slot | Canonical owner and supported behavior |
| --- | --- |
| Biography | Existing `PlatformUser.bio`, 500 characters, plain text |
| Introduction | Existing `ProfilePresentation.introduction`, 1,000 characters |
| Testimony | Typed optional modules, 2,000 characters, plain text |
| Skills | Typed optional modules, up to 10 distinct entries of 60 characters |
| Links | Typed optional modules, up to 3 labeled HTTP/HTTPS links |
| Pinned post | Existing personal profile pin service; recheck the canonical post and source audience on every read |
| Calendar | Reserved and unavailable until an explicit owner selection and current calendar/event audience projection are integrated |
| Featured media | Reserved and unavailable until a published media owner and current source projection exist |

`PROFILE_MODULE_SLOTS` is the typed inventory. Unavailable slots are rejected as
input and produce no placeholder, blank tab or enabled control. Calendar, featured
collections and new section ordering are separate consumers of this contract.
Existing About/Posts ordering and the canonical pinned post remain working.
This change does not create media or calendar copies in profile JSON.

## Input and display

The versioned account profile endpoint accepts `profileModules` with exactly
`testimony`, `skills` and `links`. Strings and arrays have strict bounds; unknown
fields, duplicate skills, malformed links and unsupported modules are rejected.
Text rejects unsupported C0 controls, DEL and lone UTF-16 surrogates before any
profile write. Ordinary tabs, line breaks and valid multilingual or emoji text
remain supported. These rules keep bounded normalized content compatible with
PostgreSQL JSONB and its storage limit; malformed stored content still fails closed.
Each link needs a label of at most 80 characters and an address of at most 500
characters before and after URL normalization. Only HTTP/HTTPS without embedded
credentials or whitespace/control characters is supported. Links are ordinary
user-authored anchors with `ugc nofollow noreferrer`, never server-fetched embeds.
Text is rendered by React as text, with no HTML execution or script evaluator.

Filled modules appear within About for currently permitted signed-in members.
Empty values remove the section. The editor states that audience before saving.
There is no new per-section disclosure switch or public profile route. The owner
must type the content; account email, phone, church-directory choices and hidden
location values are never imported into these fields. Deliberately entering
contact details into a member-visible text field does not make them private.

The member reader selects only presentation fields and normalizes the JSON
through the strict typed decoder. Malformed or unknown stored fields fail closed
to empty modules and are not serialized to clients. Visitor preview still reads
only name and username. Member preview, block/inactive boundaries, hidden location
projection and snapshot invalidation reuse their existing owners.

## Writes, conflicts and recovery

`ProfilePresentation.modules` is bounded JSON with an independent recovery version.
Owner/session checks and the existing profile version serialize edits. Older clients
that omit modules preserve them; unsupported fields never become writable. Failed
or uncertain saves preserve local entries. A stale version requires reviewing the
saved profile, including its modules, before deliberately applying retained edits.
The profile HTTP body allows at most 32 KiB for valid bounded multilingual content;
other account operations retain their 8 KiB limit.

Every explicit module save records an opaque `PROFILE_MODULES` recovery control
in the same transaction. It contains only existing recovery identifiers/version
metadata, never story text, skills, links or contacts. Protected replay clears
older restored module content and advances the editor version beyond the recorded
change. It also creates an empty version marker when the older backup lacks a
presentation row. Replaying again preserves current data; newer reviewed module
saves survive older receipts. Erased accounts are never recreated.

Own account export includes the owner's stored modules. Existing account erasure
deletes the owning presentation row. Existing journal maintenance protects the
receipt after the write; a pending journal response remains explicit through the
existing profile save contract. Deployment requires the additive profile-modules
migration, the compatible runtime and installed recovery support before traffic.
There is no provider activation, credential or background scheduler requirement.

The reader adds no query or external request. Payloads remain bounded and optional;
the server renders module content. Only the existing profile form carries the new
input controls. This is a functional cost statement, not a measured speed claim.
