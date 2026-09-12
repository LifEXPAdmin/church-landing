# Adult contact implementation receipt

## Service foundation verified locally — 12 September 2026

The contact-request service implements the
[adult contact contract](ADULT_CONTACT_CONTRACT.md) through existing account,
permission, social receipt and rate-limit owners. It adds two canonical tables:
bounded immutable requests and sorted two-person conversation membership. No
message store, duplicated opening body, background worker or dependency is added.
The accepted request remains linked contact context for the conversation UI.

The existing personal preference row gains a separate request audience defaulting
to NOBODY for old and new rows. It preserves mention/privacy fields and shared
version conflicts. Create, recipient accept/decline and sender withdraw are
checked and retry-safe; one pending unordered pair and sorted conversation
uniqueness also have database constraints. Expiry, short/daily budgets, active
limits and decline cooldown are enforced. Reads paginate before projection and
exclude credentials, hidden profile fields and third-party requests.

Current blocks, unfollows, account deactivation and operator suspension revoke
pending consent through their canonical writers. Block or account reactivation
does not revive prior conversation sending. Accepted retained context remains
available only to its eligible participants. Personal requests depend on the
existing real global reporting readiness check, with no separate activation flag.
Withdrawal, decline, restricting contact and historic exact receipts remain
available while new intake is paused.

Selected-request reporting extends the existing report service; only a current
adult participant can submit that item. Explicitly authorized case review sees
its immutable purpose and participant references, never another request or whole
conversation. No automatic evidence copy is retained. Export adds only the
owner's sent requests and own request preference; another person's received
purpose is excluded from the general account export.

Fresh checks pass: 47 service/regression tests across adult contact, reporting,
friend invitations and social foundations; four HTTPS groups with fixture intake
enabled and four with intake disabled. They cover all request audiences,
eligibility, cross-account/origin rejection, exact and changed-body retries,
concurrent acceptance, expiry/cooldowns/quotas, pagination, selected evidence and
export, block/unblock, real deactivation/reactivation and operator suspension.
Types, scoped lint and production build pass. Runtime traces include 126 traces,
10,751 entries and 317 server JavaScript files, with no private fixtures,
environment files or Prisma configuration-loader path. No speed improvement is
claimed. Test diagnostics were corrected and the affected suite rerun.

Migration `20260912223800_adult_contact_foundation` is isolated-only. The new
request/preference screens, conversation interface, in-app indicators and their
integration/release acceptance remain unfinished. The next step is the required
request and preference UI, then the conversation slice using this membership.
The common reviewer/retention/erasure and physical/owner acceptance gates remain.

Production still serves `2026.09.12.24`, application `e710170`, READY deployment
`dpl_9QusbmKcg7v8ERjbYeLpsZjJSmKp`, with 33 verified migrations. No production
contact migration, contact write, reviewer grant or messaging activation is
claimed by this local checkpoint. The next release must run its complete gate,
fresh encrypted backup/restore and canonical deployment verification.
