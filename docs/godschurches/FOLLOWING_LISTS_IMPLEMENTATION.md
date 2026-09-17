# Private following lists implementation

## Verified release, 16 September 2026 UTC

Product **2026.09.16.13**, release **private-following-lists**, application
**d10ac20a6004b92c1a601ee5cbb49ddfc5e7c045** is READY in
**dpl_8HNSiCsRye4KdzS5dHoNjybMcakF** at **23:53:03.543 UTC**.
Independent canonical assignment and the serving release/build were confirmed
at **23:54:06.201 UTC**. This receipt records that exact application release;
a subsequent documentation checkpoint does not change its serving identity.

## Implemented behavior

Reuse SocialPreferences with three additive fields, independently versioned from
discovery forms, and existing follow records. Twenty private lists may each hold
100 current follows. Names and membership are account-owned. Current personal
follow IDs and church follow epochs prevent silent membership revival. Canonical
unfollow, block and friend-removal paths remove matching entries and record an
opaque protected recovery version. Export includes the owner's choices; erasure
removes the owning preferences.

The private Connections page supports creating and renaming lists, atomic name
and membership edits, bounded follow search and pagination, explicit feed use,
deletion and restrictive recovery. Deleting a selected list preserves a tombstone
until the owner chooses a new selection; it never deletes follows. Settings,
account returns, product help and release notes are integrated. The registered
Settings entry is `feed.lists`, under Feed and discovery.

Following intersects each list with current follow, post audience, source, mute
and block rules. Reading sets and retained-card availability bind to the selected
list and document version. Older feed and discovery forms preserve independent
lists. Full list documents are read only for Following; other feeds avoid that
payload. Private names are concealed during foreground/account rechecks and when
member availability changes. Forms retain their original version and exact
uncertain request. The existing Exchange private-save hook is shared without
changing its interface or behavior.

## Verification

The complete clean gate on the exact application SHA exits zero: **181 discovered
test files, 1,128 reported tests, 1,126 passes, zero failures and two expected
production delivery-disabled skips**. It includes populated historical upgrade,
96 fresh migrations, dump/restore, the production build, development and actual
production HTML/RSC over locally verified HTTPS. The skipped delivery cases are
covered in the development phase.

Nine final built-browser groups pass: safe guest return; the actual Settings
link; lost-successful-response recovery and exact retry; atomic editing and
unsaved navigation; narrow/enlarged dark layout and selected feed behavior;
account-switch concealment; changed member availability without a saved-version
change; block pruning; and selected-list deletion preserving follows. Eight
existing Exchange handoff browser groups pass after sharing save recovery.
No browser runtime errors were observed. Final mobile screens were inspected;
this is desktop browser emulation, not physical-phone acceptance.

The focused combined run passes nine list, 15 discovery and 14 legacy-feed
checks. Ten Settings/help/release checks and 33 additional service/static checks
also pass. TypeScript and website copy pass; ESLint reports zero errors and the
same 35 existing fixture warnings. All write scenarios use isolated fictional
accounts and no external recipient delivery.

Canonical live acceptance passes **72 public/access, six health and six existing
signed-in groups**. The actual Settings and Connections links open the owned
editor. Following loads current posts and its All following selector, and its
management link returns to the unchanged private editor. No form was submitted.
Guest routes expose only safe account entry and private APIs deny unowned reads.
The actual provider-verified hydration renderer is served. Scoped provider
error/fatal rows are zero from READY through **23:59:03.926 UTC**.

## Data and recovery

The protected production-copy rehearsal upgrades 95 to 96 migrations, preserves
all 131 original table projections and completes protected recovery replay.
It uses verified TLS, an encrypted backup and an isolated restore. All 96 live
and installed-recovery migration checksums match, with none pending.

All **130 non-cache table fingerprints** match the original **22:36:36.843 UTC**
baseline through **23:59:38.001 UTC**. Private-list documents, changed list
versions and recovery flags remain zero. No verification account, content,
relationship, preference, grant or recipient-send writes occurred.

Reading sets are an explicit exception to a zero-write claim. Before deployment,
the original single cache row had been replaced by two weekly sets created at
23:39:15 UTC; that intervening activity is recorded separately. The immediate
pre-acceptance cache baseline matched the fresh read. Signed-in verification
then created **one temporary Following set**, removed **zero** sets and changed
no existing set. The two pre-existing, unexpired sets were preserved.

Installed daily recovery restores **131 tables**, removes the plaintext restore,
and leaves production unmodified. Nightly validation passes **68 sets**, with
zero issues and removals. The recovery registry preserves its 95 earlier entries
and adds the new migration. No provider, worker or dependency is added.

## Measured cost

The isolated client bundle comparison adds **940 gzip bytes** to Home and My
feed, **125** to Connections and **151** to Exchange. The new private-list route
totals **153,248 gzip bytes**, including shared application chunks.

A bounded local fixture uses 100 follows/posts and 20 lists of 100 entries each.
Selected and unselected 30-post projections have the same SHA-256. Following
uses 20 SELECTs without lists and 21 with the selected maximum list; samples are
38.42 to 40.31 ms and 48.31 to 49.06 ms respectively. The list document is
227,673 bytes. The private editor returns 100 members and a 20-candidate page in
23,058 bytes with 15 SELECTs, sampled at 8.72 to 9.81 ms. These local costs do not
establish hosted latency or capacity.

## Diagnostic history and remaining scope

The first complete gate stopped after 1,088 passes because the new Settings ID
contained a hyphen. The ID was corrected to the existing letters-only contract;
the entire gate then passed on d10ac20. Earlier focused attempts caught missing
recovery constraint entries and a legacy synchronous validation contract, both
repaired and retested. Fixture audience, local-journal directory and asynchronous
browser-selector mistakes are retained in private diagnostics. Failed checkpoints
are distinct from the final successful acceptance.

Named private-list scope is complete. Optional contact lookup remains disabled
behind its explicit discoverability and anti-enumeration policy requirement.
Broader relationship acceptance still needs its specified actual-phone account
switching, disconnected recovery and blocked-member observations. These are not
established by browser emulation. Continue eligible church Needs in the unified
feature workflow; final batch review remains last.
