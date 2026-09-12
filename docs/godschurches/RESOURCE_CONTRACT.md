# Shared resource contracts

September 12, 2026. This is a bounded extension contract for the existing
platform and its next settings/Exchange work. It does not activate future
modules, publish church content, or appoint a representative.

## Checkout reconciliation

The inspected application baseline is `f4fdc30`, product `2026.09.12.9`.
The clean continuation checkout also contains report-only `907aaee`.
Existing completion receipts are preserved; parent acceptance is separate.

| Candidate | Existing implementation to reuse | Remaining scope |
| --- | --- | --- |
| Shared resource identities | Post, church, event, asset and account IDs; service-specific policy below | A typed address and capability-owner inventory; no universal permission grant |
| Settings inventory/registry | `app/platform/settings/page.tsx`; account/session/email/export/lifecycle components; `reading-preferences.ts`, `relationships.ts`, `profiles.ts`, portal directory consent | Stable setting IDs, searchable folders, scope/effective-value metadata and focused adapters |
| Private draft/resume/search | `post-workspace.ts`, `community-search.ts`, shared composer and saved collections | Reuse; no new draft persistence or search backend in this batch |
| Photos and albums | `media.ts`, `personal-photos.ts`, `photo-albums.ts` and private image delivery | Reuse; no duplicate upload or new retention mechanism |
| Exchange listings/inquiries | Account lifecycle gate, church capabilities, bilateral blocks and canonical operation receipts | No Exchange table or endpoint exists; listing/reservation contracts and report readiness precede implementation |
| Groups, catalog media, independent opportunities, campaigns | Existing posts/calendars, image assets and church capabilities are dependencies | Reserved identities only; their specific services and activation gates remain outstanding |
| Reviewer/provider/physical acceptance | Existing independent-review workflow, provider receipts and owner reports | Preserve their separate owner actions; code or fixture checks cannot appoint a real reviewer |

This map covers the selected expansion, not the complete future feature catalog.
The current church-listing submission is a community church directory correction;
it is not an Exchange listing and must never be reused as one.

## Typed addresses and authority

`lib/platform/resource-contracts.ts` defines discriminated resource references.
An address identifies an existing canonical row; it never carries a copied body,
contact, signed asset URL, permission or authorization decision. The same ID in
two resource kinds refers to different resources. Keep existing IDs unchanged.
An occurrence identifies the actual `EventOccurrence`, not its series or date.
Media catalog entries remain distinct from processed image assets.

Settings use their own stable setting ID plus an explicit scope. Browser scope
contains presentation choices only; personal scope identifies the authenticated
account, and church scope identifies one selected church. These are addresses,
not trusted actor fields: a server resolves and validates the current session
and scope before reading or writing. Unavailable family and business scopes are
reserved for their owning contracts and are not accepted active scopes.

The registry names each authoritative service. `implemented` means that a
service exists, not that the current viewer can use it or a provider is enabled.
There is deliberately no generic `canEdit`, role hierarchy, audience ordering,
polymorphic content table or cross-resource write endpoint. Each service keeps
its current capability, lifecycle, audience, version and receipt checks.

## Ownership, audiences and lifecycle

| Resource | Owner and authority | Audience transitions / lifecycle |
| --- | --- | --- |
| Post | Personal author or explicit church identity; current publishing capability | PUBLIC/CHURCH changes use post validation and current church access. Reply VIEWERS/CHURCH_MEMBERS is separate. Draft/published/withdrawn states remain canonical. |
| Church | Canonical church; current scoped capability, approved claim/review/activation where required | Public community listing versus current permitted church access. Creating a listing or following a church grants no management. |
| Event occurrence | Its personal/church calendar; current calendar edit/publish capability | BUSY and DETAILS are projections, not interchangeable audiences. Sharing/current connection, event visibility, cancellation and recurrence remain governed by the calendar service. |
| Image asset | Existing target and personal/church ownership | READY is necessary, never sufficient. Every derivative rechecks the current source. Retire/cleanup respects album references even when a feature is disabled. |
| Personal photo | Personal owner; references the canonical asset | ONLY_ME/MEMBERS/PUBLIC/CHURCH transitions require current source and destination compatibility; post references preserve source audiences. Hide/delete cannot broaden access. |
| Photo album | Personal owner; references owned photos | ONLY_ME/MEMBERS/CHURCH, intersected with each source. Delete album preserves files; missing sources do not reveal cover IDs or inflate visible counts. |
| Setting | Browser presentation, session-owned personal choice or explicit church scope | No content audience transition. Church policy cannot overwrite an unrelated personal value. Registry navigation cannot change persistence ownership. |
| Exchange listing (reserved) | Adult personal owner; future church delegate requires an explicitly reviewed capability | No transitions active. Owning contract must specify public/church visibility, draft/publish/archive and prohibited categories before writes. No private pickup contact in public projection. |
| Gather group (reserved) | Adult owner; named group leadership is distinct from church grants | No transitions active. Public discovery/join approval and private membership/content require the owning group contract. Membership never appoints a church role. |
| Media catalog item (reserved) | Explicit personal/church publisher; rights/provider gate | No transitions active. A catalog record references assets/source audiences; it cannot grant access to a private original or enable native audio/video processing. |
| Volunteer opportunity (reserved) | Existing organizer/authorized church scope | No transitions active. Reuse event volunteer commitments where applicable; independent applications/approval must not create staff roles or access to children's data. |
| Fundraising campaign (reserved) | Explicit organizer/beneficiary under its review contract | No transitions active. External destination review and source-labeled progress required; no native payments or implied verified receipts. |

No universal audience ranking exists: public church content, account-only
profiles, private settings and calendar busy projections have different rules.
Widening an implemented source requires its existing explicit authorized action;
a wrapper, reference, album, search result or future module cannot widen it.

## Service boundaries and enablement

- `post-access.ts`, `post-commands.ts` and `post-workspace.ts`: revalidate current
  identity, church membership/publishing and event access. Preserve unresolved
  old `replyAudience:null`; no fallback to VIEWERS. The original entire retry
  body remains immutable, including omitted fields.
- `portal.ts`, `church-permissions.ts`, claim/listing and church-tools services:
  scope grants to the actual church and current account. Display titles,
  organization chart edges, contribution and follow state are not capabilities.
- `calendar-access.ts`, `calendar-commands.ts` and `calendar-reads.ts`: preserve
  busy-only projection, personal sharing, current church connections and
  occurrence identity. Participation/RSVP does not imply staff authority.
- `media-access.ts`, `personal-photo-policy.ts`, `media.ts`,
  `personal-photos.ts` and `photo-albums.ts`: preserve private provider checks,
  library/album switches, source audiences and reference-aware retirement.
- `account-sessions.ts`, `social-boundary.ts`, `social-operations.ts`: preserve
  locked session/lifecycle revalidation, same-origin/expected-account checks,
  body limits, exact-body receipts, independent versions and bounded queries.
  Registry lookup never substitutes for these checks.

Reserved kinds have no service or direct API route. Their registry state is
hard-coded reserved; an environment variable or client-supplied capability
cannot enable them. `requireImplementedResource` rejects reserved/unknown kinds
and returns only the capability owner's descriptor for implemented kinds.
It is a routing precondition, never permission to read or mutate a row.

When a reserved module is implemented, its reviewed server adapter must check
its activation gate before database access and before receipt replay. All direct
commands still revalidate current session/permission and preserve their owning
contract's exact-retry semantics. Do not add a flag-only escape hatch or accept
an arbitrary service name from a request. Disabled modules expose no working
mutation control; permission-denied responses omit private values.

## Upgrade and verification boundary

This contract adds no migration, backfill, provider configuration, retention,
worker or user-facing feature. Existing payloads, endpoints and successful
operation receipts keep their meaning. No release note should imply future
resources are available. Settings and Exchange acceptance must verify their
actual adapters before enabling dependent interface work.

Run the focused resource contract checks and TypeScript check. Before release,
verify unknown/reserved direct API writes remain unavailable in the built
application, and run focused regression checks only for adapters changed by
that release. Current application/live identity is recorded separately.
