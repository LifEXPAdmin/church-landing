# Private reading records and learning resources

## Scope and inspected implementation

September 18, 2026 definition candidate, based on integrated `bea3ba3`. This
contract defines adult-owned Bible reading history, optional notes and position,
curated learning resource metadata, rights and voluntary sharing. It introduces
no database, permission, route, setting, reminder, provider call or hosted text.
Integration acceptance of this definition is separate from a working tracker.

The existing Bible Pages reader displays permitted feed posts.
`reading-preferences.ts` stores presentation choices in a browser cookie, not
passage history. `PlatformPost.scripture` remains free-form member text.
`post-workspace.ts` owns private post saves, while `account-export.ts` and
`account-erasure.ts` own account lifecycle operations. None is a Bible tracker or
a curated learning-resource service. Do not reinterpret their existing records.

Reuse the versioned Scripture normalization defined in
[MEDIA_CATALOG_CONTRACT.md](MEDIA_CATALOG_CONTRACT.md#scripture-reference-normalization)
and the service-specific authority rules in
[RESOURCE_CONTRACT.md](RESOURCE_CONTRACT.md). The actual supported book/verse
registry and parser remain unimplemented in this baseline. A contract or generic
resource address cannot activate them. The private original tracker requirement
also includes last position and optional reminders, and excludes social comparison
and completion badges; those boundaries are retained here.

## Private reading identity and data

A reading entry has one server-generated opaque ID and one immutable personal
owner resolved from the current authenticated, eligible adult session. Church
membership, a pastoral duty, family relationship, support access or an editor
grant never confers access to an adult's tracker. There is no church-owned reading
history, public tracker endpoint or audience selector on an entry.

The future entry service owns these fields:

| Field                      | Meaning and bound                                                                                                                                                   |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`, `ownerId`, `version` | Server identity, authenticated account owner and positive optimistic version. Neither URL nor body can select another owner.                                        |
| `passages`                 | One to 20 normalized ranges using the catalog contract's system ID, version, book ID and inclusive endpoints. Every range must validate.                            |
| `originalReference`        | User-supplied reference, up to 500 characters, retained for correction. It is private and is not a second search authority.                                         |
| `readOn`                   | Explicit real Gregorian civil date in `YYYY-MM-DD` form, independent of the server's time zone. A reading date is not a verified attendance or attention timestamp. |
| `note`                     | Optional plain text, up to 2,000 characters; empty means no note. It is never automatically a post, prayer request, feedback case or search document.               |
| `createdAt`, `updatedAt`   | Server timestamps for this record, separate from the user-entered reading date.                                                                                     |

Use the existing 32 KiB write envelope, reject unknown fields, unsupported C0/DEL
controls and unpaired UTF-16 surrogates before storage. Preserve ordinary
multilingual text, emoji and note line breaks. Count field limits consistently
with the existing string validators; reject excess input with the edit retained,
never silently truncate. Do not collect precise location, contacts, device usage,
denomination, inferred belief, reading speed or proof that the passage was read.

The initial form requires only passage and date. It offers today's civil date
from the user's device as an editable suggestion; the server validates the date
itself without reinterpreting it as UTC midnight. An unusual or future date may
be shown for confirmation, but is not silently corrected or treated as a scheduled
reminder. Do not require a plan, goal, note, church or published update to save.

An exact accepted create retry returns the original ID. A deliberate new entry
for the same passage and date is allowed; rereading is not an error. Edits retain
the ID and check the expected version. Reject stale commands with the user's edit
intact and a current owner-only recovery view. Delete uses the same owner/version
checks. A deleted entry does not reappear from a retried create, stale cache or
older restored backup.

History is ordered by `readOn`, then stable ID, with a maximum page size of 50 and
an owner-bound cursor. Every detail, list, count, correction, delete, retry and
export rechecks current identity/lifecycle. Denied and missing IDs have the same
unavailable projection. Do not first fetch a private body and rely on the UI to
hide it. Bound writes and aggregate queries per account; the persistence task
must record measured query and storage limits before activation rather than
loading lifetime history for every page or silently discarding older entries.

## Passage normalization and last position

Store the selected reference system and reviewed registry version with each
range. Supported books, aliases and exact chapter/verse bounds come from that
registry, not a hard-coded guess or a denominational assumption. No Bible text or
translation is required to store a valid reference. Existing free-form post
references stay unchanged and are not bulk converted into private reading logs.

The shared parser owns single chapters, chapter ranges, single verses,
same-chapter ranges and cross-chapter ranges within one book. Split multi-book
input into separately validated ranges. A `null` verse means an explicitly whole
chapter; it never means verse zero. Reject reversed, fractional, zero, unknown,
ambiguous and out-of-bounds coordinates. Preserve the supplied edit for repair.
Do not save a partly valid log by dropping its invalid ranges. Unsupported
systems cannot be saved as falsely normalized history; keep the attempted input
only in the current private form until the user corrects it.

Compare or combine ranges only within the same declared compatible reference
system, registry version and book. `John` and `1 John` are distinct. Whole-chapter
overlap expands against the registry's real bounds. Future registry updates must
preserve stored meaning and original input; any needed conversion requires an
explicit, reviewed mapping, never relabeling the same coordinates. A retired
registry remains readable for the owner's existing entries while new writes use
an accepted compatible registry or return a correction error.

Last position is one separately versioned, optional owner-private passage pointer.
An explicit “Continue here next time” action sets it; clearing it removes only
that pointer. Saving, editing or deleting a history entry does not silently move
it. It does not prove the passage was read or contain a note, provider token or
public share URL. A continue-reading action opens an implemented internal passage
view or an explicitly chosen safe external destination. No full-text reader or
provider integration is implied by storing the pointer.

## Progress, reminders and sharing

Reading is private by default and throughout its stored lifecycle. It must never
be described as a measurement of salvation, spiritual worth, devotion, religious
standing or eligibility for a church duty. No leaderboard, completion badge,
public streak, guilt message, inferred inactivity alert or church participation
metric derives from these entries. Missing history means no recorded entry, not
proof that someone did not read.

Later optional goals can describe the owner's chosen passages and dates. Distinct
passage coverage uses a union of compatible normalized ranges; overlapping logs
do not inflate coverage. Never display a “Bible complete” percentage without an
explicit declared reference system and denominator. A count of entries is labeled
as entries, not chapters, minutes, understanding or spiritual achievement.
Pausing or changing a goal keeps independent reading history. Empty history has
an ordinary “No reading entries yet” state, without judgment or invented progress.

Reminder preferences belong to the later plan/reminder service, default off and
separate from recorded reading. No registration of a setting or stored boolean
means a scheduler exists. Pausing stops future reminders; delivery must recheck
current consent, quiet hours, lifecycle and current plan state. Reminder copy and
lock-screen/email payloads must not reveal passages or notes by default. Child
time policies and after-limit essential access keep their separate family gate;
this adult definition neither enables nor claims to verify them.

Voluntary sharing is a later explicit composer action, not an audience change to
the private entry. The owner selects a specific entry or milestone and previews
the exact text, reference, optional date and destination audience before posting.
Notes are excluded unless individually selected and shown in that preview. No
earlier history, count, goal, last position or hidden fields are swept in. Use the
existing post publisher and current permitted audience choices; never invent an
audience ranking or bypass source restrictions through a tracker wrapper.

A published reading update is an independently versioned post containing only
the selected, previewed material. It grants nobody access to the underlying log
or a log-ID lookup. Explain before publication that editing/deleting the private
entry does not edit/delete an already published post; provide its ordinary
post-management action. Do not silently sync private corrections into wider
content. Account erasure and post withdrawal retain their canonical behavior.

## Curated learning resources

A learning resource has its own opaque identity, version and exactly one owner:
an eligible adult account or an approved, activated church. It is descriptive
resource metadata, distinct from a reading entry, media catalog item, post, image
asset or private save. Its publisher/author credit does not grant ownership,
verification, an endorsement or access to the author's account information.

| Metadata                     | Bound and meaning                                                                                                                                                 |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Title and description        | Required nonblank title up to 160 characters; optional plain-text description up to 5,000.                                                                        |
| Format                       | `ARTICLE`, `STUDY_GUIDE`, `COURSE`, `BOOK` or `MEDIA_REFERENCE`; labels describe the resource, not accreditation or platform hosting.                             |
| Publisher and author credits | Optional supplied text, each up to 200 characters, separate from the accountable owner and private rights evidence.                                               |
| Languages and topics         | Up to five existing discovery-language IDs and ten approved editorial topic IDs. Empty means unclassified; no inferred beliefs or automatic private-note tagging. |
| Scripture metadata           | Optional, at most 20 normalized ranges under the same reference contract. No reader identity or activity is attached to a passage search.                         |
| Destination                  | Exactly one currently permitted canonical media reference for `MEDIA_REFERENCE`, or one supported public HTTPS external link for another format.                  |
| Lifecycle and audience       | `DRAFT`, `PUBLISHED`, `UNPUBLISHED`, `REMOVED`; explicit publication audience as below. A resource's descriptive date never publishes it automatically.           |

Personal owners manage their own records. Future church writes require a new
explicit church-scoped `MANAGE_LEARNING_RESOURCES` capability for draft, publish,
edit and withdrawal. It is not granted by existing media, post, directory or
church-title permissions. The resource implementation must add that capability
through the canonical church grant/delegation owner with its ordinary current
scope checks; no new side table of editors or implicit grant is authorized here.
The dictionary itself changes no capability enum or actual grants.

“Approved resource” means deliberately published by its current authorized owner
after validation, rights assertion and safety checks. It does not mean independent
theological, identity, license or quality certification. Drafts are management-only.
Personal publication may select `PUBLIC` or `MEMBERS`; church publication may
also select that exact owner's `CHURCH` audience, using the catalog definitions.
No default inferred from church credit or a reader's personal settings. Current
membership, lifecycle, blocks, moderation and any required source restriction
must all permit the projection. An optional denied credit/link is omitted safely;
a denied required destination makes the whole resource unavailable.

The first resource implementation is a bounded metadata/link service. Reuse the
URL protections owned by `post-link-fetch.ts` where applicable, with an explicit
HTTPS destination policy and maximum 2,048-character URL. Reject credentials,
local/private destinations, private signed/bearer URLs and unsafe schemes. Do not
accept raw embeds, provider cookies or arbitrary HTML. Server-side preview fetching
is optional and must use the existing bounded transport and redirect protections;
it never licenses copying the resource or bypasses publication checks. Merely
viewing a resource makes no provider or third-party artwork request.

Resource commands use the same 32 KiB envelope, strict field validation and
expected-version/exact-body receipt boundary. Saves and resource list/detail
queries use at most 50 rows per page with bounded, batched source checks. Invalid
metadata retains the publisher's edit without a partial resource or rights write.

An external action identifies the destination and leaves the site only on the
user's action, without sending private notes, entry IDs, reading dates or history.
Suppress referrer information for that action. A restricted catalog wrapper
limits discovery here, not access to an independently public external page; show
that limitation before publishing restricted metadata. No claim of platform
download, offline availability, payment support, external availability or provider
privacy is inferred from a link. Unsupported native files and full Bible text
remain disabled until their specific storage and rights work is accepted.

Before publishing, record the accountable actor, time, policy version, source
fingerprint, intended audience and explicit rights basis for the material the
platform actually hosts or displays. Link permission is not permission to copy a
book, translation, cover, audio or study. Private evidence stays separate from
public attribution and never includes login secrets. A rights assertion is not
independent verification. Source replacement, audience widening and new displayed
material require current review/reassertion; an unchanged retry cannot extend an
expiry. Expiry, withdrawal or takedown blocks the affected source and projections.
The later rights inventory records the exact edition/license and obligations
before any hosted full text or downloadable content is activated.

## Private saves, lifecycle and implementation acceptance

A saved resource is an owner-only `(account, resource)` reference with one stable
save identity and version. Repeated saves are idempotent; unsaving removes the
private reference, not the resource. It is not a reading log or reading-completion
event. Reuse the private workspace interaction pattern, but do not store learning
resources in `SavedPostItem` or a copied post body. The later service must implement
the real adapter before adding working-looking controls or registry entries.

On each list, detail, export and retry, revalidate the resource and required
source. A withdrawn/restricted resource appears only as a generic unavailable
placeholder within an existing permitted private save, without its former title,
URL, source ID or hidden counts. Offer owner-only removal and an explicit retry.
A broken external link must have a route to the existing scoped report service
and a safe retry, without a background crawler or automatic source substitution.
Add the learning-resource report adapter before its public launch; do not create
a duplicate moderation queue or send the reader's history with a report.

The persistence implementation must extend canonical own-account export, erasure,
retention and protected recovery in the same feature. Export only that owner's
reading entries, notes, position and permitted saves, under the existing proof,
row/byte limits and no-silent-truncation rule. If those limits cannot represent
the data, return the established explicit limit error and resolve the supported
export path before claiming complete acceptance. Do not borrow organization
export authority. Deleted notes/body content must not survive in generic logs,
command receipts or duplicated audit payloads. Keep only the minimal accepted
operation/tombstone data needed to prevent replay resurrection under the existing
retention policy. An older backup must not restore erased history or rescinded
source access. No private material goes into shared browser storage, telemetry,
search indexes, sitemap, public metadata, push payloads or offline caches.

Required later acceptance includes:

- Quick passage/date create, correction, conflict recovery, exact retry, deliberate
  rereading, deletion and reload; explicit position set/clear stays independent.
- Registry alias, whole-chapter, cross-chapter and multi-book cases; malformed or
  incompatible systems fail without partial saves or silent coordinate changes.
- Another account, stale/revoked session, church manager and direct API caller
  cannot read entries, notes, position, counts, receipts or export. Browser Back,
  account switch and cached pages conceal private material after authority loss.
- Optional goals/reminders and sharing stay absent until implemented. Once added,
  pause retains history and stops reminders; a preview includes only selected
  fields, and posting leaves the underlying log private.
- Resource management, audience narrowing, source withdrawal, expired rights,
  broken-link reporting/retry, duplicate save and safe unavailable placeholders
  use current authority, including historical successful-operation replays.
- Own export and erasure, bounded pagination and protected restore preserve
  privacy and removals; readable empty/error states, keyboard operation and
  enlarged-text layouts pass against the built interface.

This definition needs no migration, environment change, dependency, provider,
network side effect or runtime bundle addition. Existing resource-registry and
reading-presentation checks pass: five tests, zero failures and zero skips. Copy,
document formatting, local-link and private-reference checks also pass. These are
baseline/definition checks, not proof of a working tracker; no new build, browser
suite or full regression is claimed. UI, persistence, resource publication, goals,
reminders, sharing and text hosting retain their separate implementation and
acceptance work.
