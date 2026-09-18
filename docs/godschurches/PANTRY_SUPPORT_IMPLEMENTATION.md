# Church pantry and private assistance implementation

## Verified release, September 18, 2026 UTC

**2026.09.18.3 / a251f236ab3449ab7e8149c1f214bc382ed90ee5** is READY in
**dpl_AHy8AE8PsJz8jJBoTHgXh7153gae** at **08:08:31.717 UTC**. Independent
`godschurches.com` assignment and the exact serving product/build are verified at
**08:09:45.448 UTC**. The provider trace passes with **216 traces, 71,501 entries
and 539 server JavaScript files**. The verified hydration renderer is 173,096 bytes,
SHA-256 `2b7c5f99a8710e52520e7d0dc25c9fb65fd7c06e0a1d6cfee97276e0a452a3b7`.

The [contract](PANTRY_SUPPORT_CONTRACT.md) defines the delivered authority,
consent, privacy, retention and recovery boundaries. Stock clarity, private pickup
outcomes and reviewed Needs replenishment ship in this feature cycle. Partner
referrals remain disabled pending actual partner identity and consent review.

## Delivered behavior

Church-owned hubs publish hours, access and eligibility guidance and up to twelve
counted, approximate or unavailable stock categories. Explicit
`MANAGE_CHURCH_ASSISTANCE` duties and current named coordinator consent govern
private intake. Existing members, Exchange managers and role names receive no
assistance capability automatically. Replacing or regaining duties cannot revive
old private requests or coordinator consent.

Adults submit minimal requests, see their own receipt, review and confirm an
explicit pickup offer, cancel and clear ended details. Capacity is atomic; booked
times and directions cannot silently change. Outcomes and correction reasons are
private and versioned; coordinator notes are excluded from the ordinary requester
view and export. Reports retain only selected canonical evidence and clear it when
the final retention reason expires. Account erasure and protected recovery preserve
these boundaries. No public beneficiary history is produced.

Stock adjustments preserve actor, reason and version history. Replenishment reuses
the existing Church Need editor and current Exchange publication authority. Only
reviewed public category fields enter the draft; recipient details never do.
Current source versions and permissions govern saving and linking a published Need.
Settings, Help, church context, Exchange, export, reports, Activity and separate
assistance notification choices are integrated. Phone alerts require dated opt-in.

## Isolated acceptance and regression repairs

The staged full gate covers **183 discovered files and 197 accepted executions**:
**1,167 passes, two expected skips and zero remaining failures**. Upgrade, fresh
migrations, restoration, development and production HTML/RSC, restart persistence,
all discovered suites and final fixtures are covered. Original failed attempts are
preserved separately and excluded from accepted totals after complete reruns.

The service/schema baseline is `3562b55435bdbebec66fbe8b7d1d3ffe1e85d63e`.
The final delta comprises four pantry interface components, a bounded account-return
allowlist, browser QA and two test changes. Final interface/account-entry behavior
is verified on exact application `a251f23`, rather than attributed to the earlier
baseline. The final ten-file continuation runs on that build.

All **22 pantry service checks** pass, including recipient isolation, current
coordinator consent, capacity races, immutable booked details, exact retries,
report retention/purge, export/erasure, protected restoration, origin/account pins,
database constraints and actual replenishment publication/link/revocation/closure.
The complete **18-check Needs suite** also passes in the staged gate.

The final production build passes **13 pantry browser groups**. Fictional users
configure a hub, adjust stock, create sessions, submit and retry a lost reply,
review/confirm pickup, record outcomes, prepare a replenishment draft, clear ended
details and lose stale coordinator access after revocation. Another recipient is
denied. Phone width, dark appearance and enlarged text are exercised. The earlier
integration preview also passed ten existing Needs browser groups.

Browser reproduction found successful saves with stale views. Removing the new
pantry loading boundary fixes that flow; the speculative shared timing change was
reverted to the released helper. Another reproduction found sibling-form saves
silently discarding local edits. One active edit section, unsaved Back handling and
explicit local discard now preserve those edits, including private notes.

The full gate found a real missing pantry account-return allowlist. Known pantry
pages now survive sign-in; private queries, action payloads and hashes are discarded.
**42 focused navigation checks**, **six existing guest integration checks** and an
actual isolated password sign-in back to My requests pass. The older Needs preference
fixture was also corrected to represent a shipped form predating both Needs and
assistance. Runtime preference validation was not relaxed. Local certificate,
fixture-directory and proxy-loop harness failures were corrected and rerun; their
logs remain separate from accepted application evidence.

TypeScript, changed-file ESLint, authored-copy and the exact production build pass.
No production fixtures or external recipient sends are used for isolated acceptance.

## Runtime cost and recovery

The isolated 20-recipient queue uses **51 SELECTs instead of 579**, with identical
projection hashes across five measurements. Median fixture time changes from
174.35 ms to 21.01 ms. Current permission predicates are reused within the bounded
read transaction; no authorization cache crosses requests. This is not a production
latency claim. The final queue's route JavaScript list is **526,214 bytes / 158,730
gzip**, with **21,102 bytes / 6,967 gzip** additional to the existing listing route.
These figures use the same route-manifest comparison; common layout assets are
separate.

The additive migration `20260918010000_pantry_support` introduces five pantry tables
and the explicit capability without assigning it. Fresh protected production-copy
upgrade at **06:42:25.676 UTC** passes **97 to 98 migrations**, all **135 original
table/column fingerprints**, protected replay and plaintext removal. Production
is not modified by that rehearsal.

After deployment, all **98 production and installed recovery checksums match**, with
no pending migration. Fresh installed encrypted recovery at **08:10:28.257 UTC**
restores **140 tables / 98 migrations**, removes plaintext and leaves production
unchanged. Nightly validation checks **73 sets**, with zero issues, zero removals
and no attention flag. Source and installed retention code hashes match.

## Live acceptance and limits

Live acceptance passes **43 public/privacy browser checks, six health checks and
five actual signed-in Mac groups**. Search, Home, branding and Needs regressions
remain covered. The signed-in owner sees an honest empty assistance history, the
Settings link, separate assistance choices with phone alerts off and Save disabled,
the actual unconnected church state and published release guidance. No preferences
or memberships are changed. This is not physical-phone or actual fulfillment proof.

The one reserved nonexistent-source queue probe is accepted and its native consumer
returns 200 with zero application writes. Scoped error/fatal rows are **zero** from
READY through **08:13:03.488 UTC**. Six health checks show no active alerts or attention
flag; provider delivery to a real person is not claimed.

All **135 original table/column fingerprints remain unchanged through
08:13:05.171 UTC**. Reading-cache created, expired, modified and remaining counts are
all zero. All five new pantry tables and assistance capability grant counts are
zero. Verification content, preference, relationship and other application writes
and recipient sends are zero. The additive schema deployment and single provider
queue probe are recorded separately.

Rollback follows the existing release runbook. Preserve the additive schema and any
subsequent legitimate records; do not drop tables to roll application code back.
Protected restoration retains traffic-disabled quarantine and current authority
review. Actual church operators, fulfillment pilots and physical devices remain
separate acceptance. Partner referrals require the prepared owner decision before
implementation/activation. Focused task reconciliation and the continuing priority
queue belong in the private systems; main private index propagation is still pending
connector errors.
