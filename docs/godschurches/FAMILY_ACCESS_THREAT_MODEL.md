# Family access threat model and server contract

## Status, scope and trust assumptions

September 18, 2026 definition candidate on integrated `bea3ba3`. This is a
pre-implementation authorization map and adversarial acceptance plan. It changes
no runtime, age classification, family relationship, permission or launch state.
The accepted [family decision record](FAMILY_LAUNCH_DECISION.md) leaves child
social access closed and names unresolved qualified review, guardian evidence,
age, consent, recovery, operating and pilot decisions. Those decisions remain
required; this technical model does not invent their answers or certify safety.

The present `portal-policy.ts` adult eligibility checks current verification,
adult-policy acknowledgment and account lifecycle. A self-acknowledgment is not
independent age assurance or guardian verification. There is no implemented
supervised session, child-policy resolver or active family settings scope.
Existing adult services must keep their actual checks; a future child action
cannot pass by marking a child adult-acknowledged or reusing an adult session.

`withOwnedSession` establishes current session/account state, not adult
acknowledgment or independent age verification. `postContext` records eligibility,
while public post/search/media readers intentionally support their public
audiences. Do not relabel all current reads as adult-only or infer a missing child
resolver from a working adult or guest response.

Protect child identity, contacts, content, tags, media, schedules/location,
guardian evidence, private reading and activity data, policy versions, credentials,
consent and revocation. Threat actors include an unrelated or blocked adult,
another child, a formerly authorized guardian, a compromised account, a church
operator exceeding scope and an authenticated client submitting forged state.
Client payloads, URLs, local storage, cookies, device clocks, UI labels, queued
work and cached projections are untrusted authority inputs. Opaque IDs and secret
links reduce accidental disclosure but never authorize an action.

No assertion here means anonymous public websites can reliably identify a child
or prevent that person from browsing public material elsewhere. The future
authenticated child interface must apply its own policy without silently falling
back to a guest projection after denial. Existing ordinary public help remains
public under its own contract; child-specific essential access still needs the
reviewed source allowlist and safe routing decision.

## One current server decision

The future family owner supplies one policy resolver consumed by each enabled
source adapter. This is a required architecture, not a resolver exported by the
current code. It must distinguish the authenticated actor, the subject whose data
or capability is affected, and any current delegation between them.

1. Authenticate the actual session and check expiry, credential version,
   revocation and account lifecycle. A client `actorId`, `parentId`, route child
   ID, church grant or remembered family selector cannot replace the actor.
2. Resolve the subject from current server identity and the requested resource.
   Reject unsupported/unknown subject classification and action. A supervised
   session cannot switch to an adult subject or use an adult endpoint as fallback.
3. Require the accepted release scope, approved age/consent state and current
   policy version for that exact action. Missing, conflicting, expired,
   recovery-pending or unavailable policy is not an allow decision. Any essential
   exception must be an explicit separately reviewed source action, not a route
   prefix or a broad feature label.
4. For a guardian action, resolve an active verified relationship to this exact
   subject, allowed operation and delegation version. A relationship alone does
   not grant every operation, impersonation, content authorship, private-message
   reading, export, delegation or access to adult data. Pending/revoked links and
   disputes follow the accepted family policy, never the last cached selection.
5. Intersect that decision with the canonical source's current ownership,
   membership, audience, relationship/block, moderation, retention and required
   provider/source checks. All required checks must allow; no family grant widens
   the source audience or creates a church capability. Evaluate both relevant
   parties for contact/invitation actions.
6. Produce an action-specific projection or denial. A list/count/facet, image
   derivative, notification, export or receipt is also a projection. Denial must
   not reveal hidden names, guardian relationships, content, locations, source
   URLs or IDs through error text, metadata or a different lookup route.
7. For a mutation, recheck within its existing serialized transaction/locking
   boundary before committing the write and its minimal receipt. Bind current
   policy/delegation versions to the command. Concurrent revocation/policy
   narrowing must prevent a later stale-authority commit, and stale edits must
   not overwrite a newer policy. Recheck current authority before returning an
   old successful-operation receipt; idempotency is not a bypass.

A decision may carry internal policy/authority versions and a stable reason code
for the source adapter, with a separately filtered user explanation. It is not a
bearer grant to reuse indefinitely, export to another source or trust on the
client. Every relevant server request resolves current authority. Streaming,
cached and delayed operations need their own current-access checkpoint before
each protected delivery/action, plus revocation invalidation; a bounded cache TTL
alone does not satisfy “next request uses the new policy”.

## Current source owners and future child checks

These owners exist for the adult/public product. Naming one does not say that it
already accepts a child policy or that its adult tests verify child safety.

| Surface and current owner                                                                                                       | Required future child/guardian boundary                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Session and account access: `account-sessions.ts` `withOwnedSession`, account lifecycle/recovery owners                         | Keep current locked credential/lifecycle checks. A supervised identity/session must be distinguishable server-side; account recovery changes credentials, not guardian evidence or family powers.                                                                                                     |
| Posts and private drafts: `post-access.ts`, `post-commands.ts`, `post-workspace.ts`                                             | Resolve read, draft, publish, comment, mention, poll, volunteer and reshare separately. Preserve original source/reply audiences and current eligibility; a permitted read is not permission to interact or disclose a private draft.                                                                 |
| Search/discovery: `community-search.ts`, source-readable predicates                                                             | Apply child policy before results, counts, facets and suggestions. Reject hidden-person/contact lookup and guessed URLs; query or notification side channels cannot discover another child's identity.                                                                                                |
| Contacts and DMs: `adult-contact-policy.ts` `contactPolicy`, `adult-contact.ts`, `adult-message-policy.ts`, `adult-messages.ts` | Current services are adult-only. A future child contact needs separately accepted policy plus current bilateral blocks/consent; request acceptance, membership and message sending stay separate. Neither guardian identity nor an old accepted conversation bypasses a blocked adult.                |
| Photo tags: `photo-tag-policy.ts`, `photo-tags.ts`, `photo-tag-reads.ts`, `photo-tag-notification-source.ts`                    | Target eligibility, source access, approval and removal must intersect with child policy. A tag suggestion, pending approval, old receipt or activity row cannot expose a hidden child or private image.                                                                                              |
| Media delivery: `media-access.ts`, `personal-photo-policy.ts`, canonical image/source owners                                    | Check original and derivative delivery, captions/metadata, album cover, source reference and any future catalog playback. A permitted wrapper/guardian view cannot widen a private asset or cause an unauthorized provider request.                                                                   |
| Groups: `group-policy.ts` `groupContext`, `currentGroupInvitation`, `requireGroupParticipation`; `group-commands.ts`            | Resolve invitation, joining, member roster, leadership, posting and moderation independently. Group leaders/church delegates are not guardians. Apply child contact/block policy to both parties; cached invitations and renewed membership must not resurrect revoked consent.                       |
| Exchange and handoff: `exchange-policy.ts`, `exchange-listings.ts`, `exchange-handoff-policy.ts`                                | Current adult eligibility, owner/church authority and readable listings remain canonical. A future permitted browse does not permit listing, inquiry, pickup location disclosure, reservation, payment or offline meeting. Guardian permission cannot substitute for each separately approved action. |
| Location and contact disclosure: `discovery-preferences.ts`, discovery-place owners, portal directory preferences               | Preserve owner-private area choices and independently consented directory fields. Do not expose exact child location, school, schedule or authentication contact via radius, shared household/church context, search, exports or another member's card.                                               |
| Calendar: `calendar-access.ts` `calendarContext`, `sharedLevel`, `eventAccess`, `projectOccurrence`; `calendar-commands.ts`     | Distinguish busy/details, location, attendee/RSVP data, edit/publish and volunteer authority. A family link is not a calendar share; a guardian action cannot copy private event logistics into wider content or a public preview.                                                                    |
| Church/delegated authority: `church-permissions.ts` `effectiveChurchGrants`, portal role/grant owners                           | Current scoped church grants do not establish guardianship. Proposed guardian authority must use its own reviewed relationship/evidence scope, without granting church roles, self-approval or powers over another subject.                                                                           |
| Time, reading, settings and history: `settings-contract.ts`, existing adult reminder and family decision contracts              | No active family scope/resolver or tracker exists here. Optional adult nudges cannot enforce child limits; future history disclosure/export needs explicit reviewed subject/guardian permissions, not assumed parental access.                                                                        |

Additional indirect delivery owners must participate in the same source check:
`public-sharing.ts` and `share-preview-response.ts` intersect public/current-viewer
access and recheck generated previews; `post-reads.ts` owns current availability
and visible counts. `media.ts` checks image authority before and after storage
I/O, and `media-boundary.ts` delivers protected bytes without exposing the storage
URL. `notification-source.ts`, photo-tag notification sources and
`notification-outbox.ts` recheck recipient/source state at delivery and open.
Future child adapters must cover those paths, including generated PNGs, pending
outbox entries and permission changes during I/O, not only the detail-page loader.

For each implemented child surface, record the exact server entry points, accepted
action set, current resolver call, source predicate/projection and executable
negative test. Missing adapters stay disabled. Do not wire every feature through
a permissive catch-all endpoint or add `familyAllowed: true` to generic resource
references. Existing types that exclude family scopes must be extended deliberately
by the owning reviewed implementation, never bypassed with casts.

## Abuse cases and required negative evidence

| Case                                        | Required denial/invariant and later test                                                                                                                                                                                                               |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Forged parent/guardian/child IDs            | An unrelated adult cannot link, select, approve, reset, export or edit another subject by submitting IDs. Exercise body, query, nested JSON and route variants; no relationship/policy/audit grant is created on failure.                              |
| Direct API, alternate verb and stale UI     | Denied child actions remain denied without using the UI. Call read/write endpoints, bulk/detail variants and historical command receipts directly; no side effect, private payload or source token escapes.                                            |
| Old session after revocation or restriction | Revoke actor credentials, guardian relationship or subject policy, then replay the old session/receipt and queued action. The next relevant request/delivery uses current denial; no cached allow survives account recovery.                           |
| Guessed child/private-resource URL          | Existing, deleted and nonexistent forbidden IDs yield the same safe unavailable projection. Check HTML/RSC/API, image derivatives, previews, search counts, cursors and metadata without revealing the target's identity.                              |
| Blocked adult contact                       | Test both block directions before request, acceptance, send, notification and delayed delivery. Group invitation, event role, a mutual church, another guardian and unblock/refollow cannot bypass or restore revoked consent automatically.           |
| Guardian overreach or sideways delegation   | A legitimately scoped guardian cannot acquire another child, read unspecified private data, delegate powers they do not have, impersonate authorship, grant church duties or satisfy their own required independent review.                            |
| Pending, disputed or revoked authority      | Pending invitations, conflicted guardians and expired evidence never become the most permissive union of powers. Exercise revocation racing an edit/export; only the reviewed dispute/essential-access policy may choose a limited outcome.            |
| Wrapper and cross-feature laundering        | A post, tag, group, saved item, playlist, calendar, QR/share URL or export cannot make a denied source readable. Test every required dependency and optional-field omission without wider fallback.                                                    |
| Policy race and retry                       | Narrow authority while a read/write/worker is pending. Prove the chosen serial order and safe projection; stale version/body retries cannot create an extra grant or resurrect a deleted/withdrawn resource.                                           |
| Clock, birthday and device manipulation     | Local clock, editable date, adult UI route, new device or cookie cannot age-promote a subject, end a managed rule or restore consent. Transition decisions use the separately accepted authoritative policy/evidence.                                  |
| Essential-access bypass                     | Allowed help/recovery/logistics actions do not open general messaging, discovery, feeds or third-party embeds through a deep link, related item, search or “continue” action. Denied ordinary actions cannot be relabeled essential by the client.     |
| History, backup and provider leakage        | Old backup restore, export queue, browser Back/account switch, logs, screenshots generated by the app and provider callbacks preserve current removals and disclosure limits. No token-bearing/private URL enters public metadata or operational logs. |

Use only fictional isolated identities/data for these cases. Do not enroll a real
child, create a live test victim, send a message to a real family or collect
guardian documents to make the test pass. Test results must identify whether they
verify existing adult policy, a mock resolver or an actual integrated child
adapter. A mock allow/deny matrix is not evidence of independent age assurance,
real guardian authority, provider compliance or a release-ready family product.

## Asynchronous, recovery and operational boundaries

Queue jobs retain minimal canonical references and the intended action, not a
copied authorization result or unrestricted private body. Resolve current source,
subject, recipient and relationship/policy at execution and before delivery. Old
jobs and historical receipts cannot reissue withdrawn consent or hidden material.
Already downloaded information cannot be recalled; the interface must not promise
that a later restriction deletes a recipient's independent copy.

Protected recovery must preserve newer guardian revocations, policy narrowing,
consent withdrawal and erasures over an older database snapshot. Do not regenerate
missing policy by guessing from a restored church role or prior message. Quarantine
unresolved authority; record the minimal review state without restoring access.
Keep source-specific retention and evidence owners instead of duplicating child
content or guardian documents into generic audit/operation logs.

Support/reviewer authority is an independently scoped operational role. A family
dispute does not create broad admin browsing, a new guardian, a bulk export or
permission to read all private conversations. Any emergency/escalation exception
needs the qualified policy, trained operator and auditable source-specific path
identified in the decision record. This model creates no exception, engagement,
staffing promise or external reporting action.

Release evidence must bind the approved policy and module/action allowlist to the
actual schema, build and enabled endpoints. Require independent review of the
adversarial matrix, exact combined runtime/browser checks, bounded provider/data
flows, tested stop/rollback behavior and the named operational/pilot approvals.
Blocking critical findings or missing required decisions keep child launch closed.
Public documentation may record technical status; guardian evidence, reviewer
identities and private cases remain in their permitted private systems.

## Verification boundary

The inspected baseline still has no child-policy implementation. Four selected
existing tests pass with zero failures/skips in an isolated fictional database:
expired/revoked/stale/suspended sessions, both-participant adult eligibility and
receipt replay, bilateral block/reconsent behavior, and unverified/unacknowledged
church access/grant denial. The A2 Prisma client was regenerated from this branch
before those checks. A bounded read-only review confirms the public-read versus
sensitive-action distinction and the indirect media/preview/notification owners.
Copy, document formatting, source-path/local-link, private-reference and diff
checks pass. No new full-suite or browser result is claimed.

These checks preserve existing boundaries only; they do not execute the future
child matrix above. This definition requires no migration, dependency,
configuration, new provider or production mutation. Test writes were confined to
fictional local fixtures. A1 integration/definition acceptance remains separate
from qualified decisions, implementation and explicit child launch approval.
