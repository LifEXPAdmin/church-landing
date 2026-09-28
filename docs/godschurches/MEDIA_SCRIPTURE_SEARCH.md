# Media Scripture passage search

## Local implementation, 28 September 2026 UTC

The media editor, detail reader and library share validated Scripture tags on the
existing canonical catalog record. This feature is in local verification. It is
not yet merged or verified live. The current production release remains .35.

Publishers explicitly select a reference system and supply one or more passages.
The interface preserves correction text, explains malformed or ambiguous book
names, and previews the normalized tags. Readers search by an overlapping range
within the selected system. The existing audience, publisher eligibility, blocks,
current rights, publication and recovery predicates apply before counts and
pagination. No reading-history record, Bible text or external request is added.

## Reference contract

The frozen registry supports two explicitly named SIL numbering systems. See
[source, coverage, aliases, exclusions and licensing](SCRIPTURE_REFERENCE_SOURCES.md).
There is no default system or automatic cross-system conversion. Unsupported
systems and ambiguous aliases produce correction guidance. This is reference
metadata, not a denominational canon or a claim that every edition uses the same
numbering. Chapter and verse bounds come from pinned, reviewed primary data.

Accepted expressions include a whole book, a chapter, chapter ranges, single
verses, verse ranges and cross-chapter ranges. Semicolons or line breaks separate
complete references. John and 1 John are distinct. Whole-chapter endpoints retain
their explicit null verse marker and expand through that registry for overlap.
Ranges are inclusive. Every supplied coordinate and key is recalculated from
the original text on every write; forged coordinates and unsupported versions
are rejected. Identical normalized tags merge while retaining their distinct
original strings. At most 20 ranges, 40 supplied references and 8,000 total text
characters are accepted.

The query adds one bounded JSON-array overlap predicate to the existing media
selection and count queries. The predicate compares system, frozen version and
book before local chapter/verse coordinates; it introduces no universal book
ordering. The ordinary 20-item page and permission-filtered total remain. Tests
measure two overlap queries for a multi-page result, with no per-item query.
That establishes a bounded query count, not catalog-scale latency: scanning work
can still grow with the number of eligible catalog records.

## Storage, privacy and compatibility

Migration `20260928005500_media_scripture` adds only
`MediaCatalogItem.scriptureRanges`, a non-null JSON array defaulting to empty,
with a database array/20-entry bound. It grants no duties and does not infer tags
from descriptions or existing free-form post Scripture. The isolated 119-to-120
application preserved all 205 prior media-record fingerprints and left every new
field empty. Invalid object and oversized-array values were rejected.

Tags are part of the existing complete-field rights fingerprint, optimistic
version and exact-request receipt. A client that omits tags from an already
tagged record receives a reload conflict rather than erasing them silently.
Deliberate clearing uses the current editor and the ordinary rights review.
Personal export includes authorized supplied tags; removal, erasure and stale
protected replay clear them. Church metadata remains owned by its existing
church policy. Shared account-export/erasure owners call the same media adapter.

After tags are activated, any fallback application and installed recovery owner
must clear this new field during erasure and replay. The earlier .35 media
adapter alone is not that compatible fallback. Production migration, recovery
registration, exact-source build/CI, combined release and live readback remain
required before acceptance.

## Local verification checkpoint

All 32 parser, catalog input and service groups pass. They cover every declared
book's first and last bounds, book/system/version separation, inclusive overlap,
malformed input, forged coordinates, current audience and blocks, exact replay,
old-client conflicts, explicit clearing, export/removal/erasure/recovery and dense
pagination. Four immutable primary inputs were independently checksum-verified.

The actual HTTPS development browser passed nine groups: validation/correction,
original input round trips, publication, an accepted save with a lost response,
account replacement, exact retry, search and current rights revocation. Seven
POST attempts produced six mutations/events/receipts, with no duplicate from the
retry. No external requests or page errors occurred. These are fictional local
records, not production writes or a physical-device claim.

Before fixes, the browser reproduced private values retained under a hidden DOM
ancestor, whitespace added to originals on an unrelated save, and keyboard focus
covered by fixed navigation. The editor now unmounts concealed private fields
and notices while retaining unsent state; loaded original arrays and registry
versions survive unchanged until an explicit passage edit. A second regression
covers multiple valid originals whose combined display exceeds one entry's limit.
The shared mobile focus margin now uses the existing measured navigation height.
Four keyboard captures at 320 pixels and normal/doubled root text sizes passed
geometry and hit-target checks and visual inspection.

A suspected oversized-request retry trap was disproved: an actual 36,701-byte
POST returned HTTP 400, kept entries editable and wrote no media record. No
speculative error-handling change was made. Failed harness selector attempts and
all reproductions remain in private evidence. TypeScript, scoped lint, copy and
source-security checks pass. Exact-source production build, built-browser,
integration, protected/installed recovery and verified-live gates remain open.
