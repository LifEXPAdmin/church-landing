# Church duplicate resolution and campus relationships

## Definition and implementation gate

September 19, 2026 design against application `f096aa3`. This contract defines
reviewed duplicate resolution and informational campus relationships. It adds
no schema, merge command, redirect, authority, campus editor or background job.
Implementation requires a documented real duplicate or campus case and a scoped
implementation task. The current production inventory does not establish that
need. Do not create fictional production records to justify implementation.

Reuse [community listings and corrections](CHURCH_LISTING_REPORT.md),
[representative claims](CHURCH_CLAIM_REPORT.md) and
[visitor information](CHURCH_VISITOR_INFORMATION_REPORT.md). A suspected match
currently requires an independent listing reviewer or explicit confirmation that
the new listing is distinct. Nothing is automatically merged. A correction
preserves its Church ID and compares the current version. Claim operations retain
their separate operating-policy and independent-reviewer activation gate.

There are three different outcomes: correct one existing listing, resolve two
public listings for the same church, or link distinct campuses. Similar names,
addresses, websites, denomination, a shared representative or a matching search
result cannot choose an outcome or prove authority. A campus is not a duplicate
merely because its parent organization uses the same name.

## Stable identity and separate access scopes

Keep every existing Church ID and its historical references. The public detail
route is `/platform/churches/[churchId]`; do not assume the stored unique slug is
the current route key. A public canonical listing relationship is distinct from
the original Church ID used in membership, audience and management checks.

The initial supported resolution is consolidation of public discovery and public
facts, with retained source records and private scopes. It is not a destructive
foreign-key rewrite. A member of source church A keeps that connection and its
permitted A content after the public listing resolves to B. That member gains no
B membership, B directory, B post, management grant or formal church status. A B
member gains no A access. Being connected to both retains both existing records
where such history already exists; it does not bypass the current affiliation
policy or manufacture a new active connection.

Existing private entry points continue to authorize against the original scope
and show that scope clearly. Public discovery may identify the selected public
listing while an authenticated church workspace preserves the member's original
connection. Do not redirect private workspace, directory, review, management,
calendar or API commands to the public canonical ID. Do not apply an alias
resolver inside `membership`, effective grant checks or source audience checks.

If a later real case requires moving people or content into a single private
scope, that is a separate, explicitly reviewed migration. Obtain each required
member/owner decision through the current join/leave, claim, assignment and
publication owners. The duplicate decision alone does not authorize it. Existing
connections remain usable until their own valid transition; never silently leave
one church or approve a pending connection to make a merge convenient.

## Review and execution contract

1. An eligible contributor reports the exact source and proposed target, outcome
   and reason. Keep private evidence out of public listing facts. Show the current
   public facts side by side, including supplied visitor information, with an
   explicit field-by-field proposed result and unknown fields left empty.
2. A currently authorized independent reviewer establishes whether the records
   describe the same real church or separate campuses. Record minimal evidence,
   source references, decision, reason and review time. Self-review is denied.
   Existing listing-review permission may support fact review; it does not by
   itself authorize a new cross-church resolution operation or grant access to
   restricted claims. Before implementation, define and approve that narrowly
   scoped operator authority and the conflict/dispute procedure with its owner.
3. Bind the proposal to both exact IDs, canonical versions, management versions,
   current resolution state and the complete public-field proposal. Choose the
   public target from the verified real identity and continuity of existing links,
   not account popularity, oldest ID alone or the contributor's preference.
   Where evidence conflicts, request information or reject; keep both records.
4. Independently authorize execution and re-read current eligibility, reviewer
   scope, versions, all competing resolution relationships and current disputes.
   A withdrawn approval, new management conflict or stale version requires new
   review. An old claim approval cannot activate through the target's authority.
5. Use the existing transaction/idempotency patterns for one atomic, auditable
   public resolution. Prevent simultaneous A-to-B/B-to-A, self-links, cycles and
   conflicting targets. An operation key binds the exact reviewed payload. An
   acknowledged retry returns its recorded result after current access checks;
   a different payload or incomplete result must not apply twice.
6. Before activation, verify an affected-record manifest and recovery rehearsal.
   Commit the public relationship and selected public facts together or neither.
   Do not enqueue unbounded rewrites of all references. Afterward reconcile the
   manifest, affected public indexes and current private access checks. A failed
   readback leaves acceptance open even if the transaction committed.

Review evidence, participant details and impact inventories are restricted to
their existing owners and approved operational scope. A public resolution notice
contains only confirmed public identity/facts and the public relationship. No
member list, claim evidence, dispute allegation or private record count appears.

## Preservation by current owner

| Existing records                                                               | Required preservation                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ChurchConnection`, directory preference and connection requests               | Keep IDs, state, version, approved-since and original church. Retain directory consent and current eligibility. Do not combine two records or resolve a pending/denied/approved conflict by choosing the most permissive state.                                                    |
| Capability grants, role grants, positions, templates/revisions and assignments | Keep exact church, connection, originating claim, expiry and revocation dependencies. Composite church/connection references must still agree. No inherited role or union of capabilities.                                                                                         |
| Claims, listing submissions/decisions and church audit history                 | Keep source ID, submitted snapshots, private evidence restrictions and decision history. New facts use a separate reviewed version. Existing claim activation must recheck its original management scope; a target relationship grants nothing.                                    |
| Posts, comments, private drafts, welcome content and threads                   | Keep canonical post/comment IDs, authorship, original audiences, reply permissions and notification context. A public listing relation neither republishes church-only content nor changes who may reply. Welcome configuration stays within its original scope.                   |
| Calendars, events, church shares and saves                                     | Preserve canonical IDs, share/connection dependencies, source permissions, dates and saved references. Public discovery consolidation does not combine calendars or broaden church shares.                                                                                         |
| Photos, albums and canonical media                                             | Keep source ownership, purpose, exact audience, current delivery checks and removal/retention barriers. Select a permitted public listing image explicitly; never copy a restricted URL into the target.                                                                           |
| Groups, Exchange listings/needs, pantry and support cases/shares               | Keep owning/audience churches, memberships and requester/coordinator dependencies. Existing private operations remain at their original IDs and scoped routes. No automatic hub merge, group join or support disclosure.                                                           |
| Follows, bookmarks, reports, exports and recovery records                      | Retain stable reference IDs and original private scopes. Deduplicate a public display only after current authorization; do not delete history or turn a follow into membership. Owner exports retain the original reference plus only currently permitted public resolution facts. |

Before implementation, enumerate all current schema relations and indirect JSON
references, not just this dated inventory. Many references are restrictive or
composite; some use cascading deletion. Deleting a Church to remove a duplicate
is therefore prohibited. The manifest records counts and scoped integrity checks
without exposing private content. Preserve source-version/deletion barriers in
protected recovery, not only SQL foreign keys.

## Public URLs, search and stale clients

Retain old public Church URLs indefinitely as resolvable stable references while
the source exists under retention policy. For an approved public duplicate, an
old public detail can display the selected target's permitted public projection
with a clear identity notice and canonical metadata. A same-origin public-only
redirect may be considered after undo/cache behavior is proven. Do not start
with a permanent redirect that makes a mistaken decision impossible to reverse.

Canonical and Open Graph metadata, structured data and share previews must use
the same current public decision; no private redirect target, hidden church,
evidence or stale restricted metadata is exposed. Query strings, return paths and
fragments must remain validated; never copy an arbitrary destination into a
redirect. Existing post/event/group URLs continue to reach their own canonical
resource and current authorization, even when their public church link resolves.

Search may collapse an approved public duplicate into one result with permitted
former public names as match aliases. Rejected/withdrawn proposals do not affect
search. Apply current visibility before pagination and counts; bounded queries
must not perform per-result private relationship scans or expose hidden matches.
Direct ID lookup checks the current relationship with a bounded, cycle-safe
resolution. No indefinite alias-chain traversal or background polling is needed.

Old private forms continue submitting the exact original Church ID and version.
Do not silently rewrite stale operations. A listing fact editor opened before a
resolution must receive a conflict with a safe reload/review path; drafts remain
recoverable. The future command must explicitly invalidate affected public-fact
versions and recheck approvals so stale publication cannot overwrite the result.
Any change to management semantics requires fresh claim review, not aliasing.

## Multiple campuses

Each distinct campus keeps its own Church ID, public facts, visitor information,
connections, claims, grants, calendars, posts and groups. An optional parent or
sibling relationship communicates public organization structure only. It cannot
transfer formal membership, approve a claim or imply that one campus's manager
controls another. A person serving several campuses receives each actual scoped
assignment through the existing authorized process.
The current single active affiliation restriction still applies. This design
does not promise simultaneous campus appointments or relax their connection
dependencies; any such expansion requires its own accepted policy and workflow.

Review both sides' identity and consent through authorized independent channels
before publishing an organizational relationship. One administrator cannot attach
an unrelated church. Reject self-links, cycles and contradictory active parent
relationships; define one current public parent per campus for the initial
bounded model. Do not infer a hierarchy from names or websites. Independent
congregations sharing a building can remain unrelated listings.

Public navigation labels the selected campus and its distinct address/service
details. A parent page cannot claim all campus visitor facts apply everywhere.
Campus lists use bounded public projections. Switching the viewed campus changes
navigation only; no join, follow, message or management action happens implicitly.
Removing a relationship preserves all campus records and original links.

## Undo, recovery and required acceptance

Undo is a new reviewed decision, not deletion of audit history. Because public
resolution retains the original records/scopes, it can deactivate the public
relationship and restore reviewed public facts using current version checks.
Do not overwrite legitimate edits made since resolution. Conflicts require a
new field-by-field review. Invalidate public caches/metadata and prove old links
work in both directions. Unpublishing a target cannot expose a formerly hidden
source as a fallback. Keep a safe unavailable response when access is uncertain.

Before enabling runtime, demonstrate:

- Two populated source scopes survive approval, exact retry and concurrent/stale
  review without changed membership/grant rows or widened visibility. Include
  pending, revoked, blocked and inactive accounts, cross-church roles and expired
  claims. A claim approved before resolution cannot gain target authority.
- Every preserved resource family above retains identity and links. PUBLIC,
  MEMBERS and exact-CHURCH HTML/RSC/API/search/share/export checks contain no
  denied sentinels or private counts. Recheck source loss after a page opens.
- Reviewer loss, self-review, conflicts, cycles, repeated requests and partial
  failure fail closed. Public-fact preview matches exactly what execution changes.
  A real browser journey covers report, independent review, conflict/retry, old
  public URL, original private workspace, campus navigation and reviewed undo.
- An additive migration and protected production-copy restore preserve every
  original table/column fingerprint except the explicitly approved public facts
  and relationship records. Replay current revocations and removals before traffic
  resumes. Rehearse interruption and forward repair without destructive restore.
- Measure bounded lookup/search queries and any client/request cost. Run the
  required combined regression, browser, recovery and exact live-release gates.
  No bulk external notifications or recipient sends are implied by this design.

Definition acceptance does not mean a merge occurred, campus support shipped or
the claim operating gate opened. The immediate result is an implementable review
and preservation contract; real-case justification and runtime acceptance remain
explicit prerequisites to building it.
