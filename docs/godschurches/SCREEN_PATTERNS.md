# Shared resource screen patterns

September 18, 2026 UTC. This is the screen contract for existing and newly enabled
modules, grounded in the integrated navigation and current source components.
It defines reuse and acceptance; it does not certify every future screen or enable
an unavailable service. The [navigation registry](NAVIGATION_REGISTRY.md) supplies
working destinations, and the [resource contract](RESOURCE_CONTRACT.md) supplies
canonical identities. Current source code and newer dated receipts supersede older
reserved-state descriptions in historical reports.

## Common frame and composition

Use `PlatformShell` for the existing five primary destinations and grouped Menu.
A nested page has one descriptive page heading, a labeled contextual return link
and the current scope when that scope affects interpretation. Preserve the current
church, group, account or personal ownership distinction. A title, badge or visible
button never grants permission. Resolve current authority on the server before
selecting private data and again when an action is submitted.

Reuse `PortalHeading`, `PortalCard`, `PortalEmpty`, `portalInputClass`,
`portalButtonClass`, `portalLinkClass` and the existing `gc-button` styles where
appropriate. Match the meaning and visual hierarchy rather than wrapping every
screen in another universal component. `PortalLoading` currently says church
information; a different resource needs an accurate loading label. Existing
feature components continue to own their state and data requests.

Use links for destinations and buttons for actions. Keep the main action next to
its subject, secondary actions nearby, and destructive actions in a separately
labeled area. `ActionPopover` is a nonmodal action surface, not a confirmation or
permission boundary. Do not put a button inside a card-wide link. Preserve visible
focus, descriptive labels, headings and meaningful empty states without relying
on color. Controls must remain reachable at 320 CSS pixels and with doubled root
text. Let action rows wrap; icons must not squeeze descriptions into narrow columns.
Use existing motion preferences and avoid essential information in animation.

## Browse and bounded lists

The order is heading and scope, authorized create action, filters, current filter
summary, results, then bounded continuation. Use explicit labels and the existing
source query parser; normalize only supported query fields. Filters run with the
current audience predicate before pagination. Changing a filter resets the cursor;
a cursor cannot carry another account's scope. Show only source-approved counts,
never totals derived from inaccessible rows.

For shareable filters, use the normalized URL, an Apply action where appropriate,
removable filter chips and a clear Reset filters action. Do not copy private row
content, contact values or saved preferences into the URL. Preserve the exact
permitted query when entering detail and returning. The existing Exchange filters
and `exchangeReturnHref` are the concrete model; other resources retain their own
parsers rather than accepting Exchange query fields.

Cards show a concise, current projection and a labeled detail link. Distinguish
an empty collection from no results under the selected filters. Offer Create only
when the current actor can create; otherwise offer a permitted next step such as
clear filters or return to public browsing. Continuation uses the source's stable
cursor and explicit end state. Infinite loading is not a substitute for a bounded
reader or a usable keyboard continuation control.

## Detail and related resources

Place the title, owner/scope, current lifecycle state and relevant audience before
the body. Keep the primary permitted action visible near this context. Put Edit,
report, share and secondary actions in predictable labeled groups. Report uses
the existing report owner and exact canonical target. Sharing, saving, pinning and
following retain their distinct meanings and do not imply source access.

Related cards carry canonical references and recheck the source's current
projection. Unavailable references display only the neutral unavailable state
allowed by that source, without old titles, contacts, thumbnails or copied text.
Calendar busy-only projections remain distinct from event details. A group member
view and its public About page remain distinct. Do not use one generic audience
ranking across posts, member profiles, calendars, private inquiries and settings.

## Create, edit and explicit submission

Use the owning editor and typed fields. Show who owns the result and who may see
it before publication. Required and optional fields have persistent labels and
bounded values. Source-specific validation remains authoritative. Do not infer
contacts, exact location, rights, opt-ins or publishing consent from other fields.
A draft, preview, save and publish are different actions wherever the service
makes that distinction. Sign-in return resumes the destination without performing
the intended action automatically.

Retain unsent input after validation, transport failure and conflict. Prevent
parallel submits while a request is in flight. Preserve the exact original
request and mutation identifier when the service supports receipt-based retry;
a lost response may already represent a committed change. Confirm that request
before allowing a different edit. Never describe an uncertain response as an
unsaved change or retry it under a newly generated identifier.

On a version conflict, show the owning editor's current-data review or explicit
reload/discard path. Do not silently merge or overwrite. The post/profile editors
can review saved values; `usePrivateChoiceAction` offers reload with deliberate
local-discard confirmation. A primitive's availability does not establish the
same conflict policy for every endpoint. A confirmed save refreshes the owning
view and announces the result without destroying another dirty section.
`PrivateEditScope` coordinates sibling sections that share a version or refresh.

Use `useUnsavedSocialWork` and the existing draft/recovery owner for supported
forms. Before Back, navigation, dialog close or an app update would lose work,
require save, resolution or deliberate discard. Do not create another draft store
or persist private form data to browser storage as a convenience. Account switches
must conceal and isolate the previous account's work; it must never become the
new account's form submission.

## Confirmation sheets and action consequences

A confirmation names the verb, exact subject, scope and consequence, then offers
a clear cancel action. Focus enters the dialog, remains within a modal dialog,
and returns to a still-valid opener on close. Escape and Close use the same
unsaved-work guard. Use the existing native dialog pattern in `CommentSheet` for
modal mechanics, with action-specific copy and state. A nonmodal popover does not
trap focus. Current native confirmation prompts and explicit confirmation fields
remain valid source implementations; this contract does not claim they have all
been replaced by a custom sheet.

| Intent | Confirmation and resulting behavior | Recovery rule |
| --- | --- | --- |
| Cancel a clean form or close a clean sheet | Return to the permitted parent without submitting | No mutation to undo |
| Discard local edits | Name the local entries being discarded; warn if a request is still unconfirmed | Discarding local state cannot undo a possibly committed request; confirm the original receipt or read current state |
| Remove from a saved list, album or selection | Name the reference or selection, not deletion of its source | Source content remains; re-add only if the source is still available and the service permits it |
| Replace or remove a photo | Explain the affected profile/listing reference and use the existing media owner | Failed replacement preserves the previous image; cleanup and remaining references follow the source lifecycle |
| Archive, withdraw or unpublish | Use the source's exact lifecycle verb and explain loss of ordinary visibility | Restore/republish only if that source supports it and current permission and validation pass; never imply an automatic undo |
| Leave, revoke, decline or cancel a commitment | Identify the group, relationship, consent or capacity affected | Rejoining or reopening must not revive old private consent, membership epochs, grants or expired capacity |
| Reset settings | Name the setting or selected scope and the exact defaults | Preserve unrelated values; no global reset hidden behind a folder-level control |
| Permanent deletion | Use the existing account/source deletion review, reauthentication and typed confirmation where required | State actual irreversibility and retention exceptions from the owning lifecycle; do not promise restoration or a generic undo |

A destructive action is never the default focused submit solely because it is the
primary action in a confirmation. Disable duplicate submission, announce success
or uncertainty, and keep cancellation distinct from mutation failure. The source
handler must still revalidate account, scope, version and any sensitive-action
proof after the person confirms.

## Loading, empty, failure, denial and offline states

| State | Required presentation and permitted next step |
| --- | --- |
| Initial loading | Accurate resource label and a status/busy announcement; decorative skeletons contain no invented private content |
| Refreshing current data | Keep safe context only while current access remains confirmed; show progress and block conflicting actions |
| Empty | Explain that there are no items in the current permitted collection and give an authorized next step |
| No matches | Keep the selected filter summary and offer Clear or Edit filters; do not imply that the underlying collection is empty |
| Invalid fields | Associate actionable messages with the relevant inputs and preserve entered values; validation is not a successful save |
| Temporary read failure | Show a clear retry plus a safe exit; preserve query and local work; never replace an error with a zero count |
| Save response lost | Explain that the change may be saved; expose the source's original-request confirmation and prevent an unrelated retry |
| Conflict | Keep local entries, explain that saved data changed, and require the owning review/reload path before another save |
| Signed out | Use the existing contextual account entry and safe same-origin return; no automatic action after sign-in |
| Current permission denied, removed or withdrawn | Conceal private data, actions and cached previews; use the source-approved neutral unavailable message and safe parent destination |
| Additional authenticator proof required | Reuse the existing challenge for the exact purpose; retain work without granting the protected action |
| Offline or access freshness unknown | Explain that a connection is needed, retain supported unsent work in the open tab, conceal stale private snapshots and retry after reconnecting |
| Feature/provider unavailable | Hide unusable navigation/actions or explain the source's existing unavailability; do not render an enabled placeholder or silently enable a fallback provider |

Use `PortalRetry` or a source-specific equivalent for retry, and the existing
route-error boundary for an unexpected page failure. Expected denial is handled
by the source without sending forbidden fields to a client component. Status and
error messages must be announced without moving focus away from retained input
unnecessarily. A reset/reload that discards input needs a deliberate choice.

`PrivateSnapshotGuard`, `TopicReadBoundary`, source readers and their checksum or
current-account checks own freshness. On blur, offline, return or account change,
follow the relevant existing boundary; navigation history is not authorization.
The application remains [online first](INSTALLATION_CONTRACT.md): this pattern
adds no service worker, private offline response cache or background mutation queue.

## Back, focus and retained state

Use the existing bounded return contract for the feature. `exchangeReturnHref`
permits normalized result pages, and `ExchangeSearchPosition` stores only an
account boundary, route and bounded scroll number in history. Church return
context names a known view and permitted focus target rather than an arbitrary
URL. Settings retains its bounded folder/search focus map and clears it across
account changes. Reader and discussion navigation keep their own source context.

Restore position only after current access is confirmed. If the old row, field or
opener no longer exists, focus the safe current heading or collection action;
never reconstruct removed content to satisfy Back. A stale membership, block,
withdrawal or account switch invalidates the prior private presentation. Every
new cross-feature journey must verify query, scope, scroll, focus and dirty-work
behavior rather than assuming that matching page chrome proves history safety.

## Resource-to-pattern map

Each entry in `resourceContracts` has one composition below. Implemented means an
owner exists, not that every viewer is authorized. This table adds no registry
entries, routes or generic mutation endpoint.

| Canonical resource | Composition and existing owner to reuse | Specific boundary |
| --- | --- | --- |
| `post` | Browse/reader, detail/discussion, existing composer and action forms | Preserve current post/reply audience, church publishing and private draft receipts |
| `church` | Directory browse, public detail, separately scoped management forms | Listing, following, membership and management grants remain distinct |
| `eventOccurrence` | Agenda browse, occurrence detail, calendar/event editor | Busy/details projection, occurrence identity, timezone and RSVP/cancellation/capacity stay calendar-owned |
| `imageAsset` | Source-owned upload/status and authorized image display | No independent public asset browser or writable client storage key |
| `personalPhoto` | Owned library browse, photo viewer, existing upload/appearance controls | Every size and source reference rechecks the current photo audience |
| `photoAlbum` | Owned collection browse, detail, ordered reference editor | Removing an album/reference does not delete its source photos |
| `setting` | Grouped/searchable settings browse and owning control detail | Explicit browser/personal/church scope; reset only the named choice |
| `exchangeListing` | Filtered browse, listing detail, `ExchangeEditor` | Owner/scope, validated publication, exact retry and current lifecycle; no private handoff fields in public cards |
| `pantryHub` | Hub browse/detail, coordinator forms, private request status | Published hub information is separate from private recipient and appointment data |
| `exchangeInquiry` | Own bounded handoff list, private detail, consent/action forms | Participant access and explicit private disclosure; no public list or copied contact fields |
| `gatherGroup` | Public browse/About, permitted member detail, leader forms | Join policy and current membership/leadership; public discovery cannot expose members or discussion |
| `mediaCatalogItem` (reserved) | Future browse, detail/source state, publisher editor | Source, rights, provider and audience adapters must exist before usable entry or action |
| `volunteerOpportunity` (reserved) | Future browse/detail/application flow | Independent application/coordinator contract required; current event volunteer slots stay with their existing owner |
| `fundraisingCampaign` (reserved) | Future browse/detail/organizer form | Reviewed beneficiary/destination and source-labeled progress; no inferred native payments or verified receipt |

Exchange Needs composes the listing, canonical event-volunteer capacity and
contribution owners; it does not create a parallel volunteer resource. Gather
uses the group owner plus existing post and event owners. Existing profiles,
messages, notifications, support and admin screens use the same browse/detail/form
hierarchy with their own private readers, conversation or operational scopes.
A profile is not a public church listing; reading a notification is not reading a
message; an admin queue is not a public search page.

For the named future navigation areas, Media uses the reserved catalog composition;
Businesses uses browse/detail/management forms only after its representation and
resource contracts exist; Foundry uses browse/detail and owner-defined creation or
participation forms only after its source contracts exist. Neither has a usable
placeholder today. Future playlists, clips, artist releases, learning resources,
healthy-use and family controls also select from these same patterns, with their
own source, consent, rights and child-policy gates. A planned screen shape cannot
substitute for any of those owners. Register only an implemented destination after
its resource-specific end-to-end acceptance.

## Adoption and verification

Before adding a screen, record its canonical owner, current audience/scope, one
of the compositions above, entry/return contract, primary action, destructive
consequences, exact retry/conflict behavior and each applicable state in the table.
Name unsupported actions explicitly; do not invent a generic default. This is a
per-feature implementation checklist, not a second permission or data system.

For a changed runtime, verify its complete browse to detail to action to Back
journey, reload and second tab, validation failure, committed-but-lost response,
stale version, offline/reconnect, account switch and revoked source. Include
keyboard/Escape/focus restoration, 320/390/1440 widths, doubled text, long labels,
reduced motion and privacy in both HTML and serialized responses. Use fictional
isolated fixtures and the feature's required gates; physical-device acceptance
remains separate. Cross-feature Back verification and persisted Menu shortcuts
retain their separate acceptance tasks.

This change is documentation only. The patterns were reconciled against the
current navigation/resource registries, Exchange/Gather/calendar components,
settings and installation contracts, private snapshot/edit/retry hooks and native
dialog behavior. All six existing navigation/resource tests pass. The mapping
covers all 14 current resource kinds; all four local document links resolve.
Website copy, private-reference inspection and diff checks pass. No runtime files
changed, so no new build or browser acceptance is claimed. No query, JavaScript, dependency, migration,
provider configuration or runtime behavior is added. A1 integrates this contract;
future implementation acceptance still requires actual journey evidence.


## Integrated publication acceptance

A1 published this contract on main in `0ced807adaa33be0a6cb0dda7ef29fc4e77bcfef`.
The automatic production deployment `dpl_AXpw5kcv8W2EJ46zqUq3Z4gRuwz5` became
READY on September 18 at 18:44:32 UTC; the canonical domain and serving identity
matched at 18:45:14 UTC. Product version remains 2026.09.18.8 because application
code is identical to the already-verified `28f6909` runtime. The intervening
changes contain only engineering documents and membership acceptance helpers.

Six navigation/resource tests pass on the merged source. The provider build
passes all 223 runtime traces with no pending migrations. Fresh live checks pass
17 public/privacy groups and six health checks with zero browser errors. The
one-shot native queue probe completes; scoped runtime error/fatal rows are zero
from READY through 18:45:55 UTC. All 100 migration and installed recovery checksums
match; the recent encrypted restore covers 144 tables. All 144 production table
fingerprints remain unchanged through 18:46:30 UTC. Verification application
writes and recipient sends are zero.

This completes the published screen-pattern definition. It does not activate a
reserved resource or certify future screens, new Menu shortcuts, the separate
cross-feature Back journey, or physical-device acceptance. The prior full runtime
and signed-in acceptance remains applicable evidence; it was not rerun merely
for documentation.
