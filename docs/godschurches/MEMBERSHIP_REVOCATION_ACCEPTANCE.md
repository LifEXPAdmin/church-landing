# Membership revocation across current resources

## Existing implementation accepted, September 18, 2026

The canonical church leave/remove workflow and current resource owners already
enforce the expanded membership boundary. This audit adds integration and built
browser regression coverage; it changes no application, schema, dependency,
permission, retention policy or production configuration. The inspected runtime
matches the verified `2026.09.18.8 / 28f6909` release (runtime `f36d02c`).

| Resource | Current authority and retained-data rule | Acceptance |
| --- | --- | --- |
| Church directory, duties and calendar shares | `portal` ends the connection and resets related directory preferences, role contributions, grants, appointments and sharing. The personal account is preserved. | Existing portal, church-assignment and calendar tests in the complete release gate. |
| Post search, bookmarks and feed cursors | Current `postContext` and source predicates reauthorize each read, including previously signed page cursors. Owned saved references never grant source access. | Fresh canonical LEAVE and REMOVE tests hide search excerpts, saved source IDs and retained feed content; built views conceal on resume, reload and Back. |
| Image originals and derivatives | `media` rechecks the source for every private application URL. Delivery is proxied without a provider redirect and uses private/no-store headers. | Each of original, large, medium and thumbnail succeeds before departure and returns 404 afterward, including old URL/query and conditional/range headers. This does not claim previously downloaded bytes can be recalled. |
| Exchange favorites and private requests | Favorites retain an owned opaque choice while projecting a hidden listing as null. Request source and connection epochs invalidate old consent, including after reapproval. | Fresh LEAVE/REMOVE tests cover listing reads, favorites, outgoing requests and immutable retries. The signed-in built listing view and API deny the removed source. |
| Structured Needs and Pantry | Existing source, current audience and named duty epochs govern contribution/request projections. Public counters cannot reveal private rows. | Current Needs and Pantry authorization, source-change, privacy and retention tests passed in the complete .8 release gate. Their separate implementation receipts remain applicable. |
| Official church groups | Church connection plus explicit current group-management authority governs the named leader. A changed authority epoch cannot silently resume the prior duty. Group participation remains its separately consented membership, not an automatic church membership. | A fresh canonical church departure hides official group content and does not revive it on reapproval. An independent personal group and its permitted history remain intact. Group-member removal, drafts, media, notifications and export regressions passed in the release gate. |
| Activity, push and optional email | Current source access is checked at projection, delivery and link opening; generic notifications do not carry a copied private body. | Canonical church-removal notification and optional-email regressions are checked separately. Optional social email remains disabled in production pending its real provider gate. |
| Personal retained data | Church departure is not account deletion. Personal public posts, authored unsent drafts and safe owned receipts remain under their existing contracts. Hidden source content is not included merely because a bookmark or old request survives. | Fresh tests preserve personal posts/drafts/account state while denying revoked sources. Existing export/erasure/protected-restore tests remain part of the complete release gate. |

## New verification

Three cross-module service tests pass in the separate fictional database. Both
LEAVE and independent-reviewer REMOVE use the actual `portalCommand`, rather
than directly editing connection state. The third scenario covers official
group authority and independent personal retention. Two focused existing
notification regressions also pass freshly: church-only follower Activity/push
and church-removal reply/Like email cancellation and old-link denial. TypeScript,
focused lint and whitespace checks pass.

Four built HTTPS browser groups pass on the exact archived .8 runtime with zero
browser errors. For each transition, four already-open views (post, bookmarks,
search and Exchange listing) recheck access, conceal private text, and remain
concealed after reload and Back. Direct current APIs return the expected
availability, empty search or 404 response with no-store headers. The denied
Exchange screen was visually inspected at a narrow viewport. This is simulated
desktop-browser coverage, not a physical-phone or real congregation test.

The recent complete 188-file release gate passed 1,214 tests, two expected skips
and zero failures before these new tests were added. It is existing evidence,
not a claim that the complete suite was repeated for this test-only change.
The new file is discovered automatically by the standard support gate.

Initial failed test attempts are preserved. An opaque historical inquiry receipt
can replay after reapproval without reviving its revoked request; read projection
denies access immediately and a later permitted command settles durable state.
The accepted test verifies that distinction. Fixture group names were made
unique. Browser waits now follow actual access responses and the expected 404
page, rather than waiting for all background requests to stop or requiring the
normal page shell on a denied route. No application guard was changed to make
these checks pass.

## Release and scope boundary

No new product release is needed for the already-live behavior. Application
runtime delta, client bytes, database queries and provider requests introduced
by this change are zero. New tests and this receipt are a local engineering
checkpoint until their next normal integration. The .8 deployment and live
verification remain recorded in [its release receipt](NAVIGATION_GUIDANCE_ACCEPTANCE.md).

Future catalog media, child access, broader group messaging and other reserved
resources must adopt their own current-source adapters when implemented. This
acceptance does not activate them or waive real policy, operator, provider,
physical-device or pilot gates.
