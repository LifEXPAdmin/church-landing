# Composer and feed taxonomy contract

Inspected 11 September 2026 against integrated application `c7067ae8` (main
receipt `7a5a9ab`). This documents the implemented composer; it adds no selector,
schema, inferred category or feed policy.

| Field | Current contract | Source |
| --- | --- | --- |
| `type` | `TESTIMONY`, `PRAYER`, `TEACHING`, `UPDATE`, `NEED`; omitted input defaults to `UPDATE`; unsupported values are rejected | [schema](../../prisma/schema.prisma), [commands](../../lib/platform/post-commands.ts) |
| `topics` | Ordered string array, zero to five distinct exact values; omitted or null input defaults to `[]` | [options](../../lib/platform/post-options.ts), [commands](../../lib/platform/post-commands.ts) |
| Supported topics | `prayer`, `testimony`, `scripture`, `fasting`, `worship`, `service`, `community`, `family`, `questions`, `encouragement` | [options](../../lib/platform/post-options.ts) |
| Topic normalization | None: no case folding, trimming, synonyms or inferred denomination. Duplicates, unknown values, other non-arrays and more than five entries fail with 400 | [commands](../../lib/platform/post-commands.ts) |
| `content` | 3–3,000 JavaScript string units after CRLF/CR normalization to LF; validate length before final trim; never truncate | [field validation](../../lib/platform/post-access.ts) |
| `scripture` | Optional text, at most 120 string units with the same newline/trim behavior; empty persists as null | [commands](../../lib/platform/post-commands.ts) |
| `audience` / reply audience | Separate from category/topics; PUBLIC or scoped CHURCH and VIEWERS or CHURCH_MEMBERS. Tags never grant visibility | [access](../../lib/platform/post-access.ts), [commands](../../lib/platform/post-commands.ts) |

[PostDraftFields](../../components/platform/post-draft-fields.tsx) uses the shared
options, displays the selected count and disables additional unchecked topics
at five. [PostComposer](../../components/platform/post-composer.tsx) starts with an
empty array; [PostControls](../../components/platform/post-controls.tsx) restores
existing editor choices. The server remains authoritative if a client is bypassed.

[Post session readers](../../lib/platform/post-session.ts) call the existing
[post reads](../../lib/platform/post-reads.ts). Its projection returns `type` and
`topics` only after the current source visibility predicate. Home selection
applies community/following mode after that predicate. The existing `PostQuery`
has no topic-filter input. Explore currently searches matching `content` and
`scripture`, not enum categories or tags. People search is a separate projection;
member bio search is only included for a signed-in viewer.

The database default is `topics: []`. Existing stored topics are passed through
by the read projection, not normalized against the current dictionary. No live
row census was performed. Future feed work must decide how to show/filter any
legacy unknown values without rewriting an author's choice or widening access.
Unsupported new writes are already rejected. This is the explicit compatibility
question for the existing feed-policy foundation; no additional backlog is needed.

Representative existing verification: [post publishing tests](../../tests/post-publishing.test.ts)
cover selected scripture/encouragement topics, duplicate and unknown rejection,
Unicode content limits, and stable create retries. [post editor tests](../../tests/post-editor.test.ts)
and [early community tests](../../tests/early-community.test.ts) cover editor and
feed boundaries. Run evidence belongs in the current session receipt; inspecting
these fixtures does not itself claim a fresh test pass.
