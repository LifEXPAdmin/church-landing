# Author content notes and safe excerpts

September 14, 2026 UTC · candidate product 2026.09.14.10

## Scope and behavior

Authors can optionally enter a content note (120 characters) and safe excerpt
(160 characters) in the shared composer and published post editor. Neither choice
infers an author's health, beliefs or eligibility. React renders both as plain
text. A noted feed/quote preview shows the note and author-selected excerpt, or a
generic invitation to open the post. It does not mount hidden photos, link cards,
Scripture or participation controls. The direct post presents its note above the
full text. A safe excerpt without a note changes short previews but leaves the
ordinary feed body visible.

Search, saved items and public metadata use current canonical choices. Anonymous
source permission remains the upper bound for sharing metadata; a signed-in
member cannot produce a public preview of a church-only prayer. Public prayer
metadata stays generic unless its author explicitly supplies a safe excerpt.
Existing notification bodies remain generic. Reposts retain canonical attribution
and current source permissions instead of copying a note or excerpt.

Private drafts retain exact incomplete choices up to 1,000 characters each.
Publication rejects excessive text without truncation. Legacy fieldless snapshots
remain readable; an older complete-snapshot save cannot drop existing nonempty
choices. Explicit empty fields clear them. Published edits that omit these fields
preserve existing values. Draft versions, exact-body retry receipts, source and
reply-permission gates remain in force.

Published management forms pin the current account, protect unsaved navigation,
conceal retained forms on blur and confirm uncertain original requests through
the existing social receipt owner. Current authority is required before receipt
replay. Link validation stays outside the permission transaction. Conflicts show
the latest choices and require explicit review before saving retained entries.
The full detail body reuses the current-source version guard; editing and reply
forms remain outside that body boundary. Each active detail check uses the existing pinned transport: identity, one
bounded availability read, then identity. It runs at entry/resume and the existing
30-second interval. Authorized management snapshots likewise use that transport.
This adds no new ordinary-feed request or dependency. Measured production route
assets add 1,503 gzip bytes to Home and 2,495 to post detail compared with the
previous release (per-file gzip totals, excluding cache and network latency).
No latency improvement is claimed.

Owner export includes authored choices. Unreported withdrawal and account erasure
clear the note and excerpt. Only selected canonical report evidence can retain
them; expiry of the last report clears that retained text. Reviewer and author
reconsideration views apply their existing authorization boundaries.

## Validation and release state

- Eight isolated suites pass 56 tests, including seven focused note/preview,
  receipt, authority and erasure groups; populated migration and dump/restore
  preservation pass. Production writes and external sends are zero.
- The full gate passes all 123 discovered test files: 760 executions, 758 passes,
  two expected skips and zero failures. Both builds and all HTTP/render checks
  ran the final runtime source in `499a73c59abe12e9737b7c93abef7d89913144a0`.
  Nine built-browser groups pass with zero page errors, including a real library
  resume and publication. The later `4ea650b` changes only the browser test script;
  runtime source is identical. Three final captures were visually inspected.
- Types and scoped lint pass. Runtime tracing passes 146 traces, 3,259 entries and
  368 server JavaScript files, without private fixture/environment leakage.
- Encrypted production-copy upgrade 48→49 passes at 13:20:59 UTC, preserves every
  original column across 92 tables and completes protected recovery replay.
  Production is unmodified. Exact deployment/live and installed-backup acceptance
  remain pending; this checkpoint is not a production completion receipt.
- Migration 49 adds two nullable text columns and length constraints, without
  backfilling author choices or changing previous migrations.

Broader age ratings and child eligibility in the original sensitivity proposal
remain outside this feature's current scope, with their partial disposition in
the existing private task. Actual operator assignment, provider and physical
acceptance prerequisites stay open. Keep the batch's final review last.
