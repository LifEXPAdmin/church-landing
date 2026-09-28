# Scripture reference registry sources

Reviewed 28 September 2026 UTC. This is factual reference metadata for the
[media catalog contract](MEDIA_CATALOG_CONTRACT.md), not a declaration of canon,
a Bible edition, a translation license or a cross-system conversion service.

## Frozen source and license

The registry derives book IDs, English names and chapter verse maxima from
[SIL Global libpalaso](https://github.com/sillsdev/libpalaso/tree/6b01291d1b5a87a40a2d72c3abe63337fa2195b4),
commit `6b01291d1b5a87a40a2d72c3abe63337fa2195b4`. Its
[MIT license](https://github.com/sillsdev/libpalaso/blob/6b01291d1b5a87a40a2d72c3abe63337fa2195b4/LICENSE)
is preserved verbatim in [the third-party notice](../../third_party/sil-scripture-LICENSE.txt).
The selected source files contain no separate licensing restriction. Preserve
the copyright and permission notice with redistributed derived registry data.
No Scripture text, audio, images or provider content is included.

The checked-in [registry data](../../lib/platform/scripture-registry-data.json)
records immutable raw source URLs and SHA-256 values for all four inputs:

| Source path within the pinned commit  | SHA-256 of original bytes                                          |
| ------------------------------------- | ------------------------------------------------------------------ |
| `LICENSE`                             | `b1f6bf8b2490437784c3c29b7e6f9997fd05e6a3dfd87353b65b47e1f18ff2fc` |
| `SIL.Scripture/Canon.cs`              | `0b937ea4cacf228c8b5dbf9ddc7f41b0dc17799fde5816fd7f676725592f3f76` |
| `SIL.Scripture/Resources/eng.vrs.txt` | `003981c7f43c69b73b60d40a3f35f72e7ee017a686a6fb206f19a1b721157541` |
| `SIL.Scripture/Resources/org.vrs.txt` | `1caee506dc4cc2947e45861c7d2ba5b5eeca9063ee263a37f2ca08f240e457ca` |

The frozen registry version is
`sil-libpalaso-6b01291d1b5a-gc1-6cc08aba6699`.
Persist it with the selected reference-system ID and each normalized range.
The upstream version label alone is not a sufficient reproducibility identifier.

## Declared coverage

| System ID | Display label                            | Upstream version | Supported book IDs |
| --------- | ---------------------------------------- | ---------------- | ------------------ |
| `sil-eng` | SIL English numbering                    | `2.0`            | 86                 |
| `sil-org` | SIL Original numbering (BHS OT / GNT NT) | `1.200`          | 89                 |

These labels describe the source numbering tables. They do not imply that every
English edition, denomination or modern BHS/GNT edition uses the same numbering,
or that every listed book belongs to one edition. A publisher and a searcher must
explicitly select a system. Language, church, denomination, array order and
an omitted input never select one. Unsupported systems stay unclassified.

There are 91 distinct current book IDs and 126 distinct chapter-bound arrays.
The data interns identical arrays to avoid duplication. Identical bounds do not
establish that two systems or two books contain equivalent verses. The API does
not expose upstream conversion mappings or a universal cross-book verse index.
The compact JSON measures 17,156 bytes, or 5,199 bytes with Node's default gzip.
That measures this data file, not the complete client bundle or transfer cost.

Both selected tables have contiguous positive chapter numbers, positive verse
maxima, and no excluded-verse or verse-segment declarations. The six source IDs
`JSA`, `JDB`, `TBS`, `SST`, `DNT` and `BLT` are explicitly obsolete in `Canon.cs`;
they are omitted and recorded as exclusions in both systems. They are not aliases
for current books. All other explicitly declared rows are retained. No missing
book or chapter inherits the upstream library's placeholder value of one verse.

English has 270 mapping lines and Original has eight, including any `#!`
extension mappings. None becomes a book bound or a conversion rule. Verse zero
appears in upstream mappings, not the supported positive-coordinate table.
Title/superscription verse zero and lettered subverses remain unsupported input.

Other source systems are intentionally not claimed as supported. The inspected
Septuagint table has 304 excluded verses and 74 segment declarations, while the
Vulgate table contains the sparse row `6EZ 1:63 12:78`. Adding those systems needs
explicit exception handling and verification; do not fill the missing chapters,
discard exclusions, silently correct the source or import mappings as bounds.

## Names and aliases

Current IDs and full names come from matching entries in `Canon.cs`, with
parenthetical distinctions preserved. Additional aliases are a small explicit
application list in each book's `aliases` array. Case and repeated whitespace
are normalized; punctuation, digits, Roman numerals and omitted words are not
guessed. Three-character source IDs are accepted aliases too.

Examples include `John`, `JHN` and `Jn`; `1 John`, `1JN`, `1Jn`, `1 Jn` and
`1John`. John and 1 John always have different IDs. `Sirach` and `Ecclesiasticus`
are explicit names for `SIR`. Translated names are not generated automatically.

An alias shared by multiple supported books yields multiple candidates and the
single-book resolver returns null. For example, bare `Esther` is ambiguous in
both systems; bare `Daniel` is ambiguous in English where `DAN` and `DAG` coexist.
The publisher can use an explicit source ID or the qualified full name. Never
select the first candidate. Exact original reference input belongs to the owning
parser/editor, independently of these aliases.

## Reproduce or update the extraction

1. Read the four URLs in `sources`, verify each raw byte SHA-256 before decoding,
   and decode UTF-8 with an optional BOM. Never use a moving branch or a runtime
   network fetch. Retain the source license verbatim.
2. Extract the quoted entries in `Canon.cs` arrays `AllBookIds` and
   `allBookEnglishNames`, keeping positional correspondence. Assert equal array
   lengths. An English name containing `*obsolete*` excludes that ID; do not
   remove the label and republish the old ID as current.
3. Process English followed by Original in source line order. Trim lines and
   remove a leading `#!` before classification. Ignore empty lines and ordinary
   comments. Count and ignore mapping lines containing `=`. Fail for any
   exclusion (`-`), segment (`*`) or other unrecognized non-comment line, rather
   than silently broadening this extraction. Bounds must match
   `BOOK chapter:maxVerse ...` in full, with a three-character alphanumeric ID.
4. Assert known book IDs, one row per book, chapter numbers exactly 1 through N,
   and positive integer maxima. Record and omit obsolete rows. Intern identical
   verse-maxima arrays by first encounter. Each system maps its explicitly
   supported book IDs to these array indices. These indices are storage offsets,
   not cross-system equivalence declarations.
5. Emit the union of supported books in `AllBookIds` order with their exact source
   names. For each, emit ID, source name and the reviewed application aliases,
   deduplicating only by lowercased collapsed whitespace. The existing checked-in
   alias arrays are the exact reviewed list for this revision; adding an alias
   requires collision tests and a new registry version. Keep collisions visible
   to the resolver rather than resolving them by insertion order.
6. Serialize payload keys in order `upstreamCommit`, `sources`, `books`,
   `chapterBounds`, `systems`, with compact JSON separators and literal UTF-8.
   Its SHA-256 prefix is `6cc08aba6699`. Prepend `registryVersion` with the value
   above and add one final newline. Whitespace reformatting alone does not change
   semantics, but any source, bounds, alias or exclusion change needs a new frozen
   version and explicit compatibility review. Never rewrite stored references
   merely because a newer registry becomes available.

## API and integration boundary

The [registry module](../../lib/platform/scripture-registry.ts) exports:

- `SCRIPTURE_REGISTRY_VERSION`, `ScriptureSystemId`, `ScriptureSystem` and
  `ScriptureBook`.
- `scriptureSystems`, a readonly summary list containing `id`, `label`, `version`,
  `sourceVersion` and `bookCount`.
- `getScriptureSystem(id)`, returning a system or null.
- `scriptureBooks(systemId)` and `getScriptureBook(systemId, bookId)`. Book
  records contain `id`, `name`, `aliases` and `chapters`; index chapter minus one
  to obtain that chapter's positive verse maximum.
- `normalizeScriptureBookAlias(value)`, `scriptureBookMatches(systemId, name)`
  and `resolveScriptureBook(systemId, name)`. Matches remain explicit; the
  resolver returns null for both unsupported and ambiguous input.

Unknown system IDs return null or an empty list, never another system. Returned
records, aliases and chapter arrays are frozen. The module performs a small
in-memory integrity check when it constructs its lookups, enforcing every verse
maximum from 1 through 999 for the parser's within-book coordinate stride.
Its explicit JSON import attribute also supports Node 24 native TypeScript tests.
It has no runtime
package dependency, filesystem access, Bible text or network request. Prefer
passing the small system summaries from a server component to a client that
does not need book parsing, rather than importing the entire registry there.

The owning feature must still implement parsing, inclusive overlap within the
same book/system/version, editing, publication, privacy filtering, pagination,
export and erasure. This registry alone does not establish those acceptance
gates or license any Bible edition.
